/**
 * EditorExport — GeoJSON/graph.json 내보내기/불러오기 + 에디터 설정 JSON + 합치기
 *
 * Handles:
 * - Export per-level GeoJSON (walls + spaces + POIs)
 * - Export graph.json (navigation nodes + edges)
 * - Export editor settings (image overlay state per level)
 * - Import all of the above
 * - Merge per-level GeoJSON into single file for main app
 */

import * as Maptalks from "maptalks";
import type { EditorController } from "./editorController";
import type { OverlayState } from "./imageOverlay";

export interface EditorSettings {
  building: string;
  currentLevel: number;
  perLevel: Record<number, { imageOverlay: OverlayState }>;
}

export interface GraphJSON {
  nodes: Array<{
    id: string;
    coordinates: [number, number];
    level: number;
    ref: string | null;
    type: string;
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    weight: number;
    level: number;
    videoClipId: string | null;
  }>;
}

export class EditorExport {
  private controller: EditorController;

  constructor(controller: EditorController) {
    this.controller = controller;
  }

  // ─── GeoJSON Export (per level) ───

  exportLevelGeoJSON(level: number): GeoJSON.FeatureCollection {
    const data = this.controller.getLayerData();
    const features: GeoJSON.Feature[] = [];

    const wallsLayer = data.walls.get(level);
    const spacesLayer = data.spaces.get(level);
    const poisLayer = data.pois.get(level);

    if (wallsLayer) {
      wallsLayer.forEach((geo: Maptalks.Geometry) => {
        const gj = geo.toGeoJSON() as GeoJSON.Feature;
        gj.id = geo.getId()?.toString();
        features.push(gj);
      });
    }

    if (spacesLayer) {
      spacesLayer.forEach((geo: Maptalks.Geometry) => {
        const gj = geo.toGeoJSON() as GeoJSON.Feature;
        gj.id = geo.getId()?.toString();
        features.push(gj);
      });
    }

    if (poisLayer) {
      poisLayer.forEach((geo: Maptalks.Geometry) => {
        const gj = geo.toGeoJSON() as GeoJSON.Feature;
        gj.id = geo.getId()?.toString();
        // Convert Marker to Point
        if (gj.geometry.type === 'Point' || !gj.geometry.type) {
          gj.geometry.type = 'Point';
        }
        features.push(gj);
      });
    }

    return {
      type: 'FeatureCollection',
      features: features,
    };
  }

  // ─── GeoJSON Import (per level) ───

  importLevelGeoJSON(level: number, geojson: GeoJSON.FeatureCollection): void {
    const data = this.controller.getLayerData();

    for (const feature of geojson.features) {
      if (!feature.geometry) continue;

      const geoType = feature.geometry.type;
      const props = feature.properties || {};

      if (geoType === 'LineString' && props.indoor === 'wall') {
        // Wall
        const geo = Maptalks.GeoJSON.toGeometry(feature) as Maptalks.LineString;
        if (geo) {
          const id = feature.id?.toString() || `imported_wall_${Date.now()}_${Math.random()}`;
          geo.setId(id);
          geo.updateSymbol({
            lineColor: '#333333',
            lineWidth: 3,
            lineCap: 'round',
            lineJoin: 'round',
          });
          geo.on('click', () => {
            this.controller.drawingTools.selectGeometry(geo);
          });
          data.walls.get(level)?.addGeometry(geo);
        }
      } else if (geoType === 'Polygon') {
        // Space (room or corridor)
        const geo = Maptalks.GeoJSON.toGeometry(feature) as Maptalks.Polygon;
        if (geo) {
          const id = feature.id?.toString() || `imported_space_${Date.now()}_${Math.random()}`;
          geo.setId(id);
          const isCorr = props.indoor === 'corridor';
          geo.updateSymbol({
            polygonFill: isCorr ? '#E0E0E0' : '#8FB8D0',
            polygonOpacity: 0.5,
            lineColor: '#666',
            lineWidth: 1,
          });
          geo.on('click', () => {
            this.controller.drawingTools.selectGeometry(geo);
          });
          data.spaces.get(level)?.addGeometry(geo);
        }
      } else if (geoType === 'Point') {
        // POI
        const coords = (feature.geometry as GeoJSON.Point).coordinates;
        const marker = new Maptalks.Marker(coords as [number, number], {
          symbol: {
            markerType: 'ellipse',
            markerFill: this.getPoiColor(props),
            markerWidth: 14,
            markerHeight: 14,
            markerLineColor: '#fff',
            markerLineWidth: 2,
          },
          properties: props,
        });
        const id = feature.id?.toString() || `imported_poi_${Date.now()}_${Math.random()}`;
        marker.setId(id);
        marker.on('click', () => {
          this.controller.drawingTools.selectGeometry(marker);
        });
        data.pois.get(level)?.addGeometry(marker);
      }
    }
  }

  private getPoiColor(props: Record<string, any>): string {
    if (props.stairs === 'yes') return '#A1887F';
    if (props.highway === 'elevator') return '#42A5F5';
    if (props.door === 'yes') return '#66BB6A';
    if (props.amenity === 'toilets') return '#CE93D8';
    return '#999999';
  }

  // ─── Graph JSON Export ───

