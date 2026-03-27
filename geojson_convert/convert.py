"""
QGIS에서 내보낸 GeoJSON → 앱 호환 GeoJSON 변환 스크립트

원본: Geojson/ 폴더 (수정 안 함)
출력: geojson_convert/eng1.geojson
"""
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
INPUT_DIR = os.path.join(PROJECT_DIR, "Geojson")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "eng1.geojson")


def multi_to_single(geometry):
    """MultiPolygon → Polygon 변환 (단일 링만 있을 때)"""
    if geometry["type"] == "MultiPolygon":
        coords = geometry["coordinates"]
        if len(coords) == 1:
            return {"type": "Polygon", "coordinates": coords[0]}
    return geometry


def calc_center(coords):
    """폴리곤 중심 좌표 계산"""
    ring = coords[0] if coords else []
    if not ring:
        return None
    n = len(ring)
    cx = sum(p[0] for p in ring) / n
    cy = sum(p[1] for p in ring) / n
    return (cx, cy)


def classify_building(cx, cy):
    """좌표로 21/22/23동 분류"""
    # 21동 왼쪽 끝 계단 (lon < 126.9761, lat < 37.2938)
    if cx < 126.97605 and cy < 37.29380:
        return "21_stairs"
    # 21-22동 연결부 계단 (lon ~126.977, lat < 37.2935)
    if cx > 126.97690 and cy < 37.29355:
        return "21_22_stairs"
    # 22동: 오른쪽 세로 건물 (lon > 126.9769, lat 37.2935~37.2941)
    if cx > 126.97693 and cy < 37.29412:
        return "22"
    # 23동: 위쪽 가로 건물 (lat > 37.2941)
    if cy > 37.29418:
        return "23"
    # 21동: 아래쪽 가로 건물
    if cy < 37.29418:
        return "21"
    return "unknown"


def classify_row(building, cx, cy):
    """같은 동 내에서 위/아래 또는 좌/우 줄 분류"""
    if building == "21":
        # 윗줄 (북쪽, 복도 쪽): lat > 37.29362
        return "north" if cy > 37.29362 else "south"
    elif building == "22":
        # 오른쪽 줄 (동쪽, 외벽): lon > 126.97710
        return "east" if cx > 126.97710 else "west"
    elif building == "23":
        # 윗줄 (북쪽, 외벽): lat > 37.29430
        return "north" if cy > 37.29430 else "south"
    return building  # stairs 등은 그대로


