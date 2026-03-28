// ===== 360° Video Catalog for eng1 Building =====

import { NavNode } from './graphEditorTypes';

export interface VideoEntry {
  filename: string;
  type: 'corridor' | 'stair' | 'elevator';
  wing?: string;       // "21"|"22"|"23"
  floor?: number;      // 1-5
  direction?: string;  // "cw"|"ccw"|"up"|"down"
  id?: number;         // stair 1-4, elev 1-2
  label: string;       // human-readable
}

// ===== Full catalog: 48 videos =====

function buildCatalog(): VideoEntry[] {
  const entries: VideoEntry[] = [];

  // Corridors: 3 wings × 5 floors × 2 directions = 30
  for (const wing of ['21', '22', '23']) {
    for (let floor = 1; floor <= 5; floor++) {
      for (const dir of ['cw', 'ccw'] as const) {
        const dirLabel = dir === 'cw' ? '시계방향' : '반시계방향';
        entries.push({
          filename: `eng1_corridor_${wing}_${floor}F_${dir}.mp4`,
          type: 'corridor',
          wing,
          floor,
          direction: dir,
          label: `${wing}동 ${floor}F ${dirLabel}`,
        });
      }
    }
  }

  // Staircases: 4 stairs × 2 directions = 8
  for (let stairId = 1; stairId <= 4; stairId++) {
    for (const dir of ['up', 'down'] as const) {
      const dirLabel = dir === 'up' ? '올라감' : '내려감';
      entries.push({
        filename: `eng1_stair_${stairId}_${dir}.mp4`,
        type: 'stair',
        id: stairId,
        direction: dir,
        label: `계단${stairId} ${dirLabel}`,
      });
    }
  }

  // Elevators: 2 elevators × 5 floors = 10
  for (let elevId = 1; elevId <= 2; elevId++) {
    for (let floor = 1; floor <= 5; floor++) {
      entries.push({
        filename: `eng1_elev_${elevId}_${floor}F.mp4`,
        type: 'elevator',
        id: elevId,
        floor,
        label: `엘리베이터${elevId} ${floor}F`,
      });
    }
  }

  return entries;
}

const CATALOG = buildCatalog();

export function getAllVideos(): VideoEntry[] {
  return CATALOG;
}

export function getVideosByType(type: VideoEntry['type']): VideoEntry[] {
  return CATALOG.filter(v => v.type === type);
}

/** Returns the opposite-direction video filename. Corridors only (cw↔ccw). */
export function getOppositeVideo(filename: string): string | undefined {
  if (filename.includes('_cw.')) return filename.replace('_cw.', '_ccw.');
  if (filename.includes('_ccw.')) return filename.replace('_ccw.', '_cw.');
  return undefined;
}

// ===== Smart-suggest: rank videos by relevance to an edge =====

export function suggestVideosForEdge(fromNode: NavNode, toNode: NavNode): VideoEntry[] {
  const crossFloor = fromNode.level !== toNode.level;
  const floor = fromNode.level;
  const wing = fromNode.building; // "21"|"22"|"23"

  // Determine expected video type from node types
  const bothStairs = fromNode.type === 'stairs' || toNode.type === 'stairs';
  const bothElev = fromNode.type === 'elevator' || toNode.type === 'elevator';

  const scored = CATALOG.map(v => {
    let score = 0;

    // Type matching
    if (bothStairs && v.type === 'stair') score += (crossFloor ? 100 : 60);
    else if (bothElev && v.type === 'elevator') score += (crossFloor ? 100 : 60);
    else if (!crossFloor && v.type === 'corridor') score += 50;

    // Wing match (corridors)
    if (v.wing && v.wing === wing) score += 30;

    // Floor match
    if (v.floor === floor) score += 20;

    // Stair/elevator id match based on building proximity
    if (v.type === 'stair' && bothStairs) score += 10;
    if (v.type === 'elevator' && bothElev) score += 10;

    return { entry: v, score };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Type group order: corridor > stair > elevator
    const typeOrder = { corridor: 0, stair: 1, elevator: 2 };
    const tDiff = typeOrder[a.entry.type] - typeOrder[b.entry.type];
    if (tDiff !== 0) return tDiff;
    return a.entry.filename.localeCompare(b.entry.filename);
  });

  return scored.map(s => s.entry);
}
