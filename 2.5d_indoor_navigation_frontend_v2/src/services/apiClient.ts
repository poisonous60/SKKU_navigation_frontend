import { RouteResponse } from '../models/types';

const API_BASE = '/api';
let useMock = true;

export function setUseMock(mock: boolean): void {
  useMock = mock;
}

export async function fetchRoute(from: string, to: string): Promise<RouteResponse> {
  if (useMock) return getMockRoute(from, to);

  const res = await fetch(`${API_BASE}/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
  return await res.json() as RouteResponse;
}

function getMockRoute(from: string, to: string): RouteResponse {
  return {
    path: [from, 'corridor-1f-main', 'stairs-a', 'corridor-5f-main', to],
    edges: [
      { from, to: 'corridor-1f-main', video: '', duration: 8 },
      { from: 'corridor-1f-main', to: 'stairs-a', video: '', duration: 5 },
      { from: 'stairs-a', to: 'corridor-5f-main', video: '', duration: 10 },
      { from: 'corridor-5f-main', to, video: '', duration: 6 },
    ],
    totalDistance: 150,
    estimatedTime: '3분',
  };
}
