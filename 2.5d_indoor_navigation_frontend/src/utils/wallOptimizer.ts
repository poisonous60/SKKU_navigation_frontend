import { isDrawableRoomOrArea } from "./drawableElementFilter";

export interface MergedWall {
  A: [number, number];
  B: [number, number];
  classification: "exterior" | "corridor-room" | "room-divider";
}

interface RawEdge {
  A: [number, number];
  B: [number, number];
  sourceType: "room" | "corridor";
}

interface UniqueEdge {
  A: [number, number];
  B: [number, number];
  count: number;
  hasRoom: boolean;
  hasCorridor: boolean;
  classification: "exterior" | "corridor-room" | "room-divider";
}

// --- Phase 1: Coordinate Snapping ---

const SNAP_DECIMALS = 7; // 0.0000001 degree ≈ 1cm resolution
const SNAP_FACTOR = Math.pow(10, SNAP_DECIMALS);

function snap(value: number): number {
  return Math.round(value * SNAP_FACTOR) / SNAP_FACTOR;
}

function snapPoint(p: number[]): [number, number] {
  return [snap(p[0]), snap(p[1])];
}

function ptKey(p: [number, number]): string {
  return p[0] + "," + p[1];
}

function edgeKey(a: [number, number], b: [number, number]): string {
  const ka = ptKey(a);
  const kb = ptKey(b);
  return ka < kb ? ka + "|" + kb : kb + "|" + ka;
}

// --- Phase 2: Edge Collection ---

function collectEdges(geoJSON: GeoJSON.FeatureCollection): RawEdge[] {
  const edges: RawEdge[] = [];

  for (const feature of geoJSON.features) {
    if (!isDrawableRoomOrArea(feature)) continue;
    const indoor = feature.properties.indoor;
    if (indoor !== "room" && indoor !== "corridor") continue;

    const coords = (feature.geometry as GeoJSON.Polygon).coordinates[0];
    const sourceType = indoor as "room" | "corridor";

    for (let i = 0; i < coords.length - 1; i++) {
      const A = snapPoint(coords[i]);
      const B = snapPoint(coords[i + 1]);
      if (ptKey(A) === ptKey(B)) continue; // skip degenerate
      edges.push({ A, B, sourceType });
    }
  }

  return edges;
}

// --- Phase 3: Edge Deduplication ---

function deduplicateEdges(edges: RawEdge[]): UniqueEdge[] {
  const map = new Map<string, UniqueEdge>();

  for (const edge of edges) {
    const key = edgeKey(edge.A, edge.B);
    const existing = map.get(key);

    if (existing) {
      existing.count++;
      if (edge.sourceType === "room") existing.hasRoom = true;
      if (edge.sourceType === "corridor") existing.hasCorridor = true;
    } else {
      map.set(key, {
        A: edge.A,
        B: edge.B,
        count: 1,
        hasRoom: edge.sourceType === "room",
        hasCorridor: edge.sourceType === "corridor",
        classification: "exterior",
      });
    }
  }

  // Classify
  for (const edge of map.values()) {
    if (edge.count >= 2 && edge.hasRoom) {
      edge.classification = "room-divider";
    } else if (edge.hasRoom && edge.hasCorridor) {
      edge.classification = "corridor-room";
    } else if (edge.hasRoom && !edge.hasCorridor) {
      // Check if this room edge is sub-segment of a corridor edge
      // For now, classify as exterior (corridor sub-segment detection in merge phase)
      edge.classification = "exterior";
    }
  }

  // Detect room edges that lie on corridor edges (sub-segment containment)
  const corridorEdges = edges.filter((e) => e.sourceType === "corridor");
  for (const ue of map.values()) {
    if (ue.classification !== "exterior" || !ue.hasRoom) continue;

    for (const ce of corridorEdges) {
      if (isPointOnSegment(ue.A, ce.A, ce.B, 0.000001) && isPointOnSegment(ue.B, ce.A, ce.B, 0.000001)) {
        ue.classification = "corridor-room";
        break;
      }
    }
  }

  return Array.from(map.values());
}

function isPointOnSegment(P: [number, number], A: [number, number], B: [number, number], tolerance: number): boolean {
  const ABx = B[0] - A[0];
  const ABy = B[1] - A[1];
  const APx = P[0] - A[0];
  const APy = P[1] - A[1];
  const lenAB = Math.sqrt(ABx * ABx + ABy * ABy);
  if (lenAB < 1e-10) return false;

  // Cross product = distance from point to line
  const cross = Math.abs(APx * ABy - APy * ABx) / lenAB;
  if (cross > tolerance) return false;

  // Dot product = parametric position
  const t = (APx * ABx + APy * ABy) / (lenAB * lenAB);
  return t >= -tolerance / lenAB && t <= 1 + tolerance / lenAB;
}

// --- Phase 4: Collinear Edge Merging ---

