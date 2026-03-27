import { RouteResponse } from '../models/types';
import * as GraphService from './graphService';

const API_BASE = '/api';
let useMock = true;

export function setUseMock(mock: boolean): void {
  useMock = mock;
}

export async function fetchRoute(from: string, to: string): Promise<RouteResponse> {
  if (useMock) return getLocalRoute(from, to);

  const res = await fetch(`${API_BASE}/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
  return await res.json() as RouteResponse;
}

function getLocalRoute(from: string, to: string): RouteResponse {
  if (!GraphService.isLoaded()) {
    throw new Error('그래프 데이터가 로딩되지 않았습니다.');
  }

  const result = GraphService.buildFullRoute(from, to);
  if (!result) {
    throw new Error(`경로를 찾을 수 없습니다: ${from} → ${to}`);
  }

  return {
    path: result.pathNodeIds,
    edges: [],
    totalDistance: result.totalDistance,
    estimatedTime: result.estimatedTime,
    coordinates: result.coordinates,
    levels: result.levels,
    startLevel: result.startLevel,
    endLevel: result.endLevel,
  };
}
