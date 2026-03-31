# 다중 건물 지원

프론트엔드는 여러 건물을 동시에 렌더링할 수 있다. `public/geojson/buildings.json`에 건물 코드를 추가하면 자동으로 로딩된다.

## 건물 추가 방법

```bash
# 1. QGIS에서 방/복도/외곽선 GeoJSON 내보내기
# 2. Geojson/ 폴더에 파일 배치 (eng2_rooms_L1.geojson, eng2_corridors_L1.geojson, ...)
# 3. 변환 실행
python geojson_convert/convert.py eng2 1 2 3 4 5

# 4. buildings.json에 추가
# ["eng1", "eng2"]
```

## 변환 파이프라인 입력 네이밍

변환 파이프라인은 두 가지 입력 네이밍을 자동 감지한다:
- 기존: `{code}_room_L{n}`, `{code}_collider_L{n}`, `{code}_wall_l{n}`
- 신규 (QGIS CAD): `{code}_rooms_L{n}`, `{code}_corridors_L{n}`

## 레이어 ID 규칙

MapLibre GL 소스/레이어는 `{building}-floor-{level}-{type}` 형식:
- `eng1-floor-1-rooms-3d`, `eng1-floor-1-corridors-3d`, `eng1-floor-1-walls-3d`, ...
