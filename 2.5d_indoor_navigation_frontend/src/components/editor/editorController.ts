/**
 * EditorController — 에디터 모드 진입/종료, 도구 전환, undo/redo, 층 관리
 *
 * Data Flow:
 *   UI toggle → enterEditorMode() → init layers + tools
 *   Tool buttons → switchTool() → activate DrawTool / select mode
 *   Ctrl+Z/Y → undo()/redo() → restore geometry state
 *   Level selector → setLevel() → save/load per-level state
 */

import * as Maptalks from "maptalks";
import { geoMap } from "../../main";
import { DrawingTools, EditorTool } from "./drawingTools";
import { GraphTools } from "./graphTools";
import { ImageOverlay } from "./imageOverlay";
import { EditorExport } from "./editorExport";
import { EditorPanel } from "./editorPanel";
import BackendService from "../../services/backendService";

export interface UndoAction {
  type: 'add' | 'remove' | 'modify';
  tool: string;
  geometryId: string;
  before: any | null;   // serialized geometry+properties before action
  after: any | null;     // serialized geometry+properties after action
}

export class EditorController {
  private active = false;
  private currentTool: EditorTool = 'select';
  private currentLevel = 1;
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private readonly MAX_UNDO = 50;

  // Layers — one set per level, keyed by level number
  private wallsLayers: Map<number, Maptalks.VectorLayer> = new Map();
  private spacesLayers: Map<number, Maptalks.VectorLayer> = new Map();
  private poisLayers: Map<number, Maptalks.VectorLayer> = new Map();
  private graphNodesLayers: Map<number, Maptalks.VectorLayer> = new Map();
  private graphEdgesLayers: Map<number, Maptalks.VectorLayer> = new Map();

  // Sub-modules
  drawingTools: DrawingTools;
  graphTools: GraphTools;
  imageOverlay: ImageOverlay;
  editorExport: EditorExport;
  panel: EditorPanel;

  // Building outline layer (persists across levels)
  private outlineLayer: Maptalks.VectorLayer | null = null;

  // Original tile layer (to restore on exit)
  private originalBaseLayer: Maptalks.TileLayer | null = null;

  constructor() {
    this.drawingTools = new DrawingTools(this);
    this.graphTools = new GraphTools(this);
    this.imageOverlay = new ImageOverlay(this);
    this.editorExport = new EditorExport(this);
    this.panel = new EditorPanel(this);
  }

  isActive(): boolean {
    return this.active;
  }

  getCurrentLevel(): number {
    return this.currentLevel;
  }

  getCurrentTool(): EditorTool {
    return this.currentTool;
  }

  getMap(): Maptalks.Map {
    return geoMap.mapInstance;
  }

  // ─── Layer accessors ───

  getWallsLayer(): Maptalks.VectorLayer {
    return this.wallsLayers.get(this.currentLevel)!;
  }

  getSpacesLayer(): Maptalks.VectorLayer {
    return this.spacesLayers.get(this.currentLevel)!;
  }

  getPoisLayer(): Maptalks.VectorLayer {
    return this.poisLayers.get(this.currentLevel)!;
  }

  getGraphNodesLayer(): Maptalks.VectorLayer {
    return this.graphNodesLayers.get(this.currentLevel)!;
  }

  getGraphEdgesLayer(): Maptalks.VectorLayer {
    return this.graphEdgesLayers.get(this.currentLevel)!;
  }

  getAllLevels(): number[] {
    return BackendService.getAllLevels();
  }

  // ─── Mode toggle ───

  enterEditorMode(): void {
    if (this.active) return;
    this.active = true;

    // Save original base layer for restore on exit
    this.originalBaseLayer = geoMap.mapInstance.getBaseLayer() as Maptalks.TileLayer;

    // Switch to Google hybrid by default (satellite + labels, most accurate for Korea)
    this.switchTileSource('google-hybrid');

    // Hide existing building layers
    if (geoMap.indoorLayers) {
      geoMap.indoorLayers.forEach(layer => layer.hideAll());
    }

    // Show building outline (from OSM — user wants to keep this)
    this.showBuildingOutline();

    // Initialize layers for all levels
    const levels = BackendService.getAllLevels();
    for (const level of levels) {
      this.initLayersForLevel(level);
    }
    this.currentLevel = levels.length > 0 ? levels[levels.length - 1] : 1;

    // Show only current level layers
    this.showCurrentLevelLayers();

    // Setup keyboard shortcuts
    this.setupKeyboard();

    // Init panel UI
    this.panel.show();

    // Disable pitch for 2D editing, keep rotation enabled
    geoMap.mapInstance.config({ dragPitch: false });
    geoMap.mapInstance.setPitch(0);
  }

