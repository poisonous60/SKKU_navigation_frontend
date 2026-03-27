/**
 * GraphTools — 네비게이션 그래프 노드/엣지 배치+편집+삭제
 *
 * Nodes: map click → place node (circle marker) with properties (ref, type)
 * Edges: click node A → click node B → create edge (LineString) with weight
 */

import * as Maptalks from "maptalks";
import type { EditorController } from "./editorController";
import type { EditorTool } from "./drawingTools";

export interface GraphNode {
  id: string;
  coordinates: [number, number];
  level: number;
  ref: string | null;
  type: 'room' | 'corridor' | 'stairs' | 'elevator' | 'entrance';
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  weight: number;
  level: number;
  videoClipId: string | null;
}

const NODE_COLORS: Record<string, string> = {
  room: '#42A5F5',
  corridor: '#78909C',
  stairs: '#A1887F',
  elevator: '#7E57C2',
  entrance: '#66BB6A',
};

let nodeCounter = 0;
let edgeCounter = 0;

export class GraphTools {
  private controller: EditorController;
  private edgeStartNode: string | null = null; // ID of first node when drawing edge
  private mapClickHandler: ((e: any) => void) | null = null;

  constructor(controller: EditorController) {
    this.controller = controller;
  }

  activate(tool: EditorTool): void {
    this.deactivate();

    if (tool === 'graph-node') {
      this.startNodePlace();
    } else if (tool === 'graph-edge') {
      this.startEdgeDraw();
    }
  }

  deactivate(): void {
    this.edgeStartNode = null;
    if (this.mapClickHandler) {
      this.controller.getMap().off('click', this.mapClickHandler);
      this.mapClickHandler = null;
    }
    // Reset node highlights
    const nodesLayer = this.controller.getGraphNodesLayer();
    if (nodesLayer) {
      nodesLayer.forEach((geo: Maptalks.Geometry) => {
        geo.updateSymbol({ markerLineWidth: 2, markerLineColor: '#fff' });
      });
    }
  }

  // ─── Node Placement ───

  private startNodePlace(): void {
    const handler = (e: any) => {
      const coords: [number, number] = [e.coordinate.x, e.coordinate.y];
      this.placeNode(coords, 'corridor', null);
    };
    this.mapClickHandler = handler;
    this.controller.getMap().on('click', handler);
  }

  placeNode(coords: [number, number], type: string, ref: string | null): string {
    const id = `node_${Date.now()}_${++nodeCounter}`;
    const level = this.controller.getCurrentLevel();
    const color = NODE_COLORS[type] || NODE_COLORS.corridor;

    const marker = new Maptalks.Marker(coords, {
      id: id,
      symbol: {
        markerType: 'ellipse',
        markerFill: color,
        markerWidth: 12,
        markerHeight: 12,
        markerLineColor: '#fff',
        markerLineWidth: 2,
      },
      properties: {
        id: id,
        level: level,
        ref: ref,
        type: type,
        _isGraphNode: true,
      },
    });

    marker.setId(id);
    marker.on('click', (e: any) => {
      e.domEvent?.stopPropagation?.();
      this.onNodeClick(id);
    });

    this.controller.getGraphNodesLayer().addGeometry(marker);

    this.controller.pushUndo({
      type: 'add',
      tool: 'graph-node',
      geometryId: id,
      before: null,
      after: marker.toGeoJSON(),
    });

    // Show node properties for editing
    this.controller.panel.showGraphNodeProperties(marker);

    return id;
  }

  private onNodeClick(nodeId: string): void {
    const currentTool = this.controller.getCurrentTool();

    if (currentTool === 'graph-edge') {
      this.handleEdgeNodeClick(nodeId);
    } else if (currentTool === 'select' || currentTool === 'graph-node') {
      // Select node for property editing
      const marker = this.controller.getGraphNodesLayer().getGeometryById(nodeId);
      if (marker) {
        this.controller.panel.showGraphNodeProperties(marker as Maptalks.Marker);
      }
    }
  }

