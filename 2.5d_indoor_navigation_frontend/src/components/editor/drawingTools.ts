/**
 * DrawingTools — 벽(LineString)/공간(Polygon)/POI(Point) 그리기+편집+삭제
 *
 * Uses Maptalks DrawTool [Layer 1] for all drawing operations.
 * Supports: create, select, edit vertices (.startEdit()), move, delete.
 */

import * as Maptalks from "maptalks";
import type { EditorController, UndoAction } from "./editorController";

export type EditorTool = 'wall' | 'space' | 'poi' | 'select' | 'graph-node' | 'graph-edge' | 'image';

// POI types the user can place
export type PoiType = 'stairs' | 'elevator' | 'door' | 'restroom';

// Space types
export type SpaceType = 'room' | 'corridor';

// Room types for classification
export type RoomType = 'classroom' | 'lab' | 'office' | 'restroom' | 'stairs' | 'other';

// Colors for visual feedback in editor
const EDITOR_COLORS = {
  wall: '#333333',
  wallSelected: '#FF5722',
  room: '#8FB8D0',
  corridor: '#E0E0E0',
  spaceSelected: '#FF9800',
  poi: {
    stairs: '#A1887F',
    elevator: '#42A5F5',
    door: '#66BB6A',
    restroom: '#CE93D8',
  },
};

let idCounter = 0;
function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

export class DrawingTools {
  private controller: EditorController;
  private drawTool: Maptalks.DrawTool | null = null;
  private selectedGeometry: Maptalks.Geometry | null = null;
  private currentPoiType: PoiType = 'stairs';

  // Custom draw handlers (for wall/space right-click-to-finish)
  private mapClickHandler: ((e: any) => void) | null = null;
  private mapRightClickHandler: ((e: any) => void) | null = null;
  private contextMenuHandler: ((e: MouseEvent) => void) | null = null;

  // Preview layer for drawing in progress
  private previewLayer: Maptalks.VectorLayer | null = null;

  constructor(controller: EditorController) {
    this.controller = controller;
  }

  activate(tool: EditorTool): void {
    this.deactivate();

    switch (tool) {
      case 'wall':
        this.startWallDraw();
        break;
      case 'space':
        this.startSpaceDraw();
        break;
      case 'poi':
        this.startPoiPlace();
        break;
      case 'select':
        this.enableSelection();
        break;
    }
  }

  deactivate(): void {
    const map = this.controller.getMap();

    // Clean up DrawTool (used for POI)
    if (this.drawTool) {
      this.drawTool.disable();
      this.drawTool.remove();
      this.drawTool = null;
    }

    // Clean up custom click handlers (wall/space)
    if (this.mapClickHandler) {
      map.off('click', this.mapClickHandler);
      this.mapClickHandler = null;
    }
    if (this.mapRightClickHandler) {
      map.off('contextmenu', this.mapRightClickHandler);
      this.mapRightClickHandler = null;
    }
    if (this.contextMenuHandler) {
      map.getContainer().removeEventListener('contextmenu', this.contextMenuHandler);
      this.contextMenuHandler = null;
    }

    this.clearDrawPreview();
    this.deselectAll();
  }

  setPoiType(type: PoiType): void {
    this.currentPoiType = type;
  }

  // ─── Wall Drawing (좌클릭: 점 추가, 우클릭: 완료) ───

  private startWallDraw(): void {
    const map = this.controller.getMap();
    const points: number[][] = [];

    // Prevent context menu on right-click
    this.contextMenuHandler = (e: MouseEvent) => e.preventDefault();
    map.getContainer().addEventListener('contextmenu', this.contextMenuHandler);

    // Left click: add point
    this.mapClickHandler = (e: any) => {
      points.push([e.coordinate.x, e.coordinate.y]);
      this.updateDrawPreview(points, 'line');
    };
    map.on('click', this.mapClickHandler);

    // Right click: finish drawing
    this.mapRightClickHandler = (e: any) => {
      if (points.length < 2) return; // need at least 2 points for a line
      this.clearDrawPreview();
      this.createWall(points);
      points.length = 0; // reset for next wall
    };
    map.on('contextmenu', this.mapRightClickHandler);
  }

  private createWall(points: number[][]): void {
    const id = generateId('wall');
    const level = this.controller.getCurrentLevel();

    const wall = new Maptalks.LineString(points, {
      id: id,
      symbol: {
        lineColor: EDITOR_COLORS.wall,
        lineWidth: 3,
        lineCap: 'round',
        lineJoin: 'round',
      },
      properties: {
        indoor: 'wall',
        level: level.toString(),
        wall_type: 'partition',
      },
    });

    wall.setId(id);
    wall.on('click', () => this.selectGeometry(wall));
    this.controller.getWallsLayer().addGeometry(wall);

    this.controller.pushUndo({
      type: 'add',
      tool: 'wall',
      geometryId: id,
      before: null,
      after: wall.toGeoJSON(),
    });
  }

