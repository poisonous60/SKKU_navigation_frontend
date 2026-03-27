import maplibregl from 'maplibre-gl';
import * as BackendService from '../services/backendService';

/**
 * FloatingLabels — HTML div overlay for 3D-positioned room labels
 *
 * MapLibre symbol layers don't support per-feature elevation.
 * This module renders room labels as HTML divs, positioned each frame
 * using MercatorCoordinate + pixelMatrix3D projection.
 *
 * Only active in 3D mode. In 2D mode, the native symbol layer is used.
 */

interface LabelEntry {
  el: HTMLDivElement;
  lngLat: [number, number];
  altitude: number;
  ref: string;
}

let map: maplibregl.Map | null = null;
let container: HTMLDivElement | null = null;
let labels: LabelEntry[] = [];
let active = false;

/** Initialize the floating label system */
export function init(mapInstance: maplibregl.Map): void {
  map = mapInstance;

  // Create overlay container inside map's container
  container = document.createElement('div');
  container.className = 'floating-labels-container';
  map.getContainer().appendChild(container);

  // Update label positions on every render frame
  map.on('render', updatePositions);
}

/** Show floating labels for a specific level at a given altitude */
export function updateLabels(level: number, is3D: boolean, altitude: number): void {
  if (!container) return;

  // Clear existing labels
  clearLabels();

  if (!is3D) {
    active = false;
    return;
  }

  active = true;

  // Get room features for this level
  const levelGeoJson = BackendService.getLevelGeoJson(level);

  for (const f of levelGeoJson.features) {
    if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
    if (f.properties.indoor !== 'room') continue;
    if (!f.properties.ref) continue;

    const coords = f.geometry.type === 'Polygon'
      ? (f.geometry as GeoJSON.Polygon).coordinates[0]
      : (f.geometry as GeoJSON.MultiPolygon).coordinates[0][0];

    const center = polygonCentroid(coords);

    const el = document.createElement('div');
    el.className = 'floating-label';
    el.textContent = f.properties.ref;
    container!.appendChild(el);

    labels.push({
      el,
      lngLat: center,
      altitude,
      ref: f.properties.ref,
    });
  }

  // Immediately position
  updatePositions();
}

/** Remove all floating labels */
export function clearLabels(): void {
  for (const label of labels) {
    label.el.remove();
  }
  labels = [];
}

/** Destroy the entire system */
export function destroy(): void {
  clearLabels();
  if (map) {
    map.off('render', updatePositions);
  }
  if (container) {
    container.remove();
    container = null;
  }
  map = null;
}

// ===== Core: project 3D positions to screen and update DOM =====

function updatePositions(): void {
  if (!map || !active || labels.length === 0) return;

  const transform = (map as any).transform;
  const m = transform.pixelMatrix3D;
  if (!m) return;

  const viewW = transform.width;
  const viewH = transform.height;

  // Get current zoom for font size interpolation
  const zoom = map.getZoom();
  const fontSize = interpolateFontSize(zoom);

  for (const label of labels) {
    const pos = projectToScreen(m, label.lngLat, label.altitude);

    if (pos && pos.x >= -100 && pos.x <= viewW + 100 && pos.y >= -100 && pos.y <= viewH + 100) {
      label.el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0) translate(-50%, -50%)`;
      label.el.style.fontSize = `${fontSize}px`;
      label.el.style.display = '';
    } else {
      label.el.style.display = 'none';
    }
  }
}

function projectToScreen(
  m: Float64Array | Float32Array,
  lngLat: [number, number],
  altitudeMeters: number,
): { x: number; y: number } | null {
  const merc = maplibregl.MercatorCoordinate.fromLngLat(lngLat, altitudeMeters);

  // pixelMatrix3D is column-major: m[col*4 + row]
  const mx = merc.x;
  const my = merc.y;
  const mz = merc.z;

  const w = m[3] * mx + m[7] * my + m[11] * mz + m[15];
  if (w <= 0) return null; // behind camera

  const x = (m[0] * mx + m[4] * my + m[8] * mz + m[12]) / w;
  const y = (m[1] * mx + m[5] * my + m[9] * mz + m[13]) / w;

  return { x, y };
}

function interpolateFontSize(zoom: number): number {
  // Match the symbol layer's text-size stops: 19.5→9, 20→12, 20.5→14, 21→16
  if (zoom <= 19.5) return 9;
  if (zoom >= 21) return 16;
  if (zoom <= 20) return 9 + (zoom - 19.5) / 0.5 * 3;      // 9→12
  if (zoom <= 20.5) return 12 + (zoom - 20) / 0.5 * 2;     // 12→14
  return 14 + (zoom - 20.5) / 0.5 * 2;                      // 14→16
}

function polygonCentroid(coords: number[][]): [number, number] {
  let sumLng = 0, sumLat = 0;
  const len = coords.length - 1; // exclude closing coordinate
  for (let i = 0; i < len; i++) {
    sumLng += coords[i][0];
    sumLat += coords[i][1];
  }
  return [sumLng / len, sumLat / len];
}
