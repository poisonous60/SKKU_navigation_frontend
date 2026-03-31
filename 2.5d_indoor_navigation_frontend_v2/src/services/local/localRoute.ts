// ===== Local Route Provider — Uses local graph.json + BackendService =====

import * as GraphService from '../graphService';
import * as BackendService from '../backendService';
import type { FullRouteResult } from '../graphService';
import type { RoomListItem } from '../../models/types';

export async function init(): Promise<void> {
  await GraphService.loadGraph();
}

export function findRoute(from: string, to: string): FullRouteResult | null {
  return GraphService.buildFullRoute(from, to);
}

export function searchRooms(query: string): RoomListItem[] {
  return BackendService.searchRooms(query);
}
