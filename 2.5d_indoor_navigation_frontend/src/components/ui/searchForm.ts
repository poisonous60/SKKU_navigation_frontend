import { geoMap } from "../../main";
import BackendService from "../../services/backendService";
import ApiClient, { RouteResponse } from "../../services/apiClient";
import RouteService from "../../services/routeService";

interface RoomSuggestion {
  ref: string;
  name: string;
  level: number[];
  roomType: string;
  displayText: string;
}

let allRooms: RoomSuggestion[] = [];
let startRoom: string | null = null;
let endRoom: string | null = null;
let currentRoute: RouteResponse | null = null;

function buildRoomList(): void {
  const geoJSON = BackendService.getGeoJson();
  if (!geoJSON) return;

  const seen = new Set<string>();
  allRooms = [];

  geoJSON.features.forEach((feature: GeoJSON.Feature) => {
    const props = feature.properties;
    if (props.indoor !== 'room' || !props.ref) return;
    if (seen.has(props.ref)) return;
    seen.add(props.ref);

    const levels = Array.isArray(props.level) ? props.level : [props.level];
    const levelStr = levels.map((l: number) => `${l}F`).join(',');
    const roomType = props.room_type ?? '';
    const typeLabel = getRoomTypeLabel(roomType);
    const displayText = typeLabel
      ? `${props.ref} (${levelStr}, ${typeLabel})`
      : `${props.ref} (${levelStr})`;

    allRooms.push({
      ref: props.ref,
      name: props.name ?? '',
      level: levels,
      roomType,
      displayText,
    });
  });

  allRooms.sort((a, b) => a.ref.localeCompare(b.ref));
}

function getRoomTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    classroom: '교실',
    lab: '실습실',
    restroom: '화장실',
    office: '사무실',
    stairs: '계단',
  };
  return labels[type] ?? '';
}

function filterRooms(query: string): RoomSuggestion[] {
  if (!query) return [];
  const q = query.toLowerCase();
  return allRooms.filter(
    r => r.ref.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
  ).slice(0, 8);
}

function render(): void {
  const wrapper = document.getElementById('indoorSearchWrapper');
  if (!wrapper) return;

  wrapper.innerHTML = `
    <div class="search-container">
      <div class="search-inputs">
        <div class="search-field">
          <input type="text" id="searchRoomInput" class="form-control"
                 placeholder="방 번호 입력 (ex: 21517)" autocomplete="off">
          <div id="searchDropdown" class="autocomplete-dropdown"></div>
        </div>
        <div class="search-field">
          <input type="text" id="startInput" class="form-control"
                 placeholder="출발" autocomplete="off">
          <div id="startDropdown" class="autocomplete-dropdown"></div>
        </div>
        <div class="search-field">
          <input type="text" id="endInput" class="form-control"
                 placeholder="도착" autocomplete="off">
          <div id="endDropdown" class="autocomplete-dropdown"></div>
        </div>
        <button class="btn btn-primary" id="findRouteBtn">경로 찾기</button>
      </div>
    </div>
  `;

  const searchInput = document.getElementById('searchRoomInput') as HTMLInputElement;
  const startInput = document.getElementById('startInput') as HTMLInputElement;
  const endInput = document.getElementById('endInput') as HTMLInputElement;
  const findRouteBtn = document.getElementById('findRouteBtn') as HTMLButtonElement;

  // Single room search
  setupAutocomplete(searchInput, 'searchDropdown', (room) => {
    searchInput.value = room.ref;
    geoMap.handleIndoorSearch(room.ref);
    hideAllDropdowns();
  });

  // Start input
  setupAutocomplete(startInput, 'startDropdown', (room) => {
    startInput.value = room.displayText;
    startRoom = room.ref;
    hideAllDropdowns();
  });

  // End input
  setupAutocomplete(endInput, 'endDropdown', (room) => {
    endInput.value = room.displayText;
    endRoom = room.ref;
    hideAllDropdowns();
  });

  // Find route
  findRouteBtn.addEventListener('click', () => findRoute());

  // Enter key on end input triggers route find
  endInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') findRoute();
  });

  // Enter key on search input triggers room search
  searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
      geoMap.handleIndoorSearch(searchInput.value);
      hideAllDropdowns();
    }
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('.search-field')) {
      hideAllDropdowns();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideAllDropdowns();
  });
}