def assign_room_numbers(rooms_by_group):
    """
    각 그룹 내에서 위치 순으로 정렬하고 방 번호 할당.
    구조도 기반 방 번호 매핑.
    """
    result = []

    # 21동 북쪽 줄 (복도 쪽): 21102~21108 (왼→오, lon 순)
    group = rooms_by_group.get(("21", "north"), [])
    group.sort(key=lambda r: r["center"][0])
    room_nums_21n = [21102, 21103, 21104, 21105, 21106, 21107, 21108]
    for i, r in enumerate(group):
        ref = room_nums_21n[i] if i < len(room_nums_21n) else 21102 + i
        r["ref"] = str(ref)
        r["room_type"] = "classroom"
        result.append(r)

    # 21동 남쪽 줄 (외벽 쪽): 21101, 21109~21118 (왼→오, lon 순)
    group = rooms_by_group.get(("21", "south"), [])
    group.sort(key=lambda r: r["center"][0])
    room_nums_21s = [21101, 21109, 21110, 21111, 21112, 21113, 21114, 21115]
    for i, r in enumerate(group):
        ref = room_nums_21s[i] if i < len(room_nums_21s) else 21109 + i
        r["ref"] = str(ref)
        r["room_type"] = "classroom"
        result.append(r)

    # 22동 동쪽 줄 (외벽): 22101~22106 (위→아래, lat 내림차순)
    group = rooms_by_group.get(("22", "east"), [])
    group.sort(key=lambda r: -r["center"][1])
    room_nums_22e = [22101, 22102, 22103, 22104, 22105, 22106]
    for i, r in enumerate(group):
        ref = room_nums_22e[i] if i < len(room_nums_22e) else 22101 + i
        r["ref"] = str(ref)
        r["room_type"] = "classroom"
        result.append(r)

    # 22동 서쪽 줄 (복도 쪽): 22107~22113 (위→아래, lat 내림차순)
    group = rooms_by_group.get(("22", "west"), [])
    group.sort(key=lambda r: -r["center"][1])
    room_nums_22w = [22107, 22108, 22109, 22110, 22111, 22112, 22113]
    for i, r in enumerate(group):
        ref = room_nums_22w[i] if i < len(room_nums_22w) else 22107 + i
        r["ref"] = str(ref)
        r["room_type"] = "classroom"
        result.append(r)

    # 23동 남쪽 줄 (복도 쪽): 23102~23108 (왼→오)
    group = rooms_by_group.get(("23", "south"), [])
    group.sort(key=lambda r: r["center"][0])
    room_nums_23s = [23102, 23103, 23104, 23105, 23106, 23107, 23108]
    for i, r in enumerate(group):
        ref = room_nums_23s[i] if i < len(room_nums_23s) else 23102 + i
        r["ref"] = str(ref)
        r["room_type"] = "classroom"
        result.append(r)

    # 23동 북쪽 줄 (외벽 쪽): 23109~23114+ (왼→오)
    group = rooms_by_group.get(("23", "north"), [])
    group.sort(key=lambda r: r["center"][0])
    room_nums_23n = [23109, 23110, 23111, 23112, 23113, 23114, 23115,
                     23116, 23117, 23118, 23119, 23120, 23121, 23122]
    for i, r in enumerate(group):
        ref = room_nums_23n[i] if i < len(room_nums_23n) else 23109 + i
        r["ref"] = str(ref)
        r["room_type"] = "classroom"
        result.append(r)

    # 21동 왼쪽 (0=화장실, 1=계단) — lat 내림차순 정렬
    group = rooms_by_group.get(("21_stairs", "21_stairs"), [])
    group.sort(key=lambda r: -r["center"][1])  # 위쪽(높은 lat)이 0
    types_21 = [("21_toilet", "toilets"), ("21_stairs", "stairs")]
    for i, r in enumerate(group):
        ref, rtype = types_21[i] if i < len(types_21) else (f"21_stairs_{i}", "stairs")
        r["ref"] = ref
        r["room_type"] = rtype
        result.append(r)

    # 21-22동 연결부 (0=화장실, 1=계단) — lat 내림차순 정렬
    group = rooms_by_group.get(("21_22_stairs", "21_22_stairs"), [])
    group.sort(key=lambda r: -r["center"][1])  # 위쪽이 0
    types_2122 = [("21_22_toilet", "toilets"), ("21_22_stairs", "stairs")]
    for i, r in enumerate(group):
        ref, rtype = types_2122[i] if i < len(types_2122) else (f"21_22_stairs_{i}", "stairs")
        r["ref"] = ref
        r["room_type"] = rtype
        result.append(r)

    # 분류 안 된 방
    for key, group in rooms_by_group.items():
        if key[0] == "unknown":
            for r in group:
                r["ref"] = "unknown"
                r["room_type"] = "room"
                result.append(r)

    return result


