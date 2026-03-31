# 핵심 파일 가이드

## 프론트엔드 (`2.5d_indoor_navigation_frontend_v2/src/`)

| 파일 | 역할 |
|------|------|
| `main.ts` | 앱 엔트리포인트, 초기화 흐름 |
| `components/geoMap.ts` | MapLibre GL 지도 컨트롤러 |
| `components/indoorLayer.ts` | 방/벽/계단 3D 렌더링 (핵심, 12KB) |
| `components/floatingLabels.ts` | 룸 라벨 포지셔닝 |
| `components/routeOverlay.ts` | 경로 렌더링 (층별 세그먼트 분할, 3D 높이 적용) |
| `editor/graphEditor.ts` | 그래프 에디터 메인 컨트롤러 (키보드, 자동저장) |
| `editor/graphEditorMap.ts` | 에디터 지도 렌더링 (2D 레이어 + 3D SVG/HTML 오버레이) |
| `editor/graphEditorPanel.ts` | 에디터 UI 패널 (노드·방 속성, 모드 전환) |
| `editor/graphEditorState.ts` | 에디터 상태 관리 (undo/redo, graph.json 파일 저장) |
| `editor/graphEditorTypes.ts` | 에디터 타입 정의 (NavNode, NavEdge, Command 등) |
| `editor/videoCatalog.ts` | 복도 비디오 카탈로그 (30개, 스마트 추천). 계단/엘리베이터는 자동 계산 |
| `editor/videoSettings.ts` | 비디오별 초기 yaw 각도 관리 (`video_settings.json`) |
| `editor/videoSettingsPanel.ts` | Video Settings 패널 (건물>타입>층 접는 트리 UI) |
| `utils/verticalVideoFilename.ts` | 계단/엘리베이터 영상 파일명 자동 계산 (verticalId + 층 정보 기반) |
| `utils/buildingDetection.ts` | 좌표 기반 건물 코드 탐지 (polygon containment + 지리 heuristic) |
| `editor/videoPreview.ts` | 360° 프리뷰 오버레이 (Three.js, yaw/time-range/split 모드) |
| `components/walkthroughOverlay.ts` | Walkthrough UI 오케스트레이터 (오버레이, 프로그레스 바, 배속, 카메라 추적) |
| `components/walkthroughPlayer.ts` | 360° 세그먼트 재생 엔진 (더블 버퍼링, seek 기반 고배속) |
| `components/walkthroughTypes.ts` | Walkthrough 타입 정의 (Clip, Segment, Playlist) |
| `services/walkthroughPlanner.ts` | 경로 → 비디오 클립 플레이리스트 변환 (위치 보간, 부분 엣지 처리) |
| `services/backendService.ts` | 다중 건물 GeoJSON 로딩 (`buildings.json` → 건물별 manifest/room/collider/wall) |
| `services/graphService.ts` | 경로 탐색 엔진 (Dijkstra, 문 위치 근사, corridor edge 투영) |
| `services/apiClient.ts` | 경로 API 클라이언트 (로컬 Dijkstra ↔ 백엔드 전환) |
| `config/mapConfig.ts` | 지도 인터랙션 + 경로 표시 상수 (한 곳에서 조정) |
| `models/types.ts` | 핵심 TypeScript 인터페이스 |

## 데이터 파이프라인

| 파일 | 역할 |
|------|------|
| `Geojson/eng1_rooms_L*.geojson` | QGIS CAD 원본 방 폴리곤 (층별, MultiPolygon) |
| `Geojson/eng1_corridors_L*.geojson` | QGIS CAD 원본 복도 폴리곤 (층별) |
| `Geojson/eng1_outline.geojson` | 건물 외곽선 |
| `geojson_convert/convert.py` | QGIS 출력 → 앱 호환 GeoJSON 변환 (양쪽 네이밍 자동 감지) |
| `public/geojson/buildings.json` | 건물 코드 목록 (다중 건물 자동 탐색용) |
| `VIDEO_NAMING.md` | 360° 비디오 네이밍 컨벤션 v2 (복도/계단/엘리베이터 114개) |
| `cad/QGIS_GUIDE.md` | QGIS 작업 가이드 (새 층 추가 시 참조) |

## 디자인

| 파일 | 역할 |
|------|------|
| `docs/DESIGN.md` | 색상 팔레트, 레이아웃, 인터랙션 명세 |
| `docs/BUILDING_CODES.md` | 방 번호체계 및 건물 구조 코드 |
| `reference/` | UI 레퍼런스 이미지 |
