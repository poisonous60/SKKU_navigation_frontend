/**
 * EditorPanel — 에디터 UI (toolbar, 속성 패널, 타입 선택 팝업)
 *
 * All UI is built from DOM elements defined in index.html.
 * This module wires up event listeners and updates state.
 */

import * as Maptalks from "maptalks";
import type { EditorController } from "./editorController";
import type { EditorTool, PoiType, SpaceType, RoomType } from "./drawingTools";
import { EditorExport } from "./editorExport";

export class EditorPanel {
  private controller: EditorController;

  constructor(controller: EditorController) {
    this.controller = controller;
  }

  show(): void {
    const toolbar = document.getElementById('editorToolbar');
    if (toolbar) toolbar.style.display = 'flex';

    const panel = document.getElementById('editorPropertiesPanel');
    if (panel) panel.style.display = 'block';

    this.setupToolbarEvents();
    this.setupExportEvents();
    this.setupImageOverlayEvents();
    this.setupLevelSelector();
  }

  hide(): void {
    const toolbar = document.getElementById('editorToolbar');
    if (toolbar) toolbar.style.display = 'none';

    const panel = document.getElementById('editorPropertiesPanel');
    if (panel) panel.style.display = 'none';
  }

  // ─── Toolbar ───

  private setupToolbarEvents(): void {
    const toolButtons: Record<string, EditorTool> = {
      'editorToolSelect': 'select',
      'editorToolWall': 'wall',
      'editorToolSpace': 'space',
      'editorToolPoi': 'poi',
      'editorToolGraphNode': 'graph-node',
      'editorToolGraphEdge': 'graph-edge',
      'editorToolImage': 'image',
    };

    for (const [btnId, tool] of Object.entries(toolButtons)) {
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => this.controller.switchTool(tool));
      }
    }

    // Tile source selector
    const tileSelect = document.getElementById('editorTileSource') as HTMLSelectElement;
    if (tileSelect) {
      tileSelect.addEventListener('change', () => {
        this.controller.switchTileSource(tileSelect.value);
      });
    }

    // POI type selector
    const poiTypeSelect = document.getElementById('editorPoiType') as HTMLSelectElement;
    if (poiTypeSelect) {
      poiTypeSelect.addEventListener('change', () => {
        this.controller.drawingTools.setPoiType(poiTypeSelect.value as PoiType);
      });
    }

    // Undo/redo buttons
    document.getElementById('editorUndo')?.addEventListener('click', () => this.controller.undo());
    document.getElementById('editorRedo')?.addEventListener('click', () => this.controller.redo());

    // Delete button
    document.getElementById('editorDelete')?.addEventListener('click', () => {
      this.controller.drawingTools.deleteSelected();
    });

    // Exit editor
    document.getElementById('editorExit')?.addEventListener('click', () => {
      if (confirm('에디터를 종료하시겠습니까? 저장하지 않은 변경사항은 사라집니다.')) {
        this.controller.exitEditorMode();
      }
    });
  }

  // ─── Level selector ───

  private setupLevelSelector(): void {
    const select = document.getElementById('editorLevelSelect') as HTMLSelectElement;
    if (!select) return;

    select.innerHTML = '';
    const levels = this.controller.getAllLevels();
    for (const level of levels) {
      const option = document.createElement('option');
      option.value = level.toString();
      option.textContent = `${level}F`;
      if (level === this.controller.getCurrentLevel()) {
        option.selected = true;
      }
      select.appendChild(option);
    }

    select.addEventListener('change', () => {
      this.controller.setLevel(parseInt(select.value));
    });
  }

  // ─── Tool state update (highlight active button) ───

  updateToolState(tool: EditorTool): void {
    const allBtns = document.querySelectorAll('.editor-tool-btn');
    allBtns.forEach(btn => btn.classList.remove('active'));

    const mapping: Record<string, string> = {
      'select': 'editorToolSelect',
      'wall': 'editorToolWall',
      'space': 'editorToolSpace',
      'poi': 'editorToolPoi',
      'graph-node': 'editorToolGraphNode',
      'graph-edge': 'editorToolGraphEdge',
      'image': 'editorToolImage',
    };

    const activeBtn = document.getElementById(mapping[tool]);
    if (activeBtn) activeBtn.classList.add('active');

    // Show/hide POI type selector
    const poiOptions = document.getElementById('editorPoiOptions');
    if (poiOptions) poiOptions.style.display = tool === 'poi' ? 'block' : 'none';

    // Show/hide image overlay controls
    const imgControls = document.getElementById('editorImageControls');
    if (imgControls) imgControls.style.display = tool === 'image' ? 'block' : 'none';
  }

  // ─── Properties panel ───

  showProperties(geo: Maptalks.Geometry): void {
    const panel = document.getElementById('editorPropertiesContent');
    if (!panel) return;

    const props = geo.getProperties() || {};

    if (geo instanceof Maptalks.Polygon) {
      this.showSpacePropertiesInPanel(geo, panel);
    } else if (geo instanceof Maptalks.LineString) {
      panel.innerHTML = `
        <div class="editor-prop-group">
          <label>Type</label>
          <span>Wall</span>
        </div>
        <div class="editor-prop-group">
          <label>Wall Type</label>
          <select id="propWallType">
            <option value="partition" ${props.wall_type === 'partition' ? 'selected' : ''}>Partition</option>
            <option value="exterior" ${props.wall_type === 'exterior' ? 'selected' : ''}>Exterior</option>
            <option value="corridor" ${props.wall_type === 'corridor' ? 'selected' : ''}>Corridor</option>
          </select>
        </div>
      `;
      document.getElementById('propWallType')?.addEventListener('change', (e) => {
        const val = (e.target as HTMLSelectElement).value;
        const p = geo.getProperties() || {};
        p.wall_type = val;
        geo.setProperties(p);
      });
    } else if (geo instanceof Maptalks.Marker) {
      panel.innerHTML = `
        <div class="editor-prop-group">
          <label>Type</label>
          <span>POI</span>
        </div>
        <div class="editor-prop-group">
          <label>Properties</label>
          <pre style="font-size:11px;max-height:100px;overflow:auto;">${JSON.stringify(props, null, 2)}</pre>
        </div>
      `;
    }
  }

  private showSpacePropertiesInPanel(geo: Maptalks.Polygon, panel: HTMLElement): void {
    const props = geo.getProperties() || {};

    panel.innerHTML = `
      <div class="editor-prop-group">
        <label>공간 타입</label>
        <select id="propSpaceType">
          <option value="room" ${props.indoor === 'room' ? 'selected' : ''}>방 (Room)</option>
          <option value="corridor" ${props.indoor === 'corridor' ? 'selected' : ''}>복도 (Corridor)</option>
        </select>
      </div>
      <div class="editor-prop-group">
        <label>방 번호 (ref)</label>
        <input type="text" id="propRef" value="${props.ref || ''}" placeholder="예: 2101" />
      </div>
      <div class="editor-prop-group">
        <label>방 유형</label>
        <select id="propRoomType">
          <option value="classroom" ${props.room_type === 'classroom' ? 'selected' : ''}>교실</option>
          <option value="lab" ${props.room_type === 'lab' ? 'selected' : ''}>실험실</option>
          <option value="office" ${props.room_type === 'office' ? 'selected' : ''}>사무실</option>
          <option value="restroom" ${props.room_type === 'restroom' ? 'selected' : ''}>화장실</option>
          <option value="stairs" ${props.room_type === 'stairs' ? 'selected' : ''}>계단</option>
          <option value="other" ${props.room_type === 'other' ? 'selected' : ''}>기타</option>
        </select>
      </div>
      <button id="propApply" class="editor-btn editor-btn-primary">적용</button>
    `;

    document.getElementById('propApply')?.addEventListener('click', () => {
      const spaceType = (document.getElementById('propSpaceType') as HTMLSelectElement).value as SpaceType;
      const ref = (document.getElementById('propRef') as HTMLInputElement).value;
      const roomType = (document.getElementById('propRoomType') as HTMLSelectElement).value as RoomType;
      this.controller.drawingTools.updateSpaceProperties(geo, spaceType, ref, roomType);
    });
  }

  showSpacePropertiesPopup(geo: Maptalks.Polygon): void {
    // Just show in the panel
    const panel = document.getElementById('editorPropertiesContent');
    if (panel) this.showSpacePropertiesInPanel(geo, panel);
  }

  clearProperties(): void {
    const panel = document.getElementById('editorPropertiesContent');
    if (panel) panel.innerHTML = '<p class="editor-hint">요소를 선택하면 속성이 표시됩니다.</p>';
  }

  // ─── Graph node/edge properties ───

  showGraphNodeProperties(marker: Maptalks.Marker): void {
    const panel = document.getElementById('editorPropertiesContent');
    if (!panel) return;

    const props = marker.getProperties() || {};

    panel.innerHTML = `
      <div class="editor-prop-group">
        <label>노드 타입</label>
        <select id="propNodeType">
          <option value="room" ${props.type === 'room' ? 'selected' : ''}>방</option>
          <option value="corridor" ${props.type === 'corridor' ? 'selected' : ''}>복도</option>
          <option value="stairs" ${props.type === 'stairs' ? 'selected' : ''}>계단</option>
          <option value="elevator" ${props.type === 'elevator' ? 'selected' : ''}>엘리베이터</option>
          <option value="entrance" ${props.type === 'entrance' ? 'selected' : ''}>출입구</option>
        </select>
      </div>
      <div class="editor-prop-group">
        <label>연결 방 번호 (ref)</label>
        <input type="text" id="propNodeRef" value="${props.ref || ''}" placeholder="예: 2101" />
      </div>
      <button id="propNodeApply" class="editor-btn editor-btn-primary">적용</button>
      <button id="propNodeDelete" class="editor-btn editor-btn-danger">삭제</button>
    `;

    document.getElementById('propNodeApply')?.addEventListener('click', () => {
      const type = (document.getElementById('propNodeType') as HTMLSelectElement).value;
      const ref = (document.getElementById('propNodeRef') as HTMLInputElement).value || null;
      const p = marker.getProperties() || {};
      p.type = type;
      p.ref = ref;
      marker.setProperties(p);

      // Update color
      const colors: Record<string, string> = {
        room: '#42A5F5', corridor: '#78909C', stairs: '#A1887F',
        elevator: '#7E57C2', entrance: '#66BB6A',
      };
      marker.updateSymbol({ markerFill: colors[type] || '#78909C' });
    });

    document.getElementById('propNodeDelete')?.addEventListener('click', () => {
      const nodeId = marker.getId()?.toString();
      if (nodeId) this.controller.graphTools.deleteNode(nodeId);
      this.clearProperties();
    });
  }

  showGraphEdgeProperties(line: Maptalks.LineString): void {
    const panel = document.getElementById('editorPropertiesContent');
    if (!panel) return;

    const props = line.getProperties() || {};

    panel.innerHTML = `
      <div class="editor-prop-group">
        <label>엣지</label>
        <span>${props.from} → ${props.to}</span>
      </div>
      <div class="editor-prop-group">
        <label>가중치 (m)</label>
        <input type="number" id="propEdgeWeight" value="${props.weight || 0}" step="0.1" />
      </div>
      <div class="editor-prop-group">
        <label>비디오 클립 ID</label>
        <input type="text" id="propEdgeClip" value="${props.videoClipId || ''}" placeholder="예: clip_001" />
      </div>
      <button id="propEdgeApply" class="editor-btn editor-btn-primary">적용</button>
      <button id="propEdgeDelete" class="editor-btn editor-btn-danger">삭제</button>
    `;

    document.getElementById('propEdgeApply')?.addEventListener('click', () => {
      const weight = parseFloat((document.getElementById('propEdgeWeight') as HTMLInputElement).value) || 0;
      const clip = (document.getElementById('propEdgeClip') as HTMLInputElement).value || null;
      const p = line.getProperties() || {};
      p.weight = weight;
      p.videoClipId = clip;
      line.setProperties(p);
    });

    document.getElementById('propEdgeDelete')?.addEventListener('click', () => {
      const id = line.getId()?.toString() || '';
      this.controller.pushUndo({
        type: 'remove',
        tool: 'graph-edge',
        geometryId: id,
        before: line.toGeoJSON(),
        after: null,
      });
      line.remove();
      this.clearProperties();
    });
  }

  // ─── Image overlay controls ───

  private setupImageOverlayEvents(): void {
    // Image file input
    const fileInput = document.getElementById('editorImageFile') as HTMLInputElement;
    if (fileInput) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (file) this.controller.imageOverlay.loadImage(file);
      });
    }

    // Opacity slider
    const opacitySlider = document.getElementById('editorImageOpacity') as HTMLInputElement;
    if (opacitySlider) {
      opacitySlider.addEventListener('input', () => {
        this.controller.imageOverlay.setOpacity(parseFloat(opacitySlider.value));
      });
    }

    // Rotation slider
    const rotSlider = document.getElementById('editorImageRotation') as HTMLInputElement;
    if (rotSlider) {
      rotSlider.addEventListener('input', () => {
        this.controller.imageOverlay.setRotation(parseFloat(rotSlider.value));
        const label = document.getElementById('editorImageRotationLabel');
        if (label) label.textContent = `${rotSlider.value}°`;
      });
    }

    // Scale buttons (10%)
    document.getElementById('editorImageScaleUp')?.addEventListener('click', () => {
      this.controller.imageOverlay.scaleBy(1.1);
    });
    document.getElementById('editorImageScaleDown')?.addEventListener('click', () => {
      this.controller.imageOverlay.scaleBy(0.9);
    });

    // Fine scale buttons (1%)
    document.getElementById('editorImageFineScaleUp')?.addEventListener('click', () => {
      this.controller.imageOverlay.scaleBy(1.01);
    });
    document.getElementById('editorImageFineScaleDown')?.addEventListener('click', () => {
      this.controller.imageOverlay.scaleBy(0.99);
    });

    // Move buttons (normal step ~5.5m)
    const moveStep = 0.00005;
    document.getElementById('editorImageMoveUp')?.addEventListener('click', () => {
      this.controller.imageOverlay.moveBy(0, moveStep);
    });
    document.getElementById('editorImageMoveDown')?.addEventListener('click', () => {
      this.controller.imageOverlay.moveBy(0, -moveStep);
    });
    document.getElementById('editorImageMoveLeft')?.addEventListener('click', () => {
      this.controller.imageOverlay.moveBy(-moveStep, 0);
    });
    document.getElementById('editorImageMoveRight')?.addEventListener('click', () => {
      this.controller.imageOverlay.moveBy(moveStep, 0);
    });

    // Fine move buttons (fine step ~0.5m)
    const fineStep = 0.000005;
    document.getElementById('editorImageFineUp')?.addEventListener('click', () => {
      this.controller.imageOverlay.moveBy(0, fineStep);
    });
    document.getElementById('editorImageFineDown')?.addEventListener('click', () => {
      this.controller.imageOverlay.moveBy(0, -fineStep);
    });
    document.getElementById('editorImageFineLeft')?.addEventListener('click', () => {
      this.controller.imageOverlay.moveBy(-fineStep, 0);
    });
    document.getElementById('editorImageFineRight')?.addEventListener('click', () => {
      this.controller.imageOverlay.moveBy(fineStep, 0);
    });

    // Remove image
    document.getElementById('editorImageRemove')?.addEventListener('click', () => {
      this.controller.imageOverlay.remove();
    });
  }

  // ─── Export/Import events ───

  private setupExportEvents(): void {
    // Export current level GeoJSON
    document.getElementById('editorExportLevel')?.addEventListener('click', () => {
      const level = this.controller.getCurrentLevel();
      const geojson = this.controller.editorExport.exportLevelGeoJSON(level);
      this.controller.editorExport.downloadJSON(geojson, `eng1_L${level}.geojson`);
    });

    // Export all levels merged
    document.getElementById('editorExportMerged')?.addEventListener('click', () => {
      const geojson = this.controller.editorExport.mergeAllLevels();
      this.controller.editorExport.downloadJSON(geojson, 'eng1.geojson');
    });

    // Export graph
    document.getElementById('editorExportGraph')?.addEventListener('click', () => {
      const graph = this.controller.editorExport.exportGraphJSON();
      this.controller.editorExport.downloadJSON(graph, 'graph.json');
    });

    // Export settings
    document.getElementById('editorExportSettings')?.addEventListener('click', () => {
      const settings = this.controller.editorExport.exportEditorSettings();
      this.controller.editorExport.downloadJSON(settings, 'editor_settings.json');
    });

    // Import GeoJSON
    const importGeoInput = document.getElementById('editorImportGeoJSON') as HTMLInputElement;
    if (importGeoInput) {
      importGeoInput.addEventListener('change', async () => {
        const file = importGeoInput.files?.[0];
        if (!file) return;
        try {
          const data = await EditorExport.readJSONFile(file);
          if (EditorExport.validateGeoJSON(data)) {
            this.controller.editorExport.importLevelGeoJSON(this.controller.getCurrentLevel(), data);
          } else {
            alert('유효하지 않은 GeoJSON 파일입니다.');
          }
        } catch (e) {
          alert('파일을 읽을 수 없습니다.');
        }
        importGeoInput.value = '';
      });
    }

    // Import graph
    const importGraphInput = document.getElementById('editorImportGraph') as HTMLInputElement;
    if (importGraphInput) {
      importGraphInput.addEventListener('change', async () => {
        const file = importGraphInput.files?.[0];
        if (!file) return;
        try {
          const data = await EditorExport.readJSONFile(file);
          if (EditorExport.validateGraphJSON(data)) {
            this.controller.editorExport.importGraphJSON(data);
          } else {
            alert('유효하지 않은 Graph JSON 파일입니다.');
          }
        } catch (e) {
          alert('파일을 읽을 수 없습니다.');
        }
        importGraphInput.value = '';
      });
    }

    // Import settings
    const importSettingsInput = document.getElementById('editorImportSettings') as HTMLInputElement;
    if (importSettingsInput) {
      importSettingsInput.addEventListener('change', async () => {
        const file = importSettingsInput.files?.[0];
        if (!file) return;
        try {
          const data = await EditorExport.readJSONFile(file);
          this.controller.editorExport.importEditorSettings(data);
        } catch (e) {
          alert('파일을 읽을 수 없습니다.');
        }
        importSettingsInput.value = '';
      });
    }
  }
}
