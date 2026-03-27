import * as THREE from "three";
import { RouteResponse, RouteEdge } from "../../services/apiClient";

interface ClipState {
  video: HTMLVideoElement;
  duration: number;
  offset: number;
  name: string;
}

let container: HTMLElement | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let sphere: THREE.Mesh | null = null;
let currentTexture: THREE.VideoTexture | null = null;

let clips: ClipState[] = [];
let currentClipIndex = 0;
let totalDuration = 0;
let isPlaying = false;
let isFullscreen = false;
let isDragging = false;
let isSeeking = false;

// Mouse rotation state
let lon = 0;
let lat = 0;
let startX = 0;
let startY = 0;
let startLon = 0;
let startLat = 0;

let animFrameId: number | null = null;
let onCloseCallback: (() => void) | null = null;

function createPlayerDOM(parentId: string): void {
  container = document.getElementById(parentId);
  if (!container) return;

  container.innerHTML = `
    <div id="video-player-wrapper" class="video-player-wrapper">
      <div id="video-canvas-container" class="video-canvas"></div>
      <div id="video-loading" class="video-loading" style="display:none;">
        <div class="spinner-border text-light" role="status"></div>
      </div>
      <div id="video-controls" class="video-controls">
        <div id="video-seekbar-container" class="video-seekbar-container">
          <div id="video-seekbar-bg" class="video-seekbar-bg">
            <div id="video-seekbar-fill" class="video-seekbar-fill"></div>
            <div id="video-seekbar-markers"></div>
          </div>
        </div>
        <div class="video-button-row">
          <button id="video-prev-btn" class="video-btn" title="이전 클립">◀</button>
          <button id="video-play-btn" class="video-btn" title="재생/일시정지">▶</button>
          <button id="video-next-btn" class="video-btn" title="다음 클립">▶</button>
          <span id="video-time" class="video-time">0:00 / 0:00</span>
          <span id="video-clip-label" class="video-clip-label">1/1</span>
          <button id="video-reset-view-btn" class="video-btn" title="시점 초기화">↻</button>
          <button id="video-fullscreen-btn" class="video-btn" title="전체화면">↗</button>
          <button id="video-close-btn" class="video-btn video-close-btn" title="닫기">✕</button>
        </div>
      </div>
    </div>
  `;

  setupControls();
}

function setupControls(): void {
  document.getElementById('video-play-btn')?.addEventListener('click', togglePlay);
  document.getElementById('video-prev-btn')?.addEventListener('click', prevClip);
  document.getElementById('video-next-btn')?.addEventListener('click', nextClip);
  document.getElementById('video-reset-view-btn')?.addEventListener('click', resetView);
  document.getElementById('video-fullscreen-btn')?.addEventListener('click', toggleFullscreen);
  document.getElementById('video-close-btn')?.addEventListener('click', close);

  // Seekbar interaction
  const seekbar = document.getElementById('video-seekbar-bg');
  if (seekbar) {
    seekbar.addEventListener('mousedown', (e) => {
      isSeeking = true;
      seekTo(e, seekbar);
    });
    document.addEventListener('mousemove', (e) => {
      if (isSeeking) seekTo(e, seekbar);
    });
    document.addEventListener('mouseup', () => { isSeeking = false; });
  }

  // Canvas mouse interaction for 360° rotation
  const canvasContainer = document.getElementById('video-canvas-container');
  if (canvasContainer) {
    canvasContainer.addEventListener('mousedown', onMouseDown);
    canvasContainer.addEventListener('mousemove', onMouseMove);
    canvasContainer.addEventListener('mouseup', onMouseUp);
    canvasContainer.addEventListener('wheel', onWheel);
    // Touch events
    canvasContainer.addEventListener('touchstart', onTouchStart);
    canvasContainer.addEventListener('touchmove', onTouchMove);
    canvasContainer.addEventListener('touchend', onTouchEnd);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);
}