  exportGraphJSON(): GraphJSON {
    const data = this.controller.getLayerData();
    const nodes: GraphJSON['nodes'] = [];
    const edges: GraphJSON['edges'] = [];

    data.graphNodes.forEach((layer, level) => {
      layer.forEach((geo: Maptalks.Geometry) => {
        const props = geo.getProperties() || {};
        const coords = (geo as Maptalks.Marker).getCoordinates();
        nodes.push({
          id: props.id || geo.getId()?.toString() || '',
          coordinates: [coords.x, coords.y],
          level: level,
          ref: props.ref || null,
          type: props.type || 'corridor',
        });
      });
    });

    data.graphEdges.forEach((layer, level) => {
      layer.forEach((geo: Maptalks.Geometry) => {
        const props = geo.getProperties() || {};
        edges.push({
          id: props.id || geo.getId()?.toString() || '',
          from: props.from || '',
          to: props.to || '',
          weight: props.weight || 0,
          level: level,
          videoClipId: props.videoClipId || null,
        });
      });
    });

    return { nodes, edges };
  }

  // ─── Graph JSON Import ───

  importGraphJSON(graph: GraphJSON): void {
    for (const node of graph.nodes) {
      const level = node.level;
      const nodesLayer = this.controller.getLayerData().graphNodes.get(level);
      if (!nodesLayer) continue;

      const color = this.getNodeColor(node.type);
      const marker = new Maptalks.Marker(node.coordinates, {
        id: node.id,
        symbol: {
          markerType: 'ellipse',
          markerFill: color,
          markerWidth: 12,
          markerHeight: 12,
          markerLineColor: '#fff',
          markerLineWidth: 2,
        },
        properties: {
          id: node.id,
          level: level,
          ref: node.ref,
          type: node.type,
          _isGraphNode: true,
        },
      });
      marker.setId(node.id);
      nodesLayer.addGeometry(marker);
    }

    for (const edge of graph.edges) {
      const level = edge.level;
      const edgesLayer = this.controller.getLayerData().graphEdges.get(level);
      const nodesLayer = this.controller.getLayerData().graphNodes.get(level);
      if (!edgesLayer || !nodesLayer) continue;

      const fromMarker = nodesLayer.getGeometryById(edge.from) as Maptalks.Marker;
      const toMarker = nodesLayer.getGeometryById(edge.to) as Maptalks.Marker;
      if (!fromMarker || !toMarker) continue;

      const fromCoords = fromMarker.getCoordinates();
      const toCoords = toMarker.getCoordinates();

      const line = new Maptalks.LineString([
        [fromCoords.x, fromCoords.y],
        [toCoords.x, toCoords.y],
      ], {
        id: edge.id,
        symbol: {
          lineColor: '#FF9800',
          lineWidth: 2,
          lineDasharray: [6, 4],
          lineOpacity: 0.8,
        },
        properties: {
          id: edge.id,
          from: edge.from,
          to: edge.to,
          weight: edge.weight,
          level: level,
          videoClipId: edge.videoClipId,
          _isGraphEdge: true,
        },
      });
      line.setId(edge.id);
      edgesLayer.addGeometry(line);
    }
  }

  private getNodeColor(type: string): string {
    const colors: Record<string, string> = {
      room: '#42A5F5',
      corridor: '#78909C',
      stairs: '#A1887F',
      elevator: '#7E57C2',
      entrance: '#66BB6A',
    };
    return colors[type] || '#78909C';
  }

  // ─── Editor Settings Export/Import ───

  exportEditorSettings(): EditorSettings {
    const overlaySettings = this.controller.imageOverlay.exportSettings();
    const perLevel: EditorSettings['perLevel'] = {};

    for (const [level, state] of Object.entries(overlaySettings)) {
      perLevel[parseInt(level)] = { imageOverlay: state };
    }

    return {
      building: 'eng1',
      currentLevel: this.controller.getCurrentLevel(),
      perLevel: perLevel,
    };
  }

  importEditorSettings(settings: EditorSettings): void {
    const overlayStates: Record<number, OverlayState> = {};
    for (const [levelStr, levelSettings] of Object.entries(settings.perLevel)) {
      if (levelSettings.imageOverlay) {
        overlayStates[parseInt(levelStr)] = levelSettings.imageOverlay;
      }
    }
    this.controller.imageOverlay.importSettings(overlayStates);
  }

  // ─── Merge all levels into single GeoJSON ───

  mergeAllLevels(): GeoJSON.FeatureCollection {
    const allFeatures: GeoJSON.Feature[] = [];
    const levels = this.controller.getAllLevels();

    for (const level of levels) {
      const levelGeoJSON = this.exportLevelGeoJSON(level);
      allFeatures.push(...levelGeoJSON.features);
    }

    return {
      type: 'FeatureCollection',
      features: allFeatures,
    };
  }

  // ─── File download helpers ───

  downloadJSON(data: any, filename: string): void {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── File read helper ───

  static readJSONFile(file: File): Promise<any> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          resolve(data);
        } catch (err) {
          reject(new Error('Invalid JSON file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // ─── Validation ───

  static validateGeoJSON(data: any): boolean {
    return !!(
      data &&
      typeof data === 'object' &&
      data.type === 'FeatureCollection' &&
      Array.isArray(data.features)
    );
  }

  static validateGraphJSON(data: any): boolean {
    return !!(
      data &&
      typeof data === 'object' &&
      Array.isArray(data.nodes) &&
      Array.isArray(data.edges)
    );
  }
}
