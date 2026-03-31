// ===== API Route Provider — Uses backend API for graph, route, search =====

import type { NavGraph, NavNode, NavEdge } from '../../editor/graphEditorTypes';
import type { FullRouteResult, EdgeProjection } from '../graphService';
import type { RoomListItem } from '../../models/types';
import * as GraphService from '../graphService';
import * as BackendService from '../backendService';
import { detectBuilding } from '../../utils/buildingDetection';


const API_BASE = 'http://localhost:8080/api';

// ===== API Response Types =====

interface ApiNodeDto {
  id: string;
  building: string;
  level: number;
  type: string;
  label: string;
  longitude: number;
  latitude: number;
  clipFwdStart: number | null;
  clipFwdEnd: number | null;
  clipRevStart: number | null;
  clipRevEnd: number | null;
}

interface ApiEdgeDto {
  id: string;
  from: string;
  to: string;
  weight: number;
  videoFwd: string | null;
  videoFwdStart: number | null;
  videoFwdEnd: number | null;
  videoFwdExit: string | null;
  videoFwdExitStart: number | null;
  videoFwdExitEnd: number | null;
  videoRev: string | null;
  videoRevStart: number | null;
  videoRevEnd: number | null;
  videoRevExit: string | null;
  videoRevExitStart: number | null;
  videoRevExitEnd: number | null;
}

interface ApiGraphDto {
  nodes: ApiNodeDto[];
  edges: ApiEdgeDto[];
}

interface ApiRouteResponse {
  found: boolean;
  path: string[];
  // edges from API are intentionally unused — edgePath is reconstructed from the
  // locally-loaded graph to include full NavEdge metadata (video fwd/rev, exit clips, etc.)
  edges: { from: string; to: string; video: string | null; videoStart: number; videoEnd: number; duration: number }[];
  totalDistance: number;
  estimatedTime: string;
}

// ===== Init =====

export async function init(): Promise<void> {
  console.log('[ApiRoute] Fetching graph from', `${API_BASE}/graph`);
  const res = await fetch(`${API_BASE}/graph`);
  if (!res.ok) throw new Error(`API graph fetch failed: ${res.status}`);
  const data: ApiGraphDto = await res.json();
  GraphService.setGraph(convertApiGraph(data));
}

// ===== Route Finding =====

export async function findRoute(from: string, to: string): Promise<FullRouteResult | null> {
  const url = `${API_BASE}/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  console.log('[ApiRoute] Fetching route from', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API route failed: ${res.status}`);
  const data: ApiRouteResponse = await res.json();
  if (!data.found) return null;

  return buildFullRouteFromApi(from, to, data);
}

// ===== Room Search =====