  // ─── Space Drawing (좌클릭: 점 추가, 우클릭: 완료) ───

  private startSpaceDraw(): void {
    const map = this.controller.getMap();
    const points: number[][] = [];

    this.contextMenuHandler = (e: MouseEvent) => e.preventDefault();
    map.getContainer().addEventListener('contextmenu', this.contextMenuHandler);

    this.mapClickHandler = (e: any) => {
      points.push([e.coordinate.x, e.coordinate.y]);
      this.updateDrawPreview(points, 'polygon');
    };
    map.on('click', this.mapClickHandler);

    this.mapRightClickHandler = (e: any) => {
      if (points.length < 3) return; // need at least 3 points for a polygon
      this.clearDrawPreview();
      this.createSpace(points);
      points.length = 0;
    };
    map.on('contextmenu', this.mapRightClickHandler);
  }

  private createSpace(points: number[][]): void {
    const id = generateId('space');
    const level = this.controller.getCurrentLevel();

    // Close the polygon
    const closed = [...points, points[0]];

    const space = new Maptalks.Polygon([closed] as any);
    space.updateSymbol({
      polygonFill: EDITOR_COLORS.room,
      polygonOpacity: 0.5,
      lineColor: '#666',
      lineWidth: 1,
    });
    space.setProperties({
      indoor: 'room',
      level: level.toString(),
      ref: '',
      room_type: 'classroom',
    });

    space.setId(id);
    space.on('click', () => this.selectGeometry(space));
    this.controller.getSpacesLayer().addGeometry(space);

    this.selectGeometry(space);
    this.controller.panel.showSpacePropertiesPopup(space);

    this.controller.pushUndo({
      type: 'add',
      tool: 'space',
      geometryId: id,
      before: null,
      after: space.toGeoJSON(),
    });
  }

  // ─── POI Placement ───

  private startPoiPlace(): void {
    const map = this.controller.getMap();

    this.drawTool = new Maptalks.DrawTool({ mode: 'Point', once: false })
      .addTo(map)
      .enable();

    this.drawTool.on('drawend', (e: any) => {
      const geometry = e.geometry as Maptalks.Marker;
      if (!geometry) return;

      const coords = geometry.getCoordinates();
      const id = generateId('poi');
      const level = this.controller.getCurrentLevel();
      const poiType = this.currentPoiType;

      const properties: Record<string, any> = {
        level: level.toString(),
        indoor: 'area',
      };

      // Set type-specific properties matching existing GeoJSON schema
      switch (poiType) {
        case 'stairs':
          properties.stairs = 'yes';
          break;
        case 'elevator':
          properties.highway = 'elevator';
          properties.wheelchair = 'yes';
          break;
        case 'door':
          properties.door = 'yes';
          break;
        case 'restroom':
          properties.amenity = 'toilets';
          break;
      }

      const color = EDITOR_COLORS.poi[poiType];
      const marker = new Maptalks.Marker(coords, {
        id: id,
        symbol: {
          markerType: 'ellipse',
          markerFill: color,
          markerWidth: 14,
          markerHeight: 14,
          markerLineColor: '#fff',
          markerLineWidth: 2,
        },
        properties: properties,
      });

      marker.setId(id);
      marker.on('click', () => this.selectGeometry(marker));
      this.controller.getPoisLayer().addGeometry(marker);

      this.controller.pushUndo({
        type: 'add',
        tool: 'poi',
        geometryId: id,
        before: null,
        after: marker.toGeoJSON(),
      });
    });
  }

  // ─── Selection & Editing ───

  private enableSelection(): void {
    const map = this.controller.getMap();

    // On map click, find the nearest geometry across all editor layers and select it
    this.mapClickHandler = (e: any) => {
      const coord = new Maptalks.Coordinate(e.coordinate.x, e.coordinate.y);
      const clickPoint = map.coordinateToContainerPoint(coord);

      const found = this.identifyAtPoint(clickPoint);
      if (found) {
        this.selectGeometry(found);
      } else {
        this.deselectAll();
      }
    };
    map.on('click', this.mapClickHandler);
  }

  /** Find the topmost editor geometry at a screen point */
  private identifyAtPoint(point: Maptalks.Point): Maptalks.Geometry | null {
    const layers = [
      this.controller.getPoisLayer(),
      this.controller.getGraphNodesLayer(),
      this.controller.getGraphEdgesLayer(),
      this.controller.getSpacesLayer(),
      this.controller.getWallsLayer(),
    ];

    // Tolerance in pixels for line/point hit detection
    const tolerance = 10;

    for (const layer of layers) {
      if (!layer) continue;
      // VectorLayer.identify returns geometries at the given container point
      const hits = layer.identify(point, { tolerance });
      if (hits && hits.length > 0) {
        return hits[0];
      }
    }
    return null;
  }