function mergeCollinearEdges(uniqueEdges: UniqueEdge[]): MergedWall[] {
  // Build endpoint adjacency map
  const endpointMap = new Map<string, number[]>(); // ptKey -> edge indices

  for (let i = 0; i < uniqueEdges.length; i++) {
    const e = uniqueEdges[i];
    const kA = ptKey(e.A);
    const kB = ptKey(e.B);
    if (!endpointMap.has(kA)) endpointMap.set(kA, []);
    if (!endpointMap.has(kB)) endpointMap.set(kB, []);
    endpointMap.get(kA)!.push(i);
    endpointMap.get(kB)!.push(i);
  }

  const visited = new Set<number>();
  const result: MergedWall[] = [];

  for (let i = 0; i < uniqueEdges.length; i++) {
    if (visited.has(i)) continue;
    visited.add(i);

    const ref = uniqueEdges[i];
    const refDir = normalize(ref.A, ref.B);

    // Collect all points in this collinear chain
    const chainPoints: [number, number][] = [ref.A, ref.B];
    let classification = ref.classification;

    // Extend from B endpoint
    let currentKey = ptKey(ref.B);
    let extending = true;
    while (extending) {
      extending = false;
      const candidates = endpointMap.get(currentKey) || [];
      for (const ci of candidates) {
        if (visited.has(ci)) continue;
        const cand = uniqueEdges[ci];
        if (!areCollinear(refDir, ref.A, cand.A, cand.B)) continue;

        visited.add(ci);
        // Add the "other" endpoint
        const otherPt = ptKey(cand.A) === currentKey ? cand.B : cand.A;
        chainPoints.push(otherPt);
        currentKey = ptKey(otherPt);
        if (cand.classification === "corridor-room") classification = "corridor-room";
        extending = true;
        break;
      }
    }

    // Extend from A endpoint
    currentKey = ptKey(ref.A);
    extending = true;
    while (extending) {
      extending = false;
      const candidates = endpointMap.get(currentKey) || [];
      for (const ci of candidates) {
        if (visited.has(ci)) continue;
        const cand = uniqueEdges[ci];
        if (!areCollinear(refDir, ref.A, cand.A, cand.B)) continue;

        visited.add(ci);
        const otherPt = ptKey(cand.A) === currentKey ? cand.B : cand.A;
        chainPoints.push(otherPt);
        currentKey = ptKey(otherPt);
        if (cand.classification === "corridor-room") classification = "corridor-room";
        extending = true;
        break;
      }
    }

    // Find extreme points along the chain direction
    const projections = chainPoints.map((p) => ({
      t: p[0] * refDir[0] + p[1] * refDir[1],
      point: p,
    }));
    projections.sort((a, b) => a.t - b.t);

    result.push({
      A: projections[0].point,
      B: projections[projections.length - 1].point,
      classification,
    });
  }

  return result;
}

function normalize(A: [number, number], B: [number, number]): [number, number] {
  const dx = B[0] - A[0];
  const dy = B[1] - A[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  return len > 0 ? [dx / len, dy / len] : [1, 0];
}

function areCollinear(
  refDir: [number, number],
  refPoint: [number, number],
  A: [number, number],
  B: [number, number]
): boolean {
  const dir2 = normalize(A, B);

  // Check parallel (cross product near zero, allow opposite direction)
  const cross = Math.abs(refDir[0] * dir2[1] - refDir[1] * dir2[0]);
  if (cross > 0.001) return false;

  // Check colinear (distance from A to ref line)
  const vx = A[0] - refPoint[0];
  const vy = A[1] - refPoint[1];
  const dist = Math.abs(vx * refDir[1] - vy * refDir[0]);
  return dist < 0.0000005;
}

// --- Main Entry Point ---

export function buildOptimizedWalls(geoJSON: GeoJSON.FeatureCollection): MergedWall[] {
  // Use explicit wall features from GeoJSON if available (wall-grid based data)
  const wallFeatures = geoJSON.features.filter(
    f => f.properties.indoor === "wall" && f.geometry.type === "LineString"
  );
  if (wallFeatures.length > 0) {
    return wallFeatures.map(f => {
      const coords = (f.geometry as GeoJSON.LineString).coordinates;
      const wallType = f.properties.wall_type as string;
      const classification: MergedWall["classification"] =
        wallType === "corridor" ? "corridor-room"
        : wallType === "partition" ? "room-divider"
        : "exterior";
      return {
        A: [coords[0][0], coords[0][1]] as [number, number],
        B: [coords[coords.length - 1][0], coords[coords.length - 1][1]] as [number, number],
        classification,
      };
    });
  }

  // Fallback: extract walls from room/corridor polygon edges
  const edges = collectEdges(geoJSON);
  const unique = deduplicateEdges(edges);
  return mergeCollinearEdges(unique);
}
