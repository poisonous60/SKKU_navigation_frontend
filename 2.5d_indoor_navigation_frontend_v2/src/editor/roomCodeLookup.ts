// ===== Room Code Lookup — auto-fill name & room_type from 코드-방이름.xlsx data =====

import { RoomType } from './graphEditorTypes';

export interface RoomCodeEntry {
  name: string;
  name_en: string;
  room_type: RoomType;
}

let lookupTable: Record<string, RoomCodeEntry> | null = null;
let loadPromise: Promise<void> | null = null;

/** Load the room code lookup table (idempotent). */
export async function loadRoomCodes(): Promise<void> {
  if (lookupTable) return;
  if (loadPromise) return loadPromise;

  loadPromise = fetch('/geojson/room_codes.json')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then(data => { lookupTable = data; })
    .catch(err => {
      console.warn('[RoomCodeLookup] Failed to load room_codes.json:', err);
      lookupTable = {};
    });

  return loadPromise;
}

/** Look up a room code. Returns entry or null. */
export function lookup(ref: string): RoomCodeEntry | null {
  if (!lookupTable || !ref) return null;
  return lookupTable[ref] ?? null;
}
