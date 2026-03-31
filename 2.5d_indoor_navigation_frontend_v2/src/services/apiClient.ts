// ===== API Client — Manager/switch between local and API route providers =====

import * as LocalRoute from './local/localRoute';
import * as ApiRoute from './api/apiRoute';
import type { FullRouteResult } from './graphService';
import type { RoomListItem } from '../models/types';

// Set to true before calling initRouting() to use the backend API.
// Example: import { setUseApi } from './apiClient'; setUseApi(true);
// Can also be wired to a build-time env variable or runtime config toggle.
let useApi = false;

export function setUseApi(api: boolean): void {
  useApi = api;
}

export function isApiMode(): boolean {
  return useApi;
}

/** Initialize routing: load graph from local file or backend API */
export async function initRouting(): Promise<void> {
  if (useApi) {
    await ApiRoute.init();
  } else {
    await LocalRoute.init();
  }
}

/** Find route between two room refs */
export async function fetchRoute(from: string, to: string): Promise<FullRouteResult | null> {
  if (useApi) {
    return ApiRoute.findRoute(from, to);
  }
  return LocalRoute.findRoute(from, to);
}

/** Search rooms by query string */
export async function searchRooms(query: string): Promise<RoomListItem[]> {
  if (useApi) {
    return ApiRoute.searchRooms(query);
  }
  return LocalRoute.searchRooms(query);
}
