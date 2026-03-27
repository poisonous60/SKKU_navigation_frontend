import { GeoMap } from "./components/geoMap";
import BackendService from "./services/backendService";
import { translate } from "./utils/translate";
import LoadingIndicator from "./components/ui/loadingIndicator";
import LevelControl from "./components/ui/levelControl";
import VideoPlayer from "./components/ui/videoPlayer";
import { RouteResponse } from "./services/apiClient";
import { editorController } from "./components/editor/editorController";

export let geoMap: GeoMap = null;

document.addEventListener("DOMContentLoaded", function () {
  LoadingIndicator.start();

  BackendService.fetchBackendData().then(() => {
    geoMap = new GeoMap();
    geoMap.showBuilding();
    LevelControl.setupControlShifter();
    translate();
    setupCenterButton();
    setupBuildingInfo();
    setupFloorWheel();
    setupVideoPlayer();
    setupRoomClickPopup();
    setupEditorToggle();
    LoadingIndicator.end();
  }).catch((err) => {
    LoadingIndicator.error(err?.message ?? "데이터를 불러올 수 없습니다.");
  });
});

function setupBuildingInfo(): void {
  const buildingEl = document.getElementById('selectedBuilding');
  const descEl = document.getElementById('description');
  if (buildingEl) buildingEl.textContent = BackendService.getBuildingDescription();
  if (descEl) descEl.textContent = `${geoMap.getCurrentLevel()}F`;
}

function setupCenterButton(): void {
  document.getElementById('centerBtn')?.addEventListener('click', () => {
    geoMap.centerMapToBuilding();
  });
}

// ===== 층 스크롤 휠 =====
function setupFloorWheel(): void {
  const container = document.getElementById('floorWheelInner');
  if (!container) return;

  const levels = BackendService.getAllLevels(); // [5, 4, 3, 2, 1]
  const currentLevel = geoMap.getCurrentLevel();

  levels.forEach(level => {
    const btn = document.createElement('button');
    btn.className = 'floor-wheel-item';
    btn.textContent = `${level}F`;
    btn.dataset.level = level.toString();

    btn.addEventListener('click', () => {
      geoMap.handleLevelChange(level);
      LevelControl.focusOnLevel(level);
      updateFloorWheelActive(level);
    });

    container.appendChild(btn);
  });

  updateFloorWheelActive(currentLevel);

  // 마우스 휠로 층 전환
  const wheel = document.getElementById('floorWheel');
  if (wheel) {
    wheel.addEventListener('wheel', (e) => {
      e.preventDefault();
      const currentIdx = levels.indexOf(geoMap.getCurrentLevel());
      const newIdx = e.deltaY > 0
        ? Math.min(currentIdx + 1, levels.length - 1)  // scroll down → lower floor
        : Math.max(currentIdx - 1, 0);                  // scroll up → higher floor
      if (newIdx !== currentIdx) {
        const newLevel = levels[newIdx];
        geoMap.handleLevelChange(newLevel);
        LevelControl.focusOnLevel(newLevel);
        updateFloorWheelActive(newLevel);
      }
    }, { passive: false });
  }
}

function updateFloorWheelActive(activeLevel: number): void {
  const levels = BackendService.getAllLevels();
  const activeIdx = levels.indexOf(activeLevel);

  document.querySelectorAll('.floor-wheel-item').forEach((btn, i) => {
    btn.classList.remove('active', 'adjacent', 'far');
    const dist = Math.abs(i - activeIdx);
    if (dist === 0) btn.classList.add('active');
    else if (dist === 1) btn.classList.add('adjacent');
    else btn.classList.add('far');
  });

  // header description 업데이트
  const descEl = document.getElementById('description');
  if (descEl) descEl.textContent = `${activeLevel}F`;
}

// ===== 비디오 플레이어 =====
function setupVideoPlayer(): void {
  VideoPlayer.createPlayerDOM('videoPlayerContainer');

  document.addEventListener('openWalkthrough', ((e: CustomEvent<RouteResponse>) => {
    const mainContent = document.getElementById('mainContent');
    const videoContainer = document.getElementById('videoPlayerContainer');
    if (mainContent && videoContainer) {
      mainContent.classList.add('walkthrough-active');
      videoContainer.style.display = 'block';
      VideoPlayer.open(e.detail, () => {
        mainContent.classList.remove('walkthrough-active', 'walkthrough-fullscreen');
        videoContainer.style.display = 'none';
        if (geoMap?.mapInstance) setTimeout(() => geoMap.mapInstance.checkSize(), 100);
      });
    }
  }) as EventListener);
}

// ===== 에디터 토글 =====
function setupEditorToggle(): void {
  const btn = document.getElementById('editorToggleBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    if (editorController.isActive()) {
      editorController.exitEditorMode();
      document.body.classList.remove('editor-active');
      btn.classList.remove('active');
    } else {
      editorController.enterEditorMode();
      document.body.classList.add('editor-active');
      btn.classList.add('active');
    }
  });
}

// ===== 방 클릭 팝업 =====
function setupRoomClickPopup(): void {
  const popup = document.getElementById('roomPopup');
  if (!popup) return;

  let selectedRef: string | null = null;

  document.addEventListener('roomClicked', ((e: CustomEvent) => {
    const { ref, screenX, screenY } = e.detail;
    if (!ref) return;
    selectedRef = ref;
    popup.style.display = 'block';
    popup.style.left = `${screenX}px`;
    popup.style.top = `${screenY}px`;
  }) as EventListener);

  document.getElementById('popupSetStart')?.addEventListener('click', () => {
    if (selectedRef) require("./components/ui/searchForm").default.setStartRoom(selectedRef);
    popup.style.display = 'none';
  });

  document.getElementById('popupSetEnd')?.addEventListener('click', () => {
    if (selectedRef) require("./components/ui/searchForm").default.setEndRoom(selectedRef);
    popup.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('#roomPopup') &&
        !(e.target as HTMLElement).closest('.maptalks-canvas')) {
      popup.style.display = 'none';
    }
  });
}