  exitEditorMode(): void {
    if (!this.active) return;
    this.active = false;

    // Remove all editor layers
    this.wallsLayers.forEach(l => geoMap.mapInstance.removeLayer(l));
    this.spacesLayers.forEach(l => geoMap.mapInstance.removeLayer(l));
    this.poisLayers.forEach(l => geoMap.mapInstance.removeLayer(l));
    this.graphNodesLayers.forEach(l => geoMap.mapInstance.removeLayer(l));
    this.graphEdgesLayers.forEach(l => geoMap.mapInstance.removeLayer(l));
    this.wallsLayers.clear();
    this.spacesLayers.clear();
    this.poisLayers.clear();
    this.graphNodesLayers.clear();
    this.graphEdgesLayers.clear();

    if (this.outlineLayer) {
      geoMap.mapInstance.removeLayer(this.outlineLayer);
      this.outlineLayer = null;
    }

    // Deactivate tools
    this.drawingTools.deactivate();
    this.graphTools.deactivate();
    this.imageOverlay.remove();

    // Clear undo
    this.undoStack = [];
    this.redoStack = [];

    // Hide panel
    this.panel.hide();

    // Restore original tile layer
    this.restoreOriginalTiles();

    // Re-show building
    geoMap.showBuilding();
  }

  // ─── Level management ───

  setLevel(level: number): void {
    if (level === this.currentLevel) return;

    // Hide current level layers
    this.hideCurrentLevelLayers();

    this.currentLevel = level;

    // Initialize if not yet created
    if (!this.wallsLayers.has(level)) {
      this.initLayersForLevel(level);
    }

    // Show new level layers
    this.showCurrentLevelLayers();

    // Update image overlay for new level
    this.imageOverlay.onLevelChange(level);
  }

  private initLayersForLevel(level: number): void {
    const wallsLayer = new Maptalks.VectorLayer(`editor-walls-${level}`, [], {
      enableAltitude: false,
    }).addTo(geoMap.mapInstance);

    const spacesLayer = new Maptalks.VectorLayer(`editor-spaces-${level}`, [], {
      enableAltitude: false,
    }).addTo(geoMap.mapInstance);

    const poisLayer = new Maptalks.VectorLayer(`editor-pois-${level}`, [], {
      enableAltitude: false,
    }).addTo(geoMap.mapInstance);

    const graphNodesLayer = new Maptalks.VectorLayer(`editor-graph-nodes-${level}`, [], {
      enableAltitude: false,
    }).addTo(geoMap.mapInstance);

    const graphEdgesLayer = new Maptalks.VectorLayer(`editor-graph-edges-${level}`, [], {
      enableAltitude: false,
    }).addTo(geoMap.mapInstance);

    this.wallsLayers.set(level, wallsLayer);
    this.spacesLayers.set(level, spacesLayer);
    this.poisLayers.set(level, poisLayer);
    this.graphNodesLayers.set(level, graphNodesLayer);
    this.graphEdgesLayers.set(level, graphEdgesLayer);

    // Hide initially (showCurrentLevelLayers will show the active one)
    wallsLayer.hide();
    spacesLayer.hide();
    poisLayer.hide();
    graphNodesLayer.hide();
    graphEdgesLayer.hide();
  }

  private showCurrentLevelLayers(): void {
    this.wallsLayers.get(this.currentLevel)?.show();
    this.spacesLayers.get(this.currentLevel)?.show();
    this.poisLayers.get(this.currentLevel)?.show();
    this.graphNodesLayers.get(this.currentLevel)?.show();
    this.graphEdgesLayers.get(this.currentLevel)?.show();
  }

  private hideCurrentLevelLayers(): void {
    this.wallsLayers.get(this.currentLevel)?.hide();
    this.spacesLayers.get(this.currentLevel)?.hide();
    this.poisLayers.get(this.currentLevel)?.hide();
    this.graphNodesLayers.get(this.currentLevel)?.hide();
    this.graphEdgesLayers.get(this.currentLevel)?.hide();
  }

  private showBuildingOutline(): void {
    try {
      const outline = BackendService.getOutline();
      if (outline) {
        this.outlineLayer = new Maptalks.VectorLayer('editor-outline', [], {
          enableAltitude: false,
        }).addTo(geoMap.mapInstance);

        const outlineGeo = new Maptalks.Polygon(outline);
        outlineGeo.updateSymbol({
          polygonFill: '#4d4d4d',
          polygonOpacity: 0.15,
          lineColor: '#333',
          lineWidth: 2,
        });
        this.outlineLayer.addGeometry(outlineGeo);
      }
    } catch (e) {
      console.warn('Could not load building outline:', e);
    }
  }

  // ─── Tile source switching ───

  static readonly TILE_SOURCES: Record<string, { name: string; url: string; subdomains?: string[] }> = {
    'osm': {
      name: 'OpenStreetMap',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    },
    'google-road': {
      name: 'Google 지도',
      url: 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
      subdomains: ['0', '1', '2', '3'],
    },
    'google-satellite': {
      name: 'Google 위성',
      url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
      subdomains: ['0', '1', '2', '3'],
    },
    'google-hybrid': {
      name: 'Google 하이브리드',
      url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      subdomains: ['0', '1', '2', '3'],
    },
  };

