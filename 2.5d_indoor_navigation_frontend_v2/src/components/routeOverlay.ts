import { MapboxOverlay } from '@deck.gl/mapbox';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import type maplibregl from 'maplibre-gl';

/**
 * RouteOverlay — deck.gl overlay for dynamic route visualization
 *
 * Uses MapboxOverlay in interleaved mode: deck.gl layers render
 * inside MapLibre's GL context with correct z-ordering.
 * Only dynamic/animated layers go through deck.gl (design doc: Rendering Responsibility Split).
 */

let overlay: MapboxOverlay | null = null;

interface RouteData {
  path: GeoJSON.Position[];
}

interface PoiData {
  position: GeoJSON.Position;
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

/** Draw a route path on the map */
export function showRoute(coordinates: GeoJSON.Position[]): void {
  if (!overlay) return;

  const routeData: RouteData[] = [{ path: coordinates }];

  // Start and end POIs
  const pois: PoiData[] = [];
  if (coordinates.length >= 2) {
    pois.push({
      position: coordinates[0],
      color: [76, 175, 80],  // green start
      radius: 8,
    });
    pois.push({
      position: coordinates[coordinates.length - 1],
      color: [244, 67, 54],  // red end
      radius: 8,
    });
  }

  overlay.setProps({
    layers: [
      new PathLayer({
        id: 'route-path',
        data: routeData,
        getPath: (d: RouteData) => d.path,
        getColor: [66, 165, 245], // #42A5F5 from DESIGN.md
        getWidth: 4,
        widthMinPixels: 3,
        widthMaxPixels: 8,
        capRounded: true,
        jointRounded: true,
      }),
      new ScatterplotLayer({
        id: 'route-endpoints',
        data: pois,
        getPosition: (d: PoiData) => d.position,
        getFillColor: (d: PoiData) => d.color,
        getRadius: (d: PoiData) => d.radius,
        radiusMinPixels: 6,
        radiusMaxPixels: 14,
      }),
    ],
  });
}

/** Highlight POIs on the map (e.g., search results) */
export function showPois(positions: GeoJSON.Position[]): void {
  if (!overlay) return;

  const pois: PoiData[] = positions.map(pos => ({
    position: pos,
    color: [255, 111, 3], // ROOM_SELECTED from v1
    radius: 6,
  }));

  // Preserve existing route if present
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
  overlay.setProps({ layers: [] });
}

/** Clear only search POIs, keep route */
export function clearPois(): void {
  if (!overlay) return;
  const currentLayers = overlay.props.layers || [];
  const routeLayers = currentLayers.filter((l: any) => l.id?.startsWith('route-'));
  overlay.setProps({ layers: routeLayers });
}
