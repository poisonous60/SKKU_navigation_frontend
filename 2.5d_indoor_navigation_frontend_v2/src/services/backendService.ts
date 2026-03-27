import { BuildingInterface, BuildingConstants, RoomListItem } from '../models/types';
import { extractLevels } from '../utils/extractLevels';
import { lat2y } from '../utils/coordinateHelpers';

// Building constants from v1 config
const BUILDING_CONFIG = {
  eng1: {
    SEARCH_STRING: '제1공학관',
    BEARING_OFFSET: 90,
    BEARING_CALC_NODE1: 'skku_bearing_1',
    BEARING_CALC_NODE2: 'skku_bearing_2',
    STANDARD_ZOOM: 19.5,
    MAX_ZOOM: 21,
    MIN_ZOOM: 15,
    STANDARD_BEARING_3D_MODE: -45,
    STANDARD_PITCH_3D_MODE: 72,
    STANDARD_ZOOM_3D_MODE: 20.0,
  },
};

const MAP_START_LAT = 37.2939;
const MAP_START_LNG = 126.9766;

const currentBuilding = 'eng1';

let geoJson: GeoJSON.FeatureCollection;
let buildingInterface: BuildingInterface;
let buildingConstants: BuildingConstants;
let buildingDescription = '';
const allLevels = new Set<number>();
let roomList: RoomListItem[] = [];

// Per-level filtered GeoJSON caches
const levelGeoJsonCache = new Map<number, GeoJSON.FeatureCollection>();

export async function fetchBackendData(): Promise<void> {
  const res = await fetch(`/geojson/eng1.geojson`);
  if (!res.ok) throw new Error('GeoJSON 로딩 실패');
  const fullGeojson: GeoJSON.FeatureCollection = await res.json();

  // Find building outline
  const outlineFeature = fullGeojson.features.find(
    f => f.properties?.building !== undefined &&
      (f.properties!.name === BUILDING_CONFIG[currentBuilding].SEARCH_STRING ||
       f.properties!.loc_ref === 'ENG1')
  );

  if (!outlineFeature || !outlineFeature.properties) throw new Error('건물 외곽선을 찾을 수 없습니다.');

  // Compute bounding box
  const coords = (outlineFeature.geometry as GeoJSON.Polygon).coordinates[0];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  buildingInterface = {
    boundingBox: [minLng, minLat, maxLng, maxLat],
    feature: outlineFeature,
  };

  // Filter to indoor features only
  const indoorFeatures = fullGeojson.features.filter(f =>
    ('indoor' in f.properties && f.properties.indoor !== 'no') || 'level' in f.properties
  );

  // Parse levels
  for (const feature of indoorFeatures) {
    if (!['Polygon', 'LineString', 'MultiPolygon'].includes(feature.geometry.type)) continue;
    if (feature.properties.level === undefined) continue;

    const levels = extractLevels(String(feature.properties.level));
    feature.properties.level = levels;
    levels.forEach(l => allLevels.add(l));
  }

  geoJson = { type: 'FeatureCollection', features: indoorFeatures };

  // Build room list for search
  roomList = [];
  for (const f of geoJson.features) {
    if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
    if (!f.properties.indoor || f.properties.indoor === 'corridor') continue;
    if (!f.properties.ref) continue;

    const levels = Array.isArray(f.properties.level) ? f.properties.level : extractLevels(String(f.properties.level ?? ''));
    roomList.push({
      ref: f.properties.ref,
      name: f.properties.name ?? '',
      level: levels,
      roomType: f.properties.room_type ?? f.properties.indoor ?? '',
      featureId: String(f.id ?? ''),
    });
  }

  // Build description
  if (outlineFeature.properties.name) {
    buildingDescription = outlineFeature.properties.name;
    if (outlineFeature.properties.loc_ref) {
      buildingDescription += ` (${outlineFeature.properties.loc_ref})`;
    }
  }

  // Calculate bearing from reference nodes
  const cfg = BUILDING_CONFIG[currentBuilding];
  const node1 = fullGeojson.features.find(f => f.id === `node/${cfg.BEARING_CALC_NODE1}`);
  const node2 = fullGeojson.features.find(f => f.id === `node/${cfg.BEARING_CALC_NODE2}`);

  let standardBearing = cfg.STANDARD_BEARING_3D_MODE;
  if (node1 && node2) {
    const p1 = (node1.geometry as GeoJSON.Point).coordinates;
    const p2 = (node2.geometry as GeoJSON.Point).coordinates;
    standardBearing = ((
      Math.atan2(p2[0] - p1[0], lat2y(p2[1]) - lat2y(p1[1])) * (180 / Math.PI)
      + cfg.BEARING_OFFSET
    + 180) % 360) - 180;
  }

  buildingConstants = {
    standardZoom: cfg.STANDARD_ZOOM,
    maxZoom: cfg.MAX_ZOOM,
    minZoom: cfg.MIN_ZOOM,
    standardBearing,
    standardBearing3DMode: cfg.STANDARD_BEARING_3D_MODE,
    standardPitch3DMode: cfg.STANDARD_PITCH_3D_MODE,
    standardZoom3DMode: cfg.STANDARD_ZOOM_3D_MODE,
  };
}

export function getGeoJson(): GeoJSON.FeatureCollection {
  return geoJson;
}

export function getBuildingConstants(): BuildingConstants {
  return buildingConstants;
}

export function getBuildingDescription(): string {
  return buildingDescription;
}

export function getOutline(): number[][] {
  return (buildingInterface.feature.geometry as GeoJSON.Polygon).coordinates[0];
}

export function getAllLevels(): number[] {
  return Array.from(allLevels).sort((a, b) => b - a); // descending: [5, 4, 3, 2, 1]
}

export function getMapCenter(): [number, number] {
  return [MAP_START_LNG, MAP_START_LAT];
}

export function getRoomList(): RoomListItem[] {
  return roomList;
}

export function getBoundingBox(): [number, number, number, number] {
  return buildingInterface.boundingBox;
}

/** Get GeoJSON filtered to a specific level */
export function getLevelGeoJson(level: number): GeoJSON.FeatureCollection {
  if (levelGeoJsonCache.has(level)) return levelGeoJsonCache.get(level)!;

  const features = geoJson.features.filter(f => {
    const levels = f.properties.level;
    if (Array.isArray(levels)) return levels.includes(level);
    return false;
  });

  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features };
  levelGeoJsonCache.set(level, fc);
  return fc;
}

/** Search rooms by ref/name */
export function searchRooms(query: string): RoomListItem[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  return roomList.filter(r =>
    r.ref.toLowerCase().startsWith(q) ||
    r.name.toLowerCase().includes(q) ||
    r.roomType.toLowerCase().startsWith(q)
  ).slice(0, 20);
}