  switchTileSource(sourceId: string): void {
    const source = EditorController.TILE_SOURCES[sourceId];
    if (!source) return;

    const map = geoMap.mapInstance;
    const newBase = new Maptalks.TileLayer('editor-base-' + sourceId, {
      urlTemplate: source.url,
      subdomains: source.subdomains || [],
      attribution: source.name,
    });
    map.setBaseLayer(newBase);
  }

  private restoreOriginalTiles(): void {
    if (this.originalBaseLayer) {
      geoMap.mapInstance.setBaseLayer(this.originalBaseLayer);
      this.originalBaseLayer = null;
    }
  }

  // ─── Tool switching ───

  switchTool(tool: EditorTool): void {
    // Deactivate previous
    this.drawingTools.deactivate();
    this.graphTools.deactivate();

    this.currentTool = tool;

    switch (tool) {
      case 'wall':
      case 'space':
      case 'poi':
      case 'select':
        this.drawingTools.activate(tool);
        break;
      case 'graph-node':
      case 'graph-edge':
        this.graphTools.activate(tool);
        break;
      case 'image':
        // Image overlay is persistent, just focus the panel
        break;
    }

    this.panel.updateToolState(tool);
  }

  // ─── Undo / Redo ───

  pushUndo(action: UndoAction): void {
    this.undoStack.push(action);
    if (this.undoStack.length > this.MAX_UNDO) {
      this.undoStack.shift();
    }
    this.redoStack = []; // clear redo on new action
  }

  undo(): void {
    const action = this.undoStack.pop();
    if (!action) return;

    this.applyReverse(action);
    this.redoStack.push(action);
  }

  redo(): void {
    const action = this.redoStack.pop();
    if (!action) return;

    this.applyForward(action);
    this.undoStack.push(action);
  }

  private applyReverse(action: UndoAction): void {
    const layer = this.getLayerForTool(action.tool);
    if (!layer) return;

    switch (action.type) {
      case 'add': {
        // reverse of add = remove
        const geo = layer.getGeometryById(action.geometryId);
        if (geo) geo.remove();
        break;
      }
      case 'remove': {
        // reverse of remove = add back
        if (action.before) {
          const geo = Maptalks.GeoJSON.toGeometry(action.before);
          if (geo) {
            geo.setId(action.geometryId);
            layer.addGeometry(geo);
          }
        }
        break;
      }
      case 'modify': {
        // restore before state
        const existing = layer.getGeometryById(action.geometryId);
        if (existing && action.before) {
          const restored = Maptalks.GeoJSON.toGeometry(action.before);
          if (restored) {
            existing.setCoordinates(restored.getCoordinates());
            existing.setProperties(action.before.properties || {});
          }
        }
        break;
      }
    }
  }

  private applyForward(action: UndoAction): void {
    const layer = this.getLayerForTool(action.tool);
    if (!layer) return;

    switch (action.type) {
      case 'add': {
        if (action.after) {
          const geo = Maptalks.GeoJSON.toGeometry(action.after);
          if (geo) {
            geo.setId(action.geometryId);
            layer.addGeometry(geo);
          }
        }
        break;
      }
      case 'remove': {
        const geo = layer.getGeometryById(action.geometryId);
        if (geo) geo.remove();
        break;
      }
      case 'modify': {
        const existing = layer.getGeometryById(action.geometryId);
        if (existing && action.after) {
          const restored = Maptalks.GeoJSON.toGeometry(action.after);
          if (restored) {
            existing.setCoordinates(restored.getCoordinates());
            existing.setProperties(action.after.properties || {});
          }
        }
        break;
      }
    }
  }

  private getLayerForTool(tool: string): Maptalks.VectorLayer | null {
    switch (tool) {
      case 'wall': return this.getWallsLayer();
      case 'space': return this.getSpacesLayer();
      case 'poi': return this.getPoisLayer();
      case 'graph-node': return this.getGraphNodesLayer();
      case 'graph-edge': return this.getGraphEdgesLayer();
      default: return null;
    }
  }

  // ─── Keyboard shortcuts ───

  private keyHandler = (e: KeyboardEvent) => {
    if (!this.active) return;
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      this.undo();
    } else if (e.ctrlKey && e.key === 'y') {
      e.preventDefault();
      this.redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.currentTool === 'select') {
        this.drawingTools.deleteSelected();
      }
    } else if (e.key === 'Escape') {
      this.drawingTools.deactivate();
      this.graphTools.deactivate();
      this.switchTool('select');
    }
  };

  private setupKeyboard(): void {
    document.addEventListener('keydown', this.keyHandler);
  }

  // ─── Data access for export ───

  getLayerData(): {
    walls: Map<number, Maptalks.VectorLayer>;
    spaces: Map<number, Maptalks.VectorLayer>;
    pois: Map<number, Maptalks.VectorLayer>;
    graphNodes: Map<number, Maptalks.VectorLayer>;
    graphEdges: Map<number, Maptalks.VectorLayer>;
  } {
    return {
      walls: this.wallsLayers,
      spaces: this.spacesLayers,
      pois: this.poisLayers,
      graphNodes: this.graphNodesLayers,
      graphEdges: this.graphEdgesLayers,
    };
  }
}

// Singleton
export const editorController = new EditorController();