export async function searchRooms(query: string): Promise<RoomListItem[]> {
  if (!query.trim()) return [];
  console.log('[ApiRoute] Searching rooms:', query);
  const res = await fetch(`${API_BASE}/nodes/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) return [];
  const nodes: ApiNodeDto[] = await res.json();
  return nodes
    .filter(n => n.type === 'room' && n.label)
    .map((n): RoomListItem => ({
      building: n.building ?? '',
      ref: n.label,
      name: '',
      level: [n.level],
      // Backend NodeDto.type is "room" — no sub-type (classroom/lab/etc.) available.
      // ROOM_TYPE_LABELS['room'] is undefined, so the raw string "room" will show.
      // TODO: Backend should expose room_type sub-type for proper label display.
      roomType: n.type,
      featureId: n.id,
    }));
}

// ===== Convert API Graph → NavGraph =====

function convertApiGraph(data: ApiGraphDto): NavGraph {
  const nodes: Record<string, NavNode> = {};
  for (const n of data.nodes) {
    nodes[n.id] = {
      id: n.id,
      coordinates: [n.longitude, n.latitude] as [number, number],
      level: n.level,
      building: n.building || detectBuilding([n.longitude, n.latitude], n.level),
      type: n.type as NavNode['type'],
      label: n.label ?? '',
      // verticalId not in backend NodeDto — walkthroughPlanner handles gracefully
    };
  }

  const edges: NavEdge[] = data.edges.map(e => ({
    id: e.id,
    from: e.from,
    to: e.to,
    weight: e.weight,
    // Backend timestamps are in milliseconds → convert to seconds
    videoFwd: e.videoFwd ?? undefined,
    videoFwdStart: msToSec(e.videoFwdStart),
    videoFwdEnd: msToSec(e.videoFwdEnd),
    videoFwdExit: e.videoFwdExit ?? undefined,
    videoFwdExitStart: msToSec(e.videoFwdExitStart),
    videoFwdExitEnd: msToSec(e.videoFwdExitEnd),
    videoRev: e.videoRev ?? undefined,
    videoRevStart: msToSec(e.videoRevStart),
    videoRevEnd: msToSec(e.videoRevEnd),
    videoRevExit: e.videoRevExit ?? undefined,
    videoRevExitStart: msToSec(e.videoRevExitStart),
    videoRevExitEnd: msToSec(e.videoRevExitEnd),
  }));

  return { nodes, edges };
}

function msToSec(ms: number | null): number | undefined {
  return ms != null ? ms / 1000 : undefined;
}

// ===== Build FullRouteResult from API Response =====

function buildFullRouteFromApi(
  fromRef: string,
  toRef: string,
  data: ApiRouteResponse,
): FullRouteResult | null {
  const graph = GraphService.getGraph();
  if (!graph) return null;

  // 1. Room info (from local GeoJSON)
  const fromCentroid = BackendService.getRoomCentroid(fromRef);
  const toCentroid = BackendService.getRoomCentroid(toRef);
  const fromLevel = BackendService.getRoomLevel(fromRef);
  const toLevel = BackendService.getRoomLevel(toRef);

  if (!fromCentroid || !toCentroid || fromLevel === null || toLevel === null) {
    console.warn('[ApiRoute] Room info not found:', fromRef, toRef);
    return null;
  }

  // 2. Door points
  const fromRoomNodeId = GraphService.findRoomNode(fromRef, fromLevel);
  const toRoomNodeId = GraphService.findRoomNode(toRef, toLevel);

  const fromDoor = fromRoomNodeId
    ? GraphService.getNodeCoordinates(fromRoomNodeId)!
    : computeDoor(fromRef, fromCentroid, fromLevel);
  const toDoor = toRoomNodeId
    ? GraphService.getNodeCoordinates(toRoomNodeId)!
    : computeDoor(toRef, toCentroid, toLevel);

  // 3. Perpendicular projections
  const fromProj = GraphService.projectOntoNearestEdge(fromDoor, fromLevel);
  const toProj = GraphService.projectOntoNearestEdge(toDoor, toLevel);

  if (!fromProj || !toProj) {
    console.warn('[ApiRoute] Corridor edge projection failed');
    return null;
  }

  // 4. Same edge check
  const sameEdge =
    (fromProj.nodeA === toProj.nodeA && fromProj.nodeB === toProj.nodeB) ||
    (fromProj.nodeA === toProj.nodeB && fromProj.nodeB === toProj.nodeA);

  // 5. Build coordinate chain: centroid → door → perpFoot → [path nodes] → perpFoot → door → centroid
  const raw: GeoJSON.Position[] = [];
  const rawLevels: number[] = [];
  const push = (coord: GeoJSON.Position, level: number) => {
    raw.push(coord);
    rawLevels.push(level);
  };

  push(fromCentroid, fromLevel);
  push(fromDoor, fromLevel);
  push(fromProj.point, fromLevel);

  // Backtracking prevention + resolve node coordinates
  const apiPath = data.path;
  let pathStart = 0;
  let pathEnd = apiPath.length;

  if (!sameEdge && apiPath.length >= 2) {
    const fromEdgeIds = new Set([fromProj.nodeA, fromProj.nodeB]);
    if (fromEdgeIds.has(apiPath[0]) && fromEdgeIds.has(apiPath[1])) {
      pathStart = 1;
    }

    const toEdgeIds = new Set([toProj.nodeA, toProj.nodeB]);
    if (toEdgeIds.has(apiPath[apiPath.length - 1]) && toEdgeIds.has(apiPath[apiPath.length - 2])) {
      pathEnd = apiPath.length - 1;
    }
  }

  const trimmedPath = apiPath.slice(pathStart, pathEnd);
  for (let i = pathStart; i < pathEnd; i++) {
    const node = graph.nodes[apiPath[i]];
    if (node) push(node.coordinates, node.level);
  }

  push(toProj.point, toLevel);
  push(toDoor, toLevel);
  push(toCentroid, toLevel);

  // 6. Deduplicate close coordinates (~1m)
  const coordinates: GeoJSON.Position[] = [raw[0]];
  const levels: number[] = [rawLevels[0]];
  const MIN_GAP = 0.000009;
  for (let i = 1; i < raw.length; i++) {
    const prev = coordinates[coordinates.length - 1];
    const cur = raw[i];
    const dx = cur[0] - prev[0], dy = cur[1] - prev[1];
    if (dx * dx + dy * dy > MIN_GAP * MIN_GAP) {
      coordinates.push(cur);
      levels.push(rawLevels[i]);
    }
  }

  // 7. Build edgePath from graph edges
  const edgePath: FullRouteResult['edgePath'] = [];

  function findEdge(nA: string, nB: string): NavEdge | undefined {
    return graph!.edges.find(
      e => (e.from === nA && e.to === nB) || (e.from === nB && e.to === nA),
    );
  }

  if (sameEdge || trimmedPath.length === 0) {
    // Same edge or trimmed to empty (both ends on adjacent edges) — single edge
    const e = findEdge(fromProj.nodeA, fromProj.nodeB);
    if (e) edgePath.push({ edge: e, forward: true, fromNode: graph.nodes[e.from], toNode: graph.nodes[e.to] });
  } else {
    // trimmedPath.length > 0 guaranteed here
    // Start edge
    const firstNode = trimmedPath[0];
    const startEdge = findEdge(fromProj.nodeA, fromProj.nodeB);
    if (startEdge) {
      edgePath.push({ edge: startEdge, forward: startEdge.to === firstNode, fromNode: graph.nodes[startEdge.from], toNode: graph.nodes[startEdge.to] });
    }

    // Inter-node edges
    for (let i = 0; i < trimmedPath.length - 1; i++) {
      const nA = trimmedPath[i];
      const nB = trimmedPath[i + 1];
      const e = findEdge(nA, nB);
      if (e) edgePath.push({ edge: e, forward: e.from === nA, fromNode: graph.nodes[e.from], toNode: graph.nodes[e.to] });
    }

    // End edge (only if different from start edge)
    const lastNode = trimmedPath[trimmedPath.length - 1];
    const endEdge = findEdge(toProj.nodeA, toProj.nodeB);
    if (endEdge && endEdge.id !== startEdge?.id) {
      edgePath.push({ edge: endEdge, forward: endEdge.from === lastNode, fromNode: graph.nodes[endEdge.from], toNode: graph.nodes[endEdge.to] });
    }
  }

  return {
    coordinates,
    levels,
    pathNodeIds: apiPath,
    totalDistance: data.totalDistance,
    estimatedTime: data.estimatedTime,
    startLevel: fromLevel,
    endLevel: toLevel,
    fromProjection: fromProj,
    toProjection: toProj,
    edgePath,
    sameEdge,
    trimmedPathNodeIds: trimmedPath,
  };
}

// ===== Helpers =====

function computeDoor(ref: string, centroid: [number, number], level: number): [number, number] {
  const poly = BackendService.getRoomPolygon(ref);
  const nearest = GraphService.findNearestCorridorNode(centroid, level);
  if (poly && nearest) {
    const corridorCoords = GraphService.getNodeCoordinates(nearest);
    if (corridorCoords) return GraphService.findDoorPoint(poly, corridorCoords);
  }
  return centroid;
}
