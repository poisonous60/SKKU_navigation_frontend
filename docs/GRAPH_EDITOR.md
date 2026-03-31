# 그래프 에디터 사용법

헤더의 **hub** 아이콘으로 활성화. 노드/간선을 편집하여 내비게이션 그래프를 구축한다.

## 단축키

| 단축키 | 동작 |
|--------|------|
| `Q` | 선택 모드 |
| `W` | 노드 추가 모드 (타입 사전 선택 가능) |
| `E` | 엣지 추가 모드 (연속 연결, 우클릭/Esc로 취소) |
| `R` | 방 라벨 편집 모드 (숫자키로 ref 직접 입력) |
| `Ctrl+Z/Y` | Undo / Redo |
| `Delete` | 선택된 노드 삭제 |
| `Backspace` | 방 라벨 ref 마지막 글자 삭제 |
| `Esc` | 선택 해제 / 엣지 연결 취소 |

## 주요 동작

- **자동 저장**: 노드/간선 → `public/geojson/graph.json`, 방 라벨 → `public/geojson/eng1/eng1_room_L{n}.geojson` (dev server PUT API)
- **3D 모드**: 모든 노드·간선을 층 높이에 맞춰 표시, 비활성 층은 반투명 처리
- **계단/엘리베이터 노드**: `verticalId` 필드로 물리적 계단/엘리베이터 번호를 지정 (예: 계단1=1, 엘리베이터2=2). 양쪽 노드가 모두 stairs 또는 elevator 타입이면 영상이 자동 계산됨
- **영상 할당 시 시간 자동 설정**: 트리에서 영상 선택 시 start=0, end=영상길이로 자동 설정. 반대 방향(cw↔ccw)도 자동 할당
- **경로 탐색 반영**: 그래프 에디터에서 노드/간선 수정 후 **페이지 새로고침**이 필요함. 에디터 저장은 즉시 되지만, 경로 탐색 엔진이 최신 데이터를 사용하려면 새로고침 후 graph.json을 다시 로드해야 함
- **room 노드 자동 ref**: room 타입 노드 배치 시 가장 가까운 방의 ref 자동 할당
- **다중 엣지 선택**: Shift+클릭으로 여러 엣지 선택, 체인 자동 감지 + 방향 표시
- **Assign & Split**: 한 영상을 N개 엣지에 분할점으로 나눠 할당

## 엣지 체인 정렬 (Edge Chain Ordering)

Multi-edge selection에서 E1, E2, E3 순서를 결정하는 로직.

1. 선택된 edge들의 **endpoint** (1개의 edge에만 연결된 노드) 2개를 찾는다.
2. 두 endpoint 노드 ID를 **알파벳순** 정렬 → 먼저 오는 노드를 start로 사용.
3. Start 노드에서 chain walk: start에 연결된 edge = **E1**, 그 다음 연결된 edge = **E2**, ...

### 적용 위치

| File | Function | 역할 |
|------|----------|------|
| `graphEditorPanel.ts` | `getOrderedChain()` | E1/E2/E3 순서 + UI 표시 |
| `graphEditor.ts` | `orderEdgeChain()` | Assign & Split 시 실제 시간 구간 할당 |

두 함수가 동일한 정렬(알파벳순)을 사용하므로 패널 표시와 실제 할당이 항상 일치한다.

### Example

3개 edge 선택 시 (어떤 순서로 클릭하든):

```
endpoints = [mn8ztph0, mn8ztn1z]  (알파벳순)
startNode = mn8ztph0

Chain walk:
  E1: mn8ztph0 → mn8ztota
  E2: mn8ztota → mn8ztns2
  E3: mn8ztns2 → mn8ztn1z
```
