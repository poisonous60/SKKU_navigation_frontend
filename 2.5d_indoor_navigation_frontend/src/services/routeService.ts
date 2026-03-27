import * as Maptalks from "maptalks";
import { RouteResponse } from "./apiClient";
import { geoMap } from "../main";

const ROUTE_COLOR = '#42A5F5';
const ROUTE_START_COLOR = '#66BB6A';
const ROUTE_END_COLOR = '#EF5350';

let routeLayers: Maptalks.VectorLayer[] = [];
let animationId: number | null = null;

export interface RouteNode {
  id: string;
  coordinates: [number, number];
  level: number;
}

function getNodeCoordinates(nodeId: string): [number, number] | null {
  // Try to find the node from graph data or GeoJSON features
  // For now, use a lookup from GeoJSON features by ref
  const geoJSON = geoMap ? require("../services/backendService").default.getGeoJson() : null;
  if (!geoJSON) return null;

  for (const feature of geoJSON.features) {
    if (feature.properties.ref === nodeId && feature.geometry.type === "Polygon") {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const center = require("geojson-polygon-center")(feature.geometry);
      return center.coordinates;
    }
  }
  return null;
}

function clearRoute(): void {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  routeLayers.forEach(layer => {
    try {
      geoMap.mapInstance.removeLayer(layer);
    } catch (e) {
      // layer may already be removed
    }
  });
  routeLayers = [];
}

function drawRoute(routeData: RouteResponse, nodeCoordinates: Map<string, { coordinates: [number, number]; level: number }>): void {
  clearRoute();

  if (!routeData.path || routeData.path.length < 2) return;

  // Group path nodes by level for multi-floor rendering
  const levelSegments = new Map<number, GeoJSON.Position[][]>();

  let currentSegment: GeoJSON.Position[] = [];
  let currentLevel = -1;

  for (const nodeId of routeData.path) {
    const nodeInfo = nodeCoordinates.get(nodeId);
    if (!nodeInfo) continue;

    const level = Array.isArray(nodeInfo.level) ? (nodeInfo.level as unknown as number[])[0] : nodeInfo.level;

    if (currentLevel !== level && currentSegment.length > 0) {
      if (!levelSegments.has(currentLevel)) levelSegments.set(currentLevel, []);
      levelSegments.get(currentLevel)!.push(currentSegment);
      currentSegment = [nodeInfo.coordinates];
    } else {
      currentSegment.push(nodeInfo.coordinates);
    }
    currentLevel = level;
  }

  if (currentSegment.length > 0) {
    if (!levelSegments.has(currentLevel)) levelSegments.set(currentLevel, []);
    levelSegments.get(currentLevel)!.push(currentSegment);
  }

  // Draw route on each level
  const activeLevel = geoMap.getCurrentLevel();

  levelSegments.forEach((segments, level) => {
    const isActive = level === activeLevel;
    const layerName = `route-${level}-${Date.now()}`;
    const routeLayer = new Maptalks.VectorLayer(layerName, undefined, {
      enableAltitude: true,
    });

    segments.forEach(coords => {
      if (coords.length < 2) return;

      const line = new Maptalks.LineString(coords, {
        symbol: {
          lineColor: ROUTE_COLOR,
          lineWidth: 4,
          lineDasharray: [10, 5],
          lineOpacity: isActive ? 1 : 0.3,
        },
      });
      routeLayer.addGeometry(line);
    });

    routeLayer.addTo(geoMap.mapInstance);
    routeLayers.push(routeLayer);
  });

  // Add start and end markers
  const startNode = nodeCoordinates.get(routeData.path[0]);
  const endNode = nodeCoordinates.get(routeData.path[routeData.path.length - 1]);

  if (startNode) {
    addRouteMarker(startNode.coordinates, ROUTE_START_COLOR, '출발');
  }
  if (endNode) {
    addRouteMarker(endNode.coordinates, ROUTE_END_COLOR, '도착');
  }

  // Animate route drawing
  animateRouteDraw();
}

function addRouteMarker(coordinates: [number, number], color: string, label: string): void {
  const layerName = `route-marker-${Date.now()}-${Math.random()}`;
  const layer = new Maptalks.VectorLayer(layerName);

  new Maptalks.Marker(coordinates, {
    properties: { name: label },
    symbol: [
      {
        markerType: 'pin',
        markerFill: color,
        markerLineColor: '#ffffff',
        markerLineWidth: 2,
        markerWidth: 40,
        markerHeight: 50,
      },
      {
        textFaceName: 'sans-serif',
        textName: '{name}',
        textSize: 12,
        textDy: -30,
        textFill: '#fff',
        textHaloFill: 'rgba(0,0,0,0.7)',
        textHaloRadius: 3,
      } as Maptalks.TextSymbol,
    ],
  }).addTo(layer);

  layer.addTo(geoMap.mapInstance);
  routeLayers.push(layer);
}

function animateRouteDraw(): void {
  // Simple dash offset animation for route lines
  let offset = 0;
  const SPEED = 0.5;

  function tick() {
    offset += SPEED;
    routeLayers.forEach(layer => {
      layer.forEach((geo: Maptalks.Geometry) => {
        if (geo instanceof Maptalks.LineString) {
          geo.updateSymbol({ lineDashOffset: -offset });
        }
      });
    });
    animationId = requestAnimationFrame(tick);
  }

  animationId = requestAnimationFrame(tick);
}

function updateRouteOpacityForLevel(activeLevel: number): void {
  routeLayers.forEach(layer => {
    const name = layer.getId() as string;
    const match = name.match(/^route-(\d+)/);
    if (match) {
      const level = parseInt(match[1]);
      const opacity = level === activeLevel ? 1 : 0.3;
      layer.forEach((geo: Maptalks.Geometry) => {
        if (geo instanceof Maptalks.LineString) {
          geo.updateSymbol({ lineOpacity: opacity });
        }
      });
    }
  });
}

export default {
  clearRoute,
  drawRoute,
  updateRouteOpacityForLevel,
  getNodeCoordinates,
};
