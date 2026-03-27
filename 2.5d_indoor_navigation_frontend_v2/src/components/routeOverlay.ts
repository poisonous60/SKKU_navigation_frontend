import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type maplibregl from 'maplibre-gl';
import { getLevelBase, ROOM_THICKNESS } from './indoorLayer';
import { MapConfig } from '../config/mapConfig';

/**
 * RouteOverlay — deck.gl overlay for dynamic route visualization
 *
 * 3D 모드에서는 각 좌표의 층(level) 정보를 기반으로 정확한 높이를 적용.
 * 2D↔3D 전환 시 자동 재렌더링.
 */

let overlay: MapboxOverlay | null = null;

// 저장된 경로 데이터 (2D↔3D 전환 시 재렌더링용)
let storedCoordinates: GeoJSON.Position[] | null = null;
let storedLevels: number[] | null = null;
let storedIs3D = false;

const R = MapConfig.route;

interface RouteData {
  path: number[][];
}

interface PoiData {
  position: number[];
  color: [number, number, number];
  radius: number;
}

export function initOverlay(map: maplibregl.Map): void {
  overlay = new MapboxOverlay({
    interleaved: true,
    layers: [],
  });
  map.addControl(overlay as unknown as maplibregl.IControl);
}

/**
 * Draw a route path on the map.
 * @param coordinates [lng, lat] 배열
 * @param levels      각 좌표의 층 번호 (coordinates와 1:1 대응)
 * @param is3D        3D 모드 여부
 */
export function showRoute(
  coordinates: GeoJSON.Position[],
  levels: number[] | null,
  is3D: boolean,
): void {
  storedCoordinates = coordinates;
  storedLevels = levels;
  storedIs3D = is3D;
  renderRoute();
}

/** 2D↔3D 전환 시 호출 */
export function setIs3D(is3D: boolean): void {
  if (!storedCoordinates) return;
  storedIs3D = is3D;
  renderRoute();
}

/** 현재 경로가 표시 중인지 */
export function hasRoute(): boolean {
  return storedCoordinates !== null;
}

/** 좌표별 층 정보를 기반으로 3D 높이 적용 */
function buildPath3D(
  coords: GeoJSON.Position[],
  levels: number[] | null,
  is3D: boolean,
): number[][] {
  if (!is3D || !levels) {
    return coords.map(c => [c[0], c[1]]);
  }

  return coords.map((c, i) => {
    const level = levels[i] ?? levels[levels.length - 1] ?? 1;
    const altitude = getLevelBase(level) + ROOM_THICKNESS + 0.5;
    return [c[0], c[1], altitude];
  });
}

/** 층별 경로 색상 보간 */
function colorForLevel(level: number, minLevel: number): [number, number, number] {
  const step = level - minLevel;
  const t = Math.min(step / R.colorSteps, 1);
  return [
    Math.round(R.colorFrom[0] + (R.colorTo[0] - R.colorFrom[0]) * t),
    Math.round(R.colorFrom[1] + (R.colorTo[1] - R.colorFrom[1]) * t),
    Math.round(R.colorFrom[2] + (R.colorTo[2] - R.colorFrom[2]) * t),
  ];
}

/** 좌표 배열을 같은 층끼리 연속 세그먼트로 분할 (인접 세그먼트는 끝점 공유) */
interface Segment {
  path: number[][];
  level: number;
}

function splitByLevel(
  path3d: number[][],
  levels: number[] | null,
): Segment[] {
  if (!levels || levels.length === 0) {
    return [{ path: path3d, level: levels?.[0] ?? 1 }];
  }

  const segments: Segment[] = [];
  let curLevel = levels[0];
  let curPath: number[][] = [path3d[0]];

  for (let i = 1; i < path3d.length; i++) {
    if (levels[i] !== curLevel) {
      curPath.push(path3d[i]);
      segments.push({ path: curPath, level: curLevel });
      curLevel = levels[i];
      curPath = [path3d[i]];
    } else {
      curPath.push(path3d[i]);
    }
  }

  if (curPath.length >= 2) {
    segments.push({ path: curPath, level: curLevel });
  }

  return segments;
}

function renderRoute(): void {
  if (!overlay || !storedCoordinates) return;

  const path3d = buildPath3D(storedCoordinates, storedLevels, storedIs3D);
  const segments = splitByLevel(path3d, storedLevels);

  const minLevel = storedLevels
    ? Math.min(...storedLevels)
    : 1;

  // 세그먼트별 PathLayer
  const pathLayers = segments.map((seg, i) =>
    new PathLayer<Segment>({
      id: `route-path-${i}`,
      data: [seg],
      getPath: (d) => d.path,
      getColor: colorForLevel(seg.level, minLevel),
      getWidth: R.lineWidth,
      widthMinPixels: R.lineWidthMinPx,
      widthMaxPixels: R.lineWidthMaxPx,
      capRounded: true,
      jointRounded: true,
    }),
  );

  // Start and end POIs
  const pois: PoiData[] = [];
  if (path3d.length >= 2) {
    pois.push({
      position: path3d[0],
      color: [...R.startColor] as [number, number, number],
      radius: R.endpointRadius,
    });
    pois.push({
      position: path3d[path3d.length - 1],
      color: [...R.endColor] as [number, number, number],
      radius: R.endpointRadius,
    });
  }

  overlay.setProps({
    layers: [
      ...pathLayers,
      new ScatterplotLayer<PoiData>({
        id: 'route-endpoints',
        data: pois,
        getPosition: (d) => d.position as [number, number, number],
        getFillColor: (d) => d.color,
        getRadius: (d) => d.radius,
        radiusMinPixels: R.endpointMinPx,
        radiusMaxPixels: R.endpointMaxPx,
      }),
    ],
  });
}

/** Highlight POIs on the map (e.g., search results) */
export function showPois(positions: GeoJSON.Position[]): void {
  if (!overlay) return;

  const pois: PoiData[] = positions.map(pos => ({
    position: pos,
    color: [255, 111, 3] as [number, number, number],
    radius: 6,
  }));

  const currentLayers = overlay.props.layers || [];
  const routeLayers = currentLayers.filter((l: any) => l.id?.startsWith('route-'));

  overlay.setProps({
    layers: [
      ...routeLayers,
      new ScatterplotLayer({
        id: 'search-pois',
        data: pois,
        getPosition: (d: PoiData) => d.position,
        getFillColor: (d: PoiData) => d.color,
        getRadius: (d: PoiData) => d.radius,
        radiusMinPixels: 5,
        radiusMaxPixels: 12,
      }),
    ],
  });
}

/** Clear all deck.gl layers */
export function clearRoute(): void {
  if (!overlay) return;
  storedCoordinates = null;
  storedLevels = null;
  storedIs3D = false;
  overlay.setProps({ layers: [] });
}

/** Clear only search POIs, keep route */
export function clearPois(): void {
  if (!overlay) return;
  const currentLayers = overlay.props.layers || [];
  const routeLayers = currentLayers.filter((l: any) => l.id?.startsWith('route-'));
  overlay.setProps({ layers: routeLayers });
}
