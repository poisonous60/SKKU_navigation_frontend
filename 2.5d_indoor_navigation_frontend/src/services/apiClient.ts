export interface RouteEdge {
  from: string;
  to: string;
  video: string;
  duration: number;
}

export interface RouteResponse {
  path: string[];
  edges: RouteEdge[];
  totalDistance: number;
  estimatedTime: string;
}

const API_BASE = '/api';

let useMock = true;

export function setUseMock(mock: boolean): void {
  useMock = mock;
}

export async function fetchRoute(from: string, to: string): Promise<RouteResponse> {
  if (useMock) {
    return getMockRoute(from, to);
  }

  try {
    const res = await fetch(`${API_BASE}/route?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) {
      throw new Error(`서버 오류: ${res.status}`);
    }
    return await res.json() as RouteResponse;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('네트워크 오류. 인터넷 연결을 확인하세요.');
    }
    throw err;
  }
}

function getMockRoute(from: string, to: string): RouteResponse {
  return {
    path: [from, 'corridor-1f-main', 'stairs-a', 'corridor-5f-main', to],
    edges: [
      { from: from, to: 'corridor-1f-main', video: '/videos/mock_clip1.mp4', duration: 8 },
      { from: 'corridor-1f-main', to: 'stairs-a', video: '/videos/mock_clip2.mp4', duration: 5 },
      { from: 'stairs-a', to: 'corridor-5f-main', video: '/videos/mock_clip3.mp4', duration: 10 },
      { from: 'corridor-5f-main', to: to, video: '/videos/mock_clip4.mp4', duration: 6 },
    ],
    totalDistance: 150,
    estimatedTime: '3분',
  };
}

export default {
  fetchRoute,
  setUseMock,
};