  // ─── Edge Drawing ───

  private startEdgeDraw(): void {
    // Edge drawing works by clicking two nodes in sequence
    // Node click handlers call handleEdgeNodeClick
    this.edgeStartNode = null;
  }

  private handleEdgeNodeClick(nodeId: string): void {
    if (!this.edgeStartNode) {
      // First node selected
      this.edgeStartNode = nodeId;
      // Highlight it
      const marker = this.controller.getGraphNodesLayer().getGeometryById(nodeId);
      if (marker) {
        marker.updateSymbol({ markerLineColor: '#FF5722', markerLineWidth: 3 });
      }
    } else if (this.edgeStartNode !== nodeId) {
      // Second node selected — create edge
      this.createEdge(this.edgeStartNode, nodeId);

      // Reset highlight
      const startMarker = this.controller.getGraphNodesLayer().getGeometryById(this.edgeStartNode);
      if (startMarker) {
        startMarker.updateSymbol({ markerLineColor: '#fff', markerLineWidth: 2 });
      }

      this.edgeStartNode = null;
    }
  }

  private createEdge(fromId: string, toId: string): void {
    const fromMarker = this.controller.getGraphNodesLayer().getGeometryById(fromId) as Maptalks.Marker;
    const toMarker = this.controller.getGraphNodesLayer().getGeometryById(toId) as Maptalks.Marker;
    if (!fromMarker || !toMarker) return;

    const fromCoords = fromMarker.getCoordinates();
    const toCoords = toMarker.getCoordinates();

    // Calculate weight as distance in degrees (approximate)
    const dx = toCoords.x - fromCoords.x;
    const dy = toCoords.y - fromCoords.y;
    const weight = Math.round(Math.sqrt(dx * dx + dy * dy) * 111000 * 10) / 10; // ~meters

    const id = `edge_${Date.now()}_${++edgeCounter}`;
    const level = this.controller.getCurrentLevel();

    const line = new Maptalks.LineString([
      [fromCoords.x, fromCoords.y],
      [toCoords.x, toCoords.y],
    ], {
      id: id,
      symbol: {
        lineColor: '#FF9800',
        lineWidth: 2,
        lineDasharray: [6, 4],
        lineOpacity: 0.8,
      },
      properties: {
        id: id,
        from: fromId,
        to: toId,
        weight: weight,
        level: level,
        videoClipId: null,
        _isGraphEdge: true,
      },
    });

    line.setId(id);
    line.on('click', () => {
      this.controller.panel.showGraphEdgeProperties(line);
    });

    this.controller.getGraphEdgesLayer().addGeometry(line);

    this.controller.pushUndo({
      type: 'add',
      tool: 'graph-edge',
      geometryId: id,
      before: null,
      after: line.toGeoJSON(),
    });
  }

  // ─── Node/Edge deletion (called from select mode) ───

  deleteNode(nodeId: string): void {
    const marker = this.controller.getGraphNodesLayer().getGeometryById(nodeId);
    if (!marker) return;

    // Also delete connected edges
    const edgesLayer = this.controller.getGraphEdgesLayer();
    const edgesToRemove: Maptalks.Geometry[] = [];
    edgesLayer.forEach((geo: Maptalks.Geometry) => {
      const props = geo.getProperties();
      if (props?.from === nodeId || props?.to === nodeId) {
        edgesToRemove.push(geo);
      }
    });

    for (const edge of edgesToRemove) {
      this.controller.pushUndo({
        type: 'remove',
        tool: 'graph-edge',
        geometryId: edge.getId()?.toString() || '',
        before: edge.toGeoJSON(),
        after: null,
      });
      edge.remove();
    }

    this.controller.pushUndo({
      type: 'remove',
      tool: 'graph-node',
      geometryId: nodeId,
      before: marker.toGeoJSON(),
      after: null,
    });
    marker.remove();
  }
}