function setupAutocomplete(
  input: HTMLInputElement,
  dropdownId: string,
  onSelect: (room: RoomSuggestion) => void
): void {
  const dropdown = document.getElementById(dropdownId)!;
  let selectedIndex = -1;

  input.addEventListener('input', () => {
    if (allRooms.length === 0) buildRoomList();
    const results = filterRooms(input.value);
    selectedIndex = -1;
    renderDropdown(dropdown, results, onSelect);
  });

  input.addEventListener('focus', () => {
    if (input.value && allRooms.length === 0) buildRoomList();
    if (input.value) {
      renderDropdown(dropdown, filterRooms(input.value), onSelect);
    }
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateSelection(items, selectedIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, 0);
      updateSelection(items, selectedIndex);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      (items[selectedIndex] as HTMLElement).click();
    }
  });
}

function renderDropdown(
  dropdown: HTMLElement,
  results: RoomSuggestion[],
  onSelect: (room: RoomSuggestion) => void
): void {
  if (results.length === 0) {
    dropdown.innerHTML = '<div class="autocomplete-empty">해당 방을 찾을 수 없습니다.</div>';
    dropdown.style.display = 'block';
    return;
  }

  dropdown.innerHTML = results.map((room, i) =>
    `<div class="autocomplete-item" data-index="${i}">${room.displayText}</div>`
  ).join('');
  dropdown.style.display = 'block';

  dropdown.querySelectorAll('.autocomplete-item').forEach((item, i) => {
    item.addEventListener('click', () => {
      onSelect(results[i]);
      dropdown.style.display = 'none';
    });
    item.addEventListener('mouseenter', () => {
      dropdown.querySelectorAll('.autocomplete-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
    });
  });
}

function updateSelection(items: NodeListOf<Element>, index: number): void {
  items.forEach(el => el.classList.remove('selected'));
  if (index >= 0 && index < items.length) {
    items[index].classList.add('selected');
  }
}

function hideAllDropdowns(): void {
  document.querySelectorAll('.autocomplete-dropdown').forEach(d => {
    (d as HTMLElement).style.display = 'none';
  });
}

async function findRoute(): Promise<void> {
  if (!startRoom || !endRoom) {
    showRouteError('출발지와 도착지를 모두 선택하세요.');
    return;
  }

  const routeInfo = document.getElementById('routeInfo');
  const findRouteBtn = document.getElementById('findRouteBtn') as HTMLButtonElement;

  try {
    findRouteBtn.disabled = true;
    findRouteBtn.textContent = '검색중...';

    currentRoute = await ApiClient.fetchRoute(startRoom, endRoom);

    if (routeInfo) {
      routeInfo.style.display = 'flex';
      const endRoomData = allRooms.find(r => r.ref === endRoom);
      const levelStr = endRoomData ? endRoomData.level[0] + 'F' : '';
      routeInfo.innerHTML = `
        <span class="route-info-room">${endRoom}</span>
        <span class="route-info-level">${levelStr}</span>
        <span class="route-info-time">${currentRoute.estimatedTime}</span>
        <button id="walkthrough-btn" class="btn btn-sm btn-outline-primary">▶ 영상보기</button>
      `;
      document.getElementById('walkthrough-btn')?.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('openWalkthrough', { detail: currentRoute }));
      });
    }

    // Draw route on map with mock coordinates
    const nodeCoords = new Map<string, { coordinates: [number, number]; level: number }>();
    currentRoute.path.forEach((nodeId, i) => {
      const t = i / (currentRoute!.path.length - 1);
      nodeCoords.set(nodeId, {
        coordinates: [126.97600 + t * 0.0006, 37.29390 + t * 0.0004],
        level: 1,
      });
    });
    RouteService.drawRoute(currentRoute, nodeCoords);

  } catch (err) {
    showRouteError((err as Error).message);
  } finally {
    findRouteBtn.disabled = false;
    findRouteBtn.textContent = '경로 찾기';
  }
}

function showRouteError(message: string): void {
  const routeInfo = document.getElementById('routeInfo');
  if (routeInfo) {
    routeInfo.style.display = 'flex';
    routeInfo.innerHTML = `
      <span class="route-error">${message}</span>
      <button id="retryRouteBtn" class="btn btn-sm btn-outline-danger">재시도</button>
    `;
    document.getElementById('retryRouteBtn')?.addEventListener('click', () => findRoute());
  }
}

export function setStartRoom(ref: string): void {
  startRoom = ref;
  const input = document.getElementById('startInput') as HTMLInputElement;
  if (input) {
    const room = allRooms.find(r => r.ref === ref);
    input.value = room ? room.displayText : ref;
  }
}

export function setEndRoom(ref: string): void {
  endRoom = ref;
  const input = document.getElementById('endInput') as HTMLInputElement;
  if (input) {
    const room = allRooms.find(r => r.ref === ref);
    input.value = room ? room.displayText : ref;
  }
}

export function getCurrentRoute(): RouteResponse | null {
  return currentRoute;
}

export default {
  render,
  buildRoomList,
  setStartRoom,
  setEndRoom,
  getCurrentRoute,
};
