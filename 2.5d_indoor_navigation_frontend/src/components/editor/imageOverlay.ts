/**
 * ImageOverlay — DOM canvas 기반 이미지 오버레이
 *
 * Maptalks CanvasLayer 대신 맵 컨테이너에 직접 <canvas>를 올리고,
 * 맵 viewchange 이벤트마다 4꼭짓점을 coordinateToContainerPoint로 변환하여
 * affine transform으로 그린다. 이미지가 지면에 고정된 것처럼 동작한다.
 */

import * as Maptalks from "maptalks";
import type { EditorController } from "./editorController";

export interface OverlayState {
  imageSrc: string | null;
  center: [number, number];
  width: number;      // degrees longitude
  height: number;     // degrees latitude
  rotation: number;   // degrees
  opacity: number;    // 0-1
}

export class ImageOverlay {
  private controller: EditorController;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private image: HTMLImageElement | null = null;
  private state: OverlayState = {
    imageSrc: null,
    center: [126.9759, 37.2935],
    width: 0.0015,
    height: 0.0012,
    rotation: -8.81,
    opacity: 0.5,
  };

  // Per-level overlay states
  private levelStates: Map<number, OverlayState> = new Map();

  // Bound listener reference for cleanup
  private redrawBound = () => this.redraw();

  constructor(controller: EditorController) {
    this.controller = controller;
  }

  getState(): OverlayState {
    return { ...this.state };
  }

  // ─── Load image from file input ───

  loadImage(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.state.imageSrc = img.src;

        // Auto-set aspect ratio
        const aspect = img.width / img.height;
        this.state.height = this.state.width / aspect;

        this.ensureCanvas();
        this.redraw();
      };
      img.onerror = () => {
        console.error('Failed to load image');
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  // ─── DOM canvas management ───

  private ensureCanvas(): void {
    if (this.canvas) return;

    const map = this.controller.getMap();
    const container = map.getContainer();
    if (!container) return;

    // Create canvas sized to container
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '1'; // above tiles, below vector layers

    this.resizeCanvas();
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Listen to ALL map view changes
    map.on('viewchange moving zooming zoomend moveend rotate rotateend resize', this.redrawBound);

    // Also handle container resize
    window.addEventListener('resize', this.redrawBound);
  }

  private resizeCanvas(): void {
    if (!this.canvas) return;
    const map = this.controller.getMap();
    const size = map.getSize();
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    this.canvas.style.width = size.width + 'px';
    this.canvas.style.height = size.height + 'px';
  }

  private redraw(): void {
    if (!this.canvas || !this.ctx || !this.image) return;

    // Resize if needed
    const map = this.controller.getMap();
    const size = map.getSize();
    if (this.canvas.width !== size.width || this.canvas.height !== size.height) {
      this.resizeCanvas();
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const { center, width, height, rotation, opacity } = this.state;

    // Compute 4 geo corners of the rotated image rectangle
    const halfW = width / 2;
    const halfH = height / 2;
    const rad = rotation * Math.PI / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    // Local corners before rotation: TL, TR, BR, BL (geo: +lat = up)
    const localCorners: [number, number][] = [
      [-halfW,  halfH],
      [ halfW,  halfH],
      [ halfW, -halfH],
      [-halfW, -halfH],
    ];

    // Rotate and offset to geo coordinates
    const geoCorners = localCorners.map(([dx, dy]) => {
      const rx = dx * cosR - dy * sinR;
      const ry = dx * sinR + dy * cosR;
      return new Maptalks.Coordinate(center[0] + rx, center[1] + ry);
    });

    // Convert to screen pixel coords — handles bearing/zoom/pan automatically
    const [tl, tr, _br, bl] = geoCorners.map(c => map.coordinateToContainerPoint(c));

    // Affine transform: image pixels → screen pixels
    // (0,0) → tl,  (imgW,0) → tr,  (0,imgH) → bl
    const imgW = this.image.naturalWidth;
    const imgH = this.image.naturalHeight;

    const a = (tr.x - tl.x) / imgW;
    const b = (tr.y - tl.y) / imgW;
    const c = (bl.x - tl.x) / imgH;
    const d = (bl.y - tl.y) / imgH;
    const e = tl.x;
    const f = tl.y;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(this.image, 0, 0);
    ctx.restore();
  }

  // ─── Controls ───

  setOpacity(value: number): void {
    this.state.opacity = Math.max(0, Math.min(1, value));
    this.redraw();
  }

  setRotation(degrees: number): void {
    this.state.rotation = degrees;
    this.redraw();
  }

  setCenter(lng: number, lat: number): void {
    this.state.center = [lng, lat];
    this.redraw();
  }

  setSize(width: number, height: number): void {
    this.state.width = width;
    this.state.height = height;
    this.redraw();
  }

  scaleBy(factor: number): void {
    this.state.width *= factor;
    this.state.height *= factor;
    this.redraw();
  }

  moveBy(dLng: number, dLat: number): void {
    this.state.center[0] += dLng;
    this.state.center[1] += dLat;
    this.redraw();
  }

  // ─── Per-level state management ───

  onLevelChange(level: number): void {
    // Save current state for the old level
    const oldLevel = this.controller.getCurrentLevel();
    if (this.image) {
      this.levelStates.set(oldLevel, { ...this.state });
    }

    // Restore state for new level (if exists)
    const saved = this.levelStates.get(level);
    if (saved && saved.imageSrc) {
      this.state = { ...saved };
      if (this.image?.src !== saved.imageSrc) {
        const img = new Image();
        img.onload = () => {
          this.image = img;
          this.ensureCanvas();
          this.redraw();
        };
        img.src = saved.imageSrc;
      } else {
        this.redraw();
      }
    } else {
      // No overlay for this level — clear
      if (this.ctx && this.canvas) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      this.image = null;
      this.state.imageSrc = null;
    }
  }

  // ─── Remove ───

  remove(): void {
    const map = this.controller.getMap();
    map.off('viewchange moving zooming zoomend moveend rotate rotateend resize', this.redrawBound);
    window.removeEventListener('resize', this.redrawBound);

    if (this.canvas && this.canvas.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.image = null;
    this.state.imageSrc = null;
  }

  // ─── Export state for settings JSON ───

  exportSettings(): Record<number, OverlayState> {
    if (this.image) {
      this.levelStates.set(this.controller.getCurrentLevel(), { ...this.state });
    }

    const result: Record<number, OverlayState> = {};
    this.levelStates.forEach((state, level) => {
      if (state.imageSrc) {
        result[level] = state;
      }
    });
    return result;
  }

  importSettings(settings: Record<number, OverlayState>): void {
    for (const [levelStr, state] of Object.entries(settings)) {
      this.levelStates.set(parseInt(levelStr), state);
    }
    const currentState = this.levelStates.get(this.controller.getCurrentLevel());
    if (currentState?.imageSrc) {
      this.state = { ...currentState };
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.ensureCanvas();
        this.redraw();
      };
      img.src = currentState.imageSrc;
    }
  }
}