function initThreeJS(): void {
  const canvasContainer = document.getElementById('video-canvas-container');
  if (!canvasContainer) return;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
  camera.position.set(0, 0, 0.01);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  canvasContainer.appendChild(renderer.domElement);

  // Create 360° sphere (inverted for inside viewing)
  const geometry = new THREE.SphereGeometry(500, 60, 40);
  geometry.scale(-1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  sphere = new THREE.Mesh(geometry, material);
  scene.add(sphere);

  // Handle resize
  window.addEventListener('resize', () => {
    if (!camera || !renderer || !canvasContainer) return;
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  });
}

async function open(routeData: RouteResponse, closeCallback?: () => void): Promise<void> {
  onCloseCallback = closeCallback ?? null;

  const playerWrapper = document.getElementById('video-player-wrapper');
  if (playerWrapper) playerWrapper.style.display = 'flex';

  showLoading(true);

  if (!renderer) initThreeJS();

  // Create clips from route edges
  clips = [];
  totalDuration = 0;

  for (const edge of routeData.edges) {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.preload = 'auto';
    video.src = edge.video;

    const duration = await loadVideoMetadata(video).catch(() => edge.duration);

    clips.push({
      video,
      duration,
      offset: totalDuration,
      name: `${edge.from} → ${edge.to}`,
    });
    totalDuration += duration;
  }

  if (clips.length === 0) {
    showLoading(false);
    showError('영상을 불러올 수 없습니다. 지도에서 경로를 확인하세요.');
    return;
  }

  renderSeekbarMarkers();
  switchToClip(0);
  showLoading(false);
  startRenderLoop();
}

function loadVideoMetadata(video: HTMLVideoElement): Promise<number> {
  return new Promise((resolve, reject) => {
    video.addEventListener('loadedmetadata', () => resolve(video.duration), { once: true });
    video.addEventListener('error', () => reject(new Error('Video load failed')), { once: true });
    video.load();
  });
}

function switchToClip(index: number): void {
  if (index < 0 || index >= clips.length) return;

  const wasPlaying = isPlaying;
  if (isPlaying) pause();

  // Dispose previous texture
  if (currentTexture) {
    currentTexture.dispose();
    currentTexture = null;
  }

  currentClipIndex = index;
  const clip = clips[index];

  currentTexture = new THREE.VideoTexture(clip.video);
  currentTexture.minFilter = THREE.LinearFilter;
  currentTexture.magFilter = THREE.LinearFilter;
  currentTexture.format = THREE.RGBAFormat;

  if (sphere) {
    (sphere.material as THREE.MeshBasicMaterial).map = currentTexture;
    (sphere.material as THREE.MeshBasicMaterial).needsUpdate = true;
  }

  // Auto-advance to next clip
  clip.video.onended = () => {
    if (currentClipIndex < clips.length - 1) {
      switchToClip(currentClipIndex + 1);
      if (wasPlaying) play();
    } else {
      pause();
      updateClipLabel();
    }
  };

  // Buffering detection
  clip.video.onwaiting = () => showLoading(true);
  clip.video.onplaying = () => showLoading(false);
  clip.video.oncanplay = () => showLoading(false);

  updateClipLabel();
  if (wasPlaying) play();
}

function play(): void {
  const clip = clips[currentClipIndex];
  if (!clip) return;
  clip.video.play().catch(() => {});
  isPlaying = true;
  const btn = document.getElementById('video-play-btn');
  if (btn) btn.textContent = '⏸';
}

function pause(): void {
  const clip = clips[currentClipIndex];
  if (!clip) return;
  clip.video.pause();
  isPlaying = false;
  const btn = document.getElementById('video-play-btn');
  if (btn) btn.textContent = '▶';
}

function togglePlay(): void {
  isPlaying ? pause() : play();
}

function prevClip(): void {
  switchToClip(currentClipIndex - 1);
}

function nextClip(): void {
  switchToClip(currentClipIndex + 1);
}

function seekTo(e: MouseEvent, seekbar: HTMLElement): void {
  const rect = seekbar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const globalTime = ratio * totalDuration;

  // Find which clip this time falls into (binary search)
  let clipIdx = 0;
  for (let i = clips.length - 1; i >= 0; i--) {
    if (globalTime >= clips[i].offset) {
      clipIdx = i;
      break;
    }
  }

  if (clipIdx !== currentClipIndex) {
    switchToClip(clipIdx);
  }

  const localTime = globalTime - clips[clipIdx].offset;
  clips[clipIdx].video.currentTime = localTime;
}

function resetView(): void {
  lon = 0;
  lat = 0;
}

function toggleFullscreen(): void {
  const wrapper = document.getElementById('video-player-wrapper');
  if (!wrapper) return;

  isFullscreen = !isFullscreen;
  wrapper.classList.toggle('video-fullscreen', isFullscreen);

  const btn = document.getElementById('video-fullscreen-btn');
  if (btn) btn.textContent = isFullscreen ? '↙' : '↗';

  // Resize renderer
  setTimeout(() => {
    const canvasContainer = document.getElementById('video-canvas-container');
    if (canvasContainer && camera && renderer) {
      camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
    }
  }, 100);
}

function close(): void {
  pause();
  stopRenderLoop();

  // Dispose all clips
  clips.forEach(clip => {
    clip.video.pause();
    clip.video.src = '';
    clip.video.load();
  });

  if (currentTexture) {
    currentTexture.dispose();
    currentTexture = null;
  }

  clips = [];

  const wrapper = document.getElementById('video-player-wrapper');
  if (wrapper) wrapper.style.display = 'none';

  isFullscreen = false;
  if (onCloseCallback) onCloseCallback();
}

// --- Render Loop ---

function startRenderLoop(): void {
  if (animFrameId) return;

  function loop() {
    updateCamera();
    updateSeekbar();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    animFrameId = requestAnimationFrame(loop);
  }
  animFrameId = requestAnimationFrame(loop);
}

function stopRenderLoop(): void {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function updateCamera(): void {
  if (!camera) return;
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  camera.lookAt(
    500 * Math.sin(phi) * Math.cos(theta),
    500 * Math.cos(phi),
    500 * Math.sin(phi) * Math.sin(theta)
  );
}

function updateSeekbar(): void {
  if (clips.length === 0) return;

  const clip = clips[currentClipIndex];
  const globalTime = clip.offset + (clip.video.currentTime || 0);
  const ratio = totalDuration > 0 ? globalTime / totalDuration : 0;

  const fill = document.getElementById('video-seekbar-fill');
  if (fill) fill.style.width = `${ratio * 100}%`;

  const timeLabel = document.getElementById('video-time');
  if (timeLabel) {
    timeLabel.textContent = `${formatTime(globalTime)} / ${formatTime(totalDuration)}`;
  }
}

function updateClipLabel(): void {
  const label = document.getElementById('video-clip-label');
  if (label) {
    label.textContent = `${currentClipIndex + 1}/${clips.length} · ${clips[currentClipIndex]?.name ?? ''}`;
  }
}

function renderSeekbarMarkers(): void {
  const markers = document.getElementById('video-seekbar-markers');
  if (!markers || totalDuration === 0) return;

  markers.innerHTML = '';
  clips.forEach((clip, i) => {
    if (i === 0) return;
    const pos = (clip.offset / totalDuration) * 100;
    const marker = document.createElement('div');
    marker.className = 'video-seekbar-marker';
    marker.style.left = `${pos}%`;
    markers.appendChild(marker);
  });
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function showLoading(show: boolean): void {
  const el = document.getElementById('video-loading');
  if (el) el.style.display = show ? 'flex' : 'none';
}

function showError(message: string): void {
  const canvasContainer = document.getElementById('video-canvas-container');
  if (canvasContainer) {
    canvasContainer.innerHTML = `<div class="video-error">${message}</div>`;
  }
}

// --- Mouse / Touch Handlers ---

function onMouseDown(e: MouseEvent): void {
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
  startLon = lon;
  startLat = lat;
}

function onMouseMove(e: MouseEvent): void {
  if (!isDragging) return;
  lon = startLon + (startX - e.clientX) * 0.2;
  lat = Math.max(-85, Math.min(85, startLat + (e.clientY - startY) * 0.2));
}

function onMouseUp(): void {
  isDragging = false;
}

function onTouchStart(e: TouchEvent): void {
  if (e.touches.length === 1) {
    isDragging = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startLon = lon;
    startLat = lat;
  }
}

function onTouchMove(e: TouchEvent): void {
  if (!isDragging || e.touches.length !== 1) return;
  e.preventDefault();
  lon = startLon + (startX - e.touches[0].clientX) * 0.2;
  lat = Math.max(-85, Math.min(85, startLat + (e.touches[0].clientY - startY) * 0.2));
}

function onTouchEnd(): void {
  isDragging = false;
}

function onWheel(e: WheelEvent): void {
  if (!camera) return;
  camera.fov = Math.max(30, Math.min(110, camera.fov + e.deltaY * 0.05));
  camera.updateProjectionMatrix();
}

function onKeyDown(e: KeyboardEvent): void {
  if (!container || container.style.display === 'none') return;

  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.code === 'ArrowLeft') {
    const clip = clips[currentClipIndex];
    if (clip) clip.video.currentTime = Math.max(0, clip.video.currentTime - 5);
  } else if (e.code === 'ArrowRight') {
    const clip = clips[currentClipIndex];
    if (clip) clip.video.currentTime = Math.min(clip.duration, clip.video.currentTime + 5);
  }
}

export default {
  createPlayerDOM,
  open,
  close,
  toggleFullscreen,
};
