# Backend API Specification

프론트엔드가 백엔드에 보내는 요청과 기대하는 응답 형식.

> 백엔드 기본 주소: `http://localhost:8080`

---

## 1. GET /api/graph

앱 시작 시 전체 그래프(노드 + 엣지)를 한 번 로딩한다.

### 요청

```
GET /api/graph
```

### 응답

```json
{
  "nodes": [
    {
      "id": "node-abc123",
      "building": "eng1",
      "level": 2,
      "type": "corridor",
      "label": "",
      "longitude": 126.97608,
      "latitude": 37.29361
    },
    {
      "id": "node-room-21223",
      "building": "eng1",
      "level": 2,
      "type": "room",
      "label": "21223",
      "longitude": 126.97654,
      "latitude": 37.29426
    },
    {
      "id": "node-stairs-3f",
      "building": "eng1",
      "level": 3,
      "type": "stairs",
      "label": "",
      "longitude": 126.97725,
      "latitude": 37.29414
    }
  ],
  "edges": [
    {
      "id": "edge-abc123-def456",
      "from": "node-abc123",
      "to": "node-def456",
      "weight": 25.5,
      "videoFwd": "eng1_c_F2_6_cw.mp4",
      "videoFwdStart": 0,
      "videoFwdEnd": 49215,
      "videoFwdExit": null,
      "videoFwdExitStart": null,
      "videoFwdExitEnd": null,
      "videoRev": "eng1_c_F2_6_ccw.mp4",
      "videoRevStart": 0,
      "videoRevEnd": 49215,
      "videoRevExit": null,
      "videoRevExitStart": null,
      "videoRevExitEnd": null
    }
  ]
}
```

### 필드 설명

**NodeDto:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | 노드 고유 ID |
| `building` | string | 건물 코드 (예: `"eng1"`) |
| `level` | number | 층 번호 |
| `type` | string | `"corridor"` / `"room"` / `"stairs"` / `"elevator"` / `"entrance"` |
| `label` | string | 방 번호 (room만 해당, 나머지는 `""`) |
| `longitude` | number | WGS84 경도 |
| `latitude` | number | WGS84 위도 |

**EdgeDto:**

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string | 엣지 고유 ID |
| `from` | string | 출발 노드 ID |
| `to` | string | 도착 노드 ID |
| `weight` | number | 거리 (미터) |
| `videoFwd` | string\|null | 정방향 영상 파일명 |
| `videoFwdStart` | number\|null | 정방향 영상 시작 (**밀리초**) |
| `videoFwdEnd` | number\|null | 정방향 영상 끝 (**밀리초**) |
| `videoFwdExit` | string\|null | 정방향 계단/엘리베이터 출구 영상 |
| `videoFwdExitStart` | number\|null | 출구 영상 시작 (ms) |
| `videoFwdExitEnd` | number\|null | 출구 영상 끝 (ms) |
| `videoRev` | string\|null | 역방향 영상 파일명 |
| `videoRevStart` | number\|null | 역방향 영상 시작 (ms) |
| `videoRevEnd` | number\|null | 역방향 영상 끝 (ms) |
| `videoRevExit` | string\|null | 역방향 출구 영상 |
| `videoRevExitStart` | number\|null | 역방향 출구 시작 (ms) |
| `videoRevExitEnd` | number\|null | 역방향 출구 끝 (ms) |

> 프론트엔드는 모든 타임스탬프를 ÷1000 하여 초(seconds) 단위로 변환한다.

---

## 2. GET /api/route

두 방 번호 사이의 최단경로를 탐색한다.

### 요청

```
GET /api/route?from=21223&to=21517
```

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `from` | string | 출발 방 번호 |
| `to` | string | 도착 방 번호 |

### 응답 (경로 있음)

```json
{
  "found": true,
  "path": [
    "node-abc123",
    "node-def456",
    "node-stairs-2f",
    "node-stairs-5f",
    "node-ghi789"
  ],
  "edges": [
    {
      "from": "node-abc123",
      "to": "node-def456",
      "video": "eng1_c_F2_6_cw.mp4",
      "videoStart": 5000,
      "videoEnd": 27000,
      "duration": 22.0
    },
    {
      "from": "node-def456",
      "to": "node-stairs-2f",
      "video": "eng1_c_F2_7_cw.mp4",
      "videoStart": 0,
      "videoEnd": 15000,
      "duration": 15.0
    }
  ],
  "totalDistance": 145.2,
  "estimatedTime": "약 2분"
}
```

### 응답 (경로 없음)

```json
{
  "found": false,
  "path": [],
  "edges": [],
  "totalDistance": 0,
  "estimatedTime": "-"
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `found` | boolean | 경로 존재 여부 |
| `path` | string[] | 경유 노드 ID 배열 (순서대로) |
| `edges` | array | 경유 엣지 목록 |
| `edges[].from` | string | 엣지 출발 노드 ID |
| `edges[].to` | string | 엣지 도착 노드 ID |
| `edges[].video` | string\|null | 영상 파일명 |
| `edges[].videoStart` | number | 영상 시작 (ms) |
| `edges[].videoEnd` | number | 영상 끝 (ms) |
| `edges[].duration` | number | 영상 구간 길이 (초) |
| `totalDistance` | number | 총 경로 거리 (미터) |
| `estimatedTime` | string | 예상 도보 시간 (예: `"약 2분"`) |

---

## 3. GET /api/nodes/search

방 번호/라벨로 노드를 검색한다 (자동완성용).

### 요청

```
GET /api/nodes/search?q=212
```

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `q` | string | 검색어 (부분 매칭) |

### 응답

```json
[
  {
    "id": "node-room-21223",
    "building": "eng1",
    "level": 2,
    "type": "room",
    "label": "21223",
    "longitude": 126.97654,
    "latitude": 37.29426
  },
  {
    "id": "node-room-21224",
    "building": "eng1",
    "level": 2,
    "type": "room",
    "label": "21224",
    "longitude": 126.97656,
    "latitude": 37.29428
  }
]
```

> `NodeDto` 형식은 `/api/graph`과 동일.

---

## 4. GET /api/geojson/... (예정)

건물/층별 GeoJSON 파일을 제공한다. 현재는 프론트엔드가 로컬 `/geojson/` 에서 직접 로딩.

### 요청 예시

```
GET /api/geojson/buildings.json
GET /api/geojson/eng1/manifest.json
GET /api/geojson/eng1/eng1_room_L2.geojson
GET /api/geojson/eng1/eng1_wall_L2.geojson
GET /api/geojson/eng1/eng1_collider_L2.geojson
GET /api/geojson/eng1/eng1_outline.geojson
```

### 응답

현재 `public/geojson/` 폴더의 파일을 그대로 서빙하면 된다.

> 준비되면 `backendService.ts`의 `setGeojsonBase('http://localhost:8080/api/geojson')` 호출로 전환.