def convert():
    features = []

    # === 1. 건물 외곽선 ===
    with open(os.path.join(INPUT_DIR, "eng1_outline.geojson"), encoding="utf-8") as f:
        outline_data = json.load(f)

    for feat in outline_data["features"]:
        geom = multi_to_single(feat["geometry"])
        if geom["type"] == "Polygon" and geom["coordinates"] and geom["coordinates"][0]:
            features.append({
                "type": "Feature",
                "id": "way/eng1_outline",
                "properties": {
                    "building": "university",
                    "building:levels": "5",
                    "min_level": "1",
                    "max_level": "5",
                    "name": "제1공학관",
                    "name:en": "Engineering Building 1",
                    "loc_ref": "ENG1",
                    "id": "way/eng1_outline"
                },
                "geometry": geom
            })
            break  # 외곽선은 하나만

    # === 2. 복도 (collider → corridor) ===
    collider_path = os.path.join(INPUT_DIR, "eng1_collider_L1.geojson")
    if os.path.exists(collider_path):
        with open(collider_path, encoding="utf-8") as f:
            collider_data = json.load(f)
        for i, feat in enumerate(collider_data["features"]):
            geom = multi_to_single(feat["geometry"])
            if geom["type"] == "Polygon" and geom["coordinates"] and geom["coordinates"][0]:
                features.append({
                    "type": "Feature",
                    "id": f"way/skku_corridor_L1_{i}",
                    "properties": {
                        "indoor": "corridor",
                        "level": "1",
                        "id": f"way/skku_corridor_L1_{i}"
                    },
                    "geometry": geom
                })

    # === 3. 방 ===
    with open(os.path.join(INPUT_DIR, "eng1_rooms_L1.geojson"), encoding="utf-8") as f:
        rooms_data = json.load(f)

    # 방을 그룹별로 분류
    rooms_by_group = {}
    for feat in rooms_data["features"]:
        geom = multi_to_single(feat["geometry"])
        if geom["type"] != "Polygon" or not geom["coordinates"] or not geom["coordinates"][0]:
            continue
        center = calc_center(geom["coordinates"])
        if not center:
            continue
        building = classify_building(center[0], center[1])
        row = classify_row(building, center[0], center[1])
        key = (building, row)
        if key not in rooms_by_group:
            rooms_by_group[key] = []
        rooms_by_group[key].append({
            "geometry": geom,
            "center": center
        })

    # 그룹별 현황 출력
    print("\n=== 방 그룹별 현황 ===")
    for key, group in sorted(rooms_by_group.items()):
        print(f"  {key[0]}동 {key[1]}: {len(group)}개")

    # 방 번호 할당
    assigned_rooms = assign_room_numbers(rooms_by_group)

    for r in assigned_rooms:
        ref = r["ref"]
        building = ref[:2] if ref != "unknown" else "xx"
        feat_id = f"way/skku_room_{ref}"
        features.append({
            "type": "Feature",
            "id": feat_id,
            "properties": {
                "indoor": "room",
                "level": "1",
                "ref": ref,
                "name": f"Room {ref}",
                "room_type": r["room_type"],
                "id": feat_id
            },
            "geometry": r["geometry"]
        })

    # === 4. 벽 ===
    walls_path = os.path.join(INPUT_DIR, "eng1_walls_l1.geojson")
    if os.path.exists(walls_path):
        with open(walls_path, encoding="utf-8") as f:
            walls_data = json.load(f)
        for i, feat in enumerate(walls_data["features"]):
            geom = feat["geometry"]
            if geom.get("coordinates"):
                features.append({
                    "type": "Feature",
                    "id": f"wall/skku_L1_partition_{i}",
                    "properties": {
                        "indoor": "wall",
                        "level": "1",
                        "wall_type": "partition",
                        "id": f"wall/skku_L1_partition_{i}"
                    },
                    "geometry": geom
                })

    # === 5. Bearing 계산 노드 (지도 회전용) ===
    # 21동 남쪽 벽의 양 끝 점 사용 (수평선 기준)
    features.append({
        "type": "Feature",
        "id": "node/skku_bearing_1",
        "properties": {"id": "node/skku_bearing_1", "level": "1"},
        "geometry": {
            "type": "Point",
            "coordinates": [126.976816, 37.293503]  # 21동 남동쪽
        }
    })
    features.append({
        "type": "Feature",
        "id": "node/skku_bearing_2",
        "properties": {"id": "node/skku_bearing_2", "level": "1"},
        "geometry": {
            "type": "Point",
            "coordinates": [126.976072, 37.293594]  # 21동 남서쪽
        }
    })

    # === 출력 ===
    output = {
        "type": "FeatureCollection",
        "features": features
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n=== 변환 완료 ===")
    print(f"  총 피처: {len(features)}")
    print(f"  출력: {OUTPUT_FILE}")

    # 요약
    counts = {}
    for feat in features:
        indoor = feat["properties"].get("indoor", feat["properties"].get("building", "outline"))
        counts[indoor] = counts.get(indoor, 0) + 1
    for k, v in counts.items():
        print(f"  - {k}: {v}개")


if __name__ == "__main__":
    convert()
