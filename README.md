# SKKU 2.5D Indoor Navigation — Frontend

캡스톤 디자인 프로젝트 — 성균관대 자연과학캠퍼스 제1공학관 2.5D 실내 내비게이션 + 360° Walkthrough

## 기술 스택

| 역할 | 기술 |
|------|------|
| 언어 | TypeScript 5.8 |
| 번들러 | Webpack 5 |
| 지도 렌더링 | MapLibre GL v4 |
| 3D 시각화 | deck.gl v9 + Three.js r183 |
| 스타일 | SCSS |
| 백엔드 | Java Spring Boot (별도 레포) |
| Dev Server | localhost:8082 |

---

## 프로젝트 구조

```
SKKU-2.5D-Navigation_frontend/
├── 2.5d_indoor_navigation_frontend_v2/   # 메인 프론트엔드 앱
│   ├── src/
│   │   ├── components/                   # 지도, 3D 레이어, Walkthrough 플레이어
│   │   ├── config/                       # 지도 설정
│   │   ├── editor/                       # 그래프 에디터, 비디오 관리
│   │   ├── models/                       # 타입 정의
│   │   ├── services/                     # API, 경로 탐색, Walkthrough
│   │   ├── utils/                        # 좌표 변환, 건물 탐지
│   │   └── main.ts                       # 엔트리포인트
│   ├── public/geojson/                   # 정적 데이터 (GeoJSON, graph.json)
│   ├── scss/                             # 스타일시트
│   ├── videos/                           # 360° 영상 (git 미포함)
│   ├── webpack.config.js
│   └── package.json
├── Geojson/                              # QGIS 원본 데이터
├── geojson_convert/                      # QGIS → 앱용 GeoJSON 변환 파이프라인
├── docs/                                 # 설계 문서
└── CLAUDE.md
```

---

## 빠른 시작

```bash
cd 2.5d_indoor_navigation_frontend_v2
npm install
npm run dev    # webpack dev server (localhost:8082, 자동 오픈)
```

프로덕션 빌드:

```bash
npm run build  # dist/ 폴더에 번들 생성
```

### 360° 영상 세팅

1. [공유 드라이브](https://drive.google.com/file/d/10toUrH2QPkQCoq1o22d0djIxiuP59Muh/view?usp=sharing)에서 `eng1_mp4/` 폴더를 받는다 (114개 mp4)
2. `2.5d_indoor_navigation_frontend_v2/videos/` 에 넣는다

영상 네이밍 규칙은 `docs/VIDEO_NAMING.md`, 상세 가이드는 `docs/360-video-guide.md` 참조.

---

## 백엔드 연동

프론트엔드는 **정적 파일 서빙 + UI 렌더링**만 담당하며, 데이터와 길찾기는 백엔드에서 처리한다.

```
프론트엔드 (localhost:8082)          백엔드 (localhost:8080)
─────────────────────               ─────────────────────
UI 렌더링                            GeoJSON / 그래프 데이터 제공
360° 비디오 재생           ←  API →  Dijkstra 경로 탐색
지도 시각화                           노드/엣지 DB 관리
```

### 핵심 API

| Method | URL | 설명 |
|--------|-----|------|
| `GET` | `/api/route?from={방번호}&to={방번호}` | 최단경로 탐색 |
| `GET` | `/api/graph` | 전체 노드 + 엣지 그래프 |
| `GET` | `/api/nodes/search?q=` | 방 번호 검색 |

### 서비스 구조

```
src/services/
├── apiClient.ts          # 매니저 — local/api 전환
├── local/
│   └── localRoute.ts     # 로컬 graph.json + Dijkstra
├── api/
│   └── apiRoute.ts       # 백엔드 API 호출 + FullRouteResult 조립
├── graphService.ts       # 그래프 로딩/탐색 (공용)
├── backendService.ts     # GeoJSON 로딩 (공용)
└── walkthroughPlanner.ts # 비디오 재생 플래닝 (공용)
```

### 연동 전환

`apiClient.ts`의 `useApi` 플래그로 전환:
- `false` (기본) — 로컬 `graph.json` + 자체 Dijkstra (오프라인 개발용)
- `true` — 백엔드 API 사용 (프로덕션)

### 백엔드 필수 API

| Method | URL | 응답 | 용도 |
|--------|-----|------|------|
| `GET` | `/api/graph` | `{ nodes: NodeDto[], edges: EdgeDto[] }` | 앱 시작 시 그래프 로딩 |
| `GET` | `/api/route?from={방번호}&to={방번호}` | `{ found, path, edges, totalDistance, estimatedTime }` | 최단경로 탐색 |
| `GET` | `/api/nodes/search?q={검색어}` | `NodeDto[]` | 방 번호 자동완성 검색 |
| `GET` | `/api/geojson/...` | GeoJSON files | 건물/층별 GeoJSON 데이터 (예정) |

**주의사항:**
- `EdgeDto` 비디오 타임스탬프: **밀리초(ms)** 단위 → 프론트에서 ÷1000 변환
- `NodeDto`에 `verticalId` 없음 → 계단/엘리베이터 자동 영상 매핑 미지원
- `NodeDto.type`이 `"room"` → `room_type` 서브타입(classroom/lab 등) 없음

> CORS: 백엔드가 `localhost:8082`, `localhost:3000` 허용. 전체 API 문서는 [백엔드 README](../SKKU-2.5D-Navigation/README.md) 참조.

---

## 아키텍처

| 레이어 | 기술 | 설명 |
|--------|------|------|
| 지도 렌더링 | MapLibre GL v4 | 2.5D 뷰, 층별 전환 |
| 3D 렌더링 | deck.gl v9 | 방 바닥(room_type별 그룹), 벽(BufferGeometry merge), 계단 |
| 경로 오버레이 | deck.gl PathLayer | 최단경로를 경로 라인으로 표시 (층별 색상 그라데이션) |
| 360° 비디오 | Three.js SphereGeometry + VideoTexture | Apple Look Around 패턴 (상하 분할) |
| 백엔드 | Java Spring Boot (별도 레포) | Dijkstra 길찾기 + 데이터 API |

---

## 문서

| 문서 | 설명 |
|------|------|
| [docs/DESIGN.md](docs/DESIGN.md) | 색상 팔레트, 레이아웃, 인터랙션 명세 |
| [docs/FILE_GUIDE.md](docs/FILE_GUIDE.md) | 핵심 파일 역할 가이드 |
| [docs/GRAPH_EDITOR.md](docs/GRAPH_EDITOR.md) | 그래프 에디터 사용법 (단축키, 영상 할당) |
| [docs/MULTI_BUILDING.md](docs/MULTI_BUILDING.md) | 다중 건물 추가 방법 |
| [docs/BUILDING_CODES.md](docs/BUILDING_CODES.md) | 건물 약어 코드 |
| [docs/360-video-guide.md](docs/360-video-guide.md) | 360° 영상 네이밍, 매핑, Walkthrough 아키텍처 |
| [docs/h264-high-speed-playback.md](docs/h264-high-speed-playback.md) | H.264 고배속 재생 기법 |

---

## 향후 작업

- [ ] 4층 복도 GeoJSON 수정 (QGIS 재작업)
- [ ] 3~5층 방 속성 입력 (`room_type`, `ref`, `name`)
- [ ] 3~5층 그래프 데이터 완성 (노드/간선)
- [ ] 전체 엣지-비디오 매핑 완성
- [ ] 114개 영상 yaw 값 재설정

자세한 내용은 [docs/TODOS.md](docs/TODOS.md) 참조.