  selectGeometry(geo: Maptalks.Geometry): void {
    this.deselectAll();
    this.selectedGeometry = geo;

    // Highlight
    if (geo instanceof Maptalks.LineString) {
      geo.updateSymbol({ lineColor: EDITOR_COLORS.wallSelected, lineWidth: 4 });
    } else if (geo instanceof Maptalks.Polygon) {
      geo.updateSymbol({ lineColor: EDITOR_COLORS.spaceSelected, lineWidth: 3 });
    } else if (geo instanceof Maptalks.Marker) {
      geo.updateSymbol({ markerLineColor: EDITOR_COLORS.wallSelected, markerLineWidth: 3 });
    }

    // Enable vertex editing (drag vertices to reshape)
    geo.startEdit();

    // Enable dragging (move entire geometry)
    geo.config({ draggable: true });

    // Show properties in panel
    this.controller.panel.showProperties(geo);
  }

  deselectAll(): void {
    if (this.selectedGeometry) {
      try {
        this.selectedGeometry.endEdit();
        this.selectedGeometry.config({ draggable: false });
      } catch (e) {
        // geometry may have been removed
      }

      // Restore original style based on type
      if (this.selectedGeometry instanceof Maptalks.LineString) {
        this.selectedGeometry.updateSymbol({ lineColor: EDITOR_COLORS.wall, lineWidth: 3 });
      } else if (this.selectedGeometry instanceof Maptalks.Polygon) {
        const indoor = this.selectedGeometry.getProperties()?.indoor;
        const fill = indoor === 'corridor' ? EDITOR_COLORS.corridor : EDITOR_COLORS.room;
        this.selectedGeometry.updateSymbol({ polygonFill: fill, lineColor: '#666', lineWidth: 1 });
      } else if (this.selectedGeometry instanceof Maptalks.Marker) {
        this.selectedGeometry.updateSymbol({ markerLineColor: '#fff', markerLineWidth: 2 });
      }

      this.selectedGeometry = null;
    }
    this.controller.panel.clearProperties();
  }

  deleteSelected(): void {
    if (!this.selectedGeometry) return;

    const geo = this.selectedGeometry;
    const id = geo.getId()?.toString() || '';
    const geoJson = geo.toGeoJSON();

    // Determine which tool/layer this belongs to
    let tool = 'wall';
    if (geo instanceof Maptalks.Polygon) tool = 'space';
    else if (geo instanceof Maptalks.Marker) tool = 'poi';

    // End edit before removing
    try { geo.endEdit(); } catch (e) { /* ok */ }
    geo.remove();
    this.selectedGeometry = null;

    this.controller.pushUndo({
      type: 'remove',
      tool: tool,
      geometryId: id,
      before: geoJson,
      after: null,
    });

    this.controller.panel.clearProperties();
  }

  getSelectedGeometry(): Maptalks.Geometry | null {
    return this.selectedGeometry;
  }

  // ─── Update space properties ───

  updateSpaceProperties(geo: Maptalks.Geometry, spaceType: SpaceType, ref: string, roomType: RoomType): void {
    const props = geo.getProperties() || {};
    props.indoor = spaceType === 'room' ? 'room' : 'corridor';
    props.ref = ref;
    props.room_type = roomType;
    geo.setProperties(props);

    // Update visual
    const fill = spaceType === 'corridor' ? EDITOR_COLORS.corridor : EDITOR_COLORS.room;
    geo.updateSymbol({ polygonFill: fill });
  }

  // ─── Drawing preview (shows points/lines while drawing) ───

  private updateDrawPreview(points: number[][], mode: 'line' | 'polygon'): void {
    this.clearDrawPreview();

    if (points.length === 0) return;

    const map = this.controller.getMap();
    this.previewLayer = new Maptalks.VectorLayer('editor-draw-preview', [], {
      enableAltitude: false,
    }).addTo(map);

    // Draw dots at each point
    for (const pt of points) {
      new Maptalks.Marker(pt as [number, number], {
        symbol: {
          markerType: 'ellipse',
          markerFill: '#42A5F5',
          markerWidth: 8,
          markerHeight: 8,
          markerLineColor: '#fff',
          markerLineWidth: 1,
        },
      }).addTo(this.previewLayer);
    }

    // Draw connecting lines
    if (points.length >= 2) {
      const coords = mode === 'polygon' ? [...points, points[0]] : points;
      new Maptalks.LineString(coords, {
        symbol: {
          lineColor: mode === 'polygon' ? '#FF9800' : '#42A5F5',
          lineWidth: 2,
          lineDasharray: [6, 4],
          lineOpacity: 0.7,
        },
      }).addTo(this.previewLayer);
    }
  }

  private clearDrawPreview(): void {
    if (this.previewLayer) {
      this.controller.getMap().removeLayer(this.previewLayer);
      this.previewLayer = null;
    }
  }
}
