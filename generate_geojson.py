"""
제1공학관 GeoJSON Generator — Wall-Grid Based
벽(wall)을 먼저 정의하고, 방은 벽이 만드는 셀(cell)로 생성.
인접 방이 벽 좌표를 정확히 공유하여 3D 벽 렌더링이 자연스러움.

Building structure (from floor plan analysis):
- 21동 (south wing): horizontal, rooms on both sides of corridor
- 22동 (east wing): vertical connector, rooms on both sides
- 23동 (north wing): horizontal, rooms + elevator
- 3 wings form a ㄷ shape, 5 floors (1F-5F)
"""

import json
import math

# === Constants ===

# Building rotation: -8.81° from east (measured from room edge vectors)
BUILDING_ANGLE_DEG = -8.81
BUILDING_ANGLE_RAD = math.radians(BUILDING_ANGLE_DEG)

# Coordinate conversion at latitude 37.294°
M_PER_DEG_LAT = 111320.0
M_PER_DEG_LON = 111320.0 * math.cos(math.radians(37.294))  # ≈ 88480

# Unit vectors in (lon, lat) per meter along building axes
U_PER_M = (
    math.cos(BUILDING_ANGLE_RAD) / M_PER_DEG_LON,
    math.sin(BUILDING_ANGLE_RAD) / M_PER_DEG_LAT,
)
V_PER_M = (
    -math.sin(BUILDING_ANGLE_RAD) / M_PER_DEG_LON,
    math.cos(BUILDING_ANGLE_RAD) / M_PER_DEG_LAT,
)

# Building origin: SW corner of 21동 outer wall
ORIGIN = (126.975940, 37.293520)

# === Building outline from OSM (way/70081312) ===
BUILDING_OUTLINE = [
    [126.976093, 37.2937298],
    [126.9768556, 37.2936361],
    [126.976843, 37.293539],
    [126.9769404, 37.2935317],
    [126.9770163, 37.2940618],
    [126.9771373, 37.2940455],
    [126.977147, 37.2941199],
    [126.9762726, 37.2942163],
    [126.9762628, 37.2941081],
    [126.9761843, 37.2941168],
    [126.9761747, 37.2940332],
    [126.975968, 37.2940549],
    [126.9759085, 37.2941193],
    [126.9759206, 37.2942468],
    [126.9760287, 37.2942384],
    [126.9760272, 37.294286],
    [126.9760161, 37.2942946],
    [126.9760219, 37.294364],
    [126.9760688, 37.2943915],
    [126.9761499, 37.2943892],
    [126.9761887, 37.2943538],
    [126.9761887, 37.294319],
    [126.9763173, 37.294313],
    [126.9763228, 37.2943898],
    [126.976452, 37.2943762],
    [126.976448, 37.2943249],
    [126.9765065, 37.2943222],
    [126.9765122, 37.2943698],
    [126.9771484, 37.2943025],
    [126.9771701, 37.2943002],
    [126.9771604, 37.2942245],
    [126.9773246, 37.2942134],
    [126.9773053, 37.2941024],
    [126.9772167, 37.2941122],
    [126.9772061, 37.2940383],
    [126.9772925, 37.2940284],
    [126.9772013, 37.2934949],
    [126.977076, 37.2935029],
    [126.9770614, 37.293395],
    [126.9769186, 37.2934173],
    [126.976928, 37.2934874],
    [126.9768379, 37.2934908],
    [126.9768316, 37.2934508],
    [126.9760751, 37.2935423],
    [126.976079, 37.2935836],
    [126.976044, 37.2935827],
    [126.9760467, 37.2936077],
    [126.9759583, 37.2936169],
    [126.9759696, 37.2937252],
    [126.9760583, 37.293716],
    [126.9760517, 37.2936543],
    [126.9760856, 37.2936523],
    [126.976093, 37.2937298],  # close polygon
]


# === Coordinate Transform ===

def local_to_wgs84(u_m: float, v_m: float) -> list:
    """Convert local building coordinates (meters) to WGS84 [lon, lat]."""
    lon = ORIGIN[0] + u_m * U_PER_M[0] + v_m * V_PER_M[0]
    lat = ORIGIN[1] + u_m * U_PER_M[1] + v_m * V_PER_M[1]
    return [round(lon, 7), round(lat, 7)]


def make_polygon(corners_m: list) -> list:
    """Convert list of (u, v) meter points to closed GeoJSON polygon ring."""
    ring = [local_to_wgs84(u, v) for u, v in corners_m]
    ring.append(ring[0])  # close polygon
    return [ring]


def make_line(points_m: list) -> list:
    """Convert list of (u, v) meter points to GeoJSON LineString coordinates."""
    return [local_to_wgs84(u, v) for u, v in points_m]


# === Feature Constructors ===

def make_feature(fid: str, properties: dict, coordinates: list) -> dict:
    return {
        "type": "Feature",
        "id": fid,
        "properties": {**properties, "id": fid},
        "geometry": {"type": "Polygon", "coordinates": coordinates},
    }


def make_wall_feature(fid: str, properties: dict, coordinates: list) -> dict:
    return {
        "type": "Feature",
        "id": fid,
        "properties": {**properties, "id": fid},
        "geometry": {"type": "LineString", "coordinates": coordinates},
    }


def make_point_feature(fid: str, properties: dict, lon: float, lat: float) -> dict:
    return {
        "type": "Feature",
        "id": fid,
        "properties": {**properties, "id": fid},
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
    }


# === Wing Definitions (in local meters) ===
# u = along building axis, v = perpendicular to building axis
# Origin (0,0) = SW corner of 21동

# 21동 (south wing) — runs along u-axis
WING_21 = {
    "name": "21동",
    "u_start": 0,       # west end
    "u_end": 86,         # east end
    "v_outer_south": 0,  # south outer wall
    "v_corridor_south": 8.5,   # corridor south wall
    "v_corridor_north": 13.5,  # corridor north wall
    "v_outer_north": 22,       # north outer wall
    "room_count_south": 8,
    "room_count_north": 8,
    "wing_id": "21",
    "orientation": "horizontal",
}

# 22동 (east wing) — runs along v-axis, connected to 21동 east end
WING_22 = {
    "name": "22동",
    "u_start": 80,       # west wall (overlaps with 21동 east end)
    "u_end": 100,        # east wall
    "v_start": 15,       # south end (connected to 21동)
    "v_end": 70,         # north end (connected to 23동)
    "u_corridor_west": 86,
    "u_corridor_east": 93,
    "room_count_west": 6,
    "room_count_east": 6,
    "wing_id": "22",
    "orientation": "vertical",
}

# 23동 (north wing) — runs along u-axis
WING_23 = {
    "name": "23동",
    "u_start": 5,        # west end
    "u_end": 100,        # east end (connects to 22동)
    "v_outer_south": 67, # south outer wall
    "v_corridor_south": 75,
    "v_corridor_north": 80,
    "v_outer_north": 88,
    "room_count_south": 6,
    "room_count_north": 6,
    "wing_id": "23",
    "orientation": "horizontal",
}


# === Wall Grid Generator ===

def generate_horizontal_wing(wing: dict, level: int):
    """Generate rooms, corridor, and walls for a horizontal wing."""
    features = []
    walls = []

    u0 = wing["u_start"]
    u1 = wing["u_end"]
    v_os = wing["v_outer_south"]
    v_cs = wing["v_corridor_south"]
    v_cn = wing["v_corridor_north"]
    v_on = wing["v_outer_north"]
    wid = wing["wing_id"]
    n_south = wing["room_count_south"]
    n_north = wing["room_count_north"]

    # Wall grid positions along u-axis for each side
    south_u_walls = [u0 + i * (u1 - u0) / n_south for i in range(n_south + 1)]
    north_u_walls = [u0 + i * (u1 - u0) / n_north for i in range(n_north + 1)]

    # --- Corridor ---
    corridor_corners = [(u0, v_cs), (u1, v_cs), (u1, v_cn), (u0, v_cn)]
    features.append(make_feature(
        f"way/skku_{wid}_corridor_L{level}",
        {"indoor": "corridor", "level": str(level)},
        make_polygon(corridor_corners),
    ))

    # --- South rooms (between v_os and v_cs) ---
    for i in range(n_south):
        ul = south_u_walls[i]
        ur = south_u_walls[i + 1]
        corners = [(ul, v_os), (ur, v_os), (ur, v_cs), (ul, v_cs)]
        ref = f"{wid}{level}{i + 1:02d}"
        features.append(make_feature(
            f"way/skku_room_{ref}",
            {"indoor": "room", "level": str(level), "ref": ref, "name": f"Room {ref}"},
            make_polygon(corners),
        ))

    # --- North rooms (between v_cn and v_on) ---
    for i in range(n_north):
        ul = north_u_walls[i]
        ur = north_u_walls[i + 1]
        corners = [(ul, v_cn), (ur, v_cn), (ur, v_on), (ul, v_on)]
        ref = f"{wid}{level}{i + 1 + n_south:02d}"
        features.append(make_feature(
            f"way/skku_room_{ref}",
            {"indoor": "room", "level": str(level), "ref": ref, "name": f"Room {ref}"},
            make_polygon(corners),
        ))

    # --- Wall features ---
    # Outer walls
    walls.append(("exterior", [(u0, v_os), (u1, v_os)]))  # south outer
    walls.append(("exterior", [(u0, v_on), (u1, v_on)]))  # north outer
    walls.append(("exterior", [(u0, v_os), (u0, v_on)]))  # west outer
    walls.append(("exterior", [(u1, v_os), (u1, v_on)]))  # east outer

    # Corridor walls
    walls.append(("corridor", [(u0, v_cs), (u1, v_cs)]))  # corridor south
    walls.append(("corridor", [(u0, v_cn), (u1, v_cn)]))  # corridor north

    # Partition walls (south side)
    for i in range(1, n_south):
        u = south_u_walls[i]
        walls.append(("partition", [(u, v_os), (u, v_cs)]))

    # Partition walls (north side)
    for i in range(1, n_north):
        u = north_u_walls[i]
        walls.append(("partition", [(u, v_cn), (u, v_on)]))

    # Create wall LineString features
    for idx, (wtype, pts) in enumerate(walls):
        features.append(make_wall_feature(
            f"wall/skku_{wid}_L{level}_{wtype}_{idx}",
            {"indoor": "wall", "level": str(level), "wall_type": wtype},
            make_line(pts),
        ))

    return features


def generate_vertical_wing(wing: dict, level: int):
    """Generate rooms, corridor, and walls for a vertical wing (22동)."""
    features = []
    walls = []

    u_west = wing["u_start"]
    u_east = wing["u_end"]
    v0 = wing["v_start"]
    v1 = wing["v_end"]
    u_cw = wing["u_corridor_west"]
    u_ce = wing["u_corridor_east"]
    wid = wing["wing_id"]
    n_west = wing["room_count_west"]
    n_east = wing["room_count_east"]

    # Wall grid positions along v-axis for each side
    west_v_walls = [v0 + i * (v1 - v0) / n_west for i in range(n_west + 1)]
    east_v_walls = [v0 + i * (v1 - v0) / n_east for i in range(n_east + 1)]

    # --- Corridor ---
    corridor_corners = [(u_cw, v0), (u_ce, v0), (u_ce, v1), (u_cw, v1)]
    features.append(make_feature(
        f"way/skku_{wid}_corridor_L{level}",
        {"indoor": "corridor", "level": str(level)},
        make_polygon(corridor_corners),
    ))

    # --- West rooms (between u_west and u_cw) ---
    for i in range(n_west):
        vb = west_v_walls[i]
        vt = west_v_walls[i + 1]
        corners = [(u_west, vb), (u_cw, vb), (u_cw, vt), (u_west, vt)]
        ref = f"{wid}{level}{i + 1:02d}"
        features.append(make_feature(
            f"way/skku_room_{ref}",
            {"indoor": "room", "level": str(level), "ref": ref, "name": f"Room {ref}"},
            make_polygon(corners),
        ))

    # --- East rooms (between u_ce and u_east) ---
    for i in range(n_east):
        vb = east_v_walls[i]
        vt = east_v_walls[i + 1]
        corners = [(u_ce, vb), (u_east, vb), (u_east, vt), (u_ce, vt)]
        ref = f"{wid}{level}{i + 1 + n_west:02d}"
        features.append(make_feature(
            f"way/skku_room_{ref}",
            {"indoor": "room", "level": str(level), "ref": ref, "name": f"Room {ref}"},
            make_polygon(corners),
        ))

    # --- Wall features ---
    # Outer walls
    walls.append(("exterior", [(u_west, v0), (u_west, v1)]))
    walls.append(("exterior", [(u_east, v0), (u_east, v1)]))
    walls.append(("exterior", [(u_west, v0), (u_east, v0)]))
    walls.append(("exterior", [(u_west, v1), (u_east, v1)]))

    # Corridor walls
    walls.append(("corridor", [(u_cw, v0), (u_cw, v1)]))
    walls.append(("corridor", [(u_ce, v0), (u_ce, v1)]))

    # Partition walls (west side)
    for i in range(1, n_west):
        v = west_v_walls[i]
        walls.append(("partition", [(u_west, v), (u_cw, v)]))

    # Partition walls (east side)
    for i in range(1, n_east):
        v = east_v_walls[i]
        walls.append(("partition", [(u_ce, v), (u_east, v)]))

    for idx, (wtype, pts) in enumerate(walls):
        features.append(make_wall_feature(
            f"wall/skku_{wid}_L{level}_{wtype}_{idx}",
            {"indoor": "wall", "level": str(level), "wall_type": wtype},
            make_line(pts),
        ))

    return features


def generate_stairs_and_elevator():
    """Generate stairs and elevator features (present on all floors)."""
    features = []
    level_range = "1-5"

    # Stairs at 21동 west end
    features.append(make_feature(
        "way/skku_stairs_21w",
        {"indoor": "room", "level": level_range, "stairs": "yes",
         "ref": "계단A", "name": "계단 A"},
        make_polygon([(-2, 0), (0, 0), (0, 12), (-2, 12)]),
    ))

    # Stairs at 21동-22동 junction (southeast)
    features.append(make_feature(
        "way/skku_stairs_junction_se",
        {"indoor": "room", "level": level_range, "stairs": "yes",
         "ref": "계단B", "name": "계단 B"},
        make_polygon([(86, 0), (88, 0), (88, 12), (86, 12)]),
    ))

    # Stairs at 22동-23동 junction (northeast)
    features.append(make_feature(
        "way/skku_stairs_junction_ne",
        {"indoor": "room", "level": level_range, "stairs": "yes",
         "ref": "계단C", "name": "계단 C"},
        make_polygon([(86, 67), (88, 67), (88, 78), (86, 78)]),
    ))

    # Stairs at 23동 west end
    features.append(make_feature(
        "way/skku_stairs_23w",
        {"indoor": "room", "level": level_range, "stairs": "yes",
         "ref": "계단D", "name": "계단 D"},
        make_polygon([(3, 75), (5, 75), (5, 88), (3, 88)]),
    ))

    # Elevator in 23동 (center area)
    features.append(make_feature(
        "way/skku_elevator_23",
        {"indoor": "room", "level": level_range, "highway": "elevator",
         "ref": "엘리베이터", "name": "엘리베이터", "wheelchair": "yes"},
        make_polygon([(45, 75), (48, 75), (48, 80), (45, 80)]),
    ))

    return features


def generate_geojson():
    features = []

    # 1. Building outline feature
    features.append({
        "type": "Feature",
        "id": "way/70081312",
        "properties": {
            "building": "university",
            "building:levels": "5",
            "min_level": "1",
            "max_level": "5",
            "name": "제1공학관",
            "name:en": "Engineering Building 1",
            "loc_ref": "ENG1",
            "id": "way/70081312",
        },
        "geometry": {"type": "Polygon", "coordinates": [BUILDING_OUTLINE]},
    })

    # 2. Bearing calculation nodes
    bearing_1 = local_to_wgs84(0, 11)   # west midpoint of 21동
    bearing_2 = local_to_wgs84(86, 10)  # east midpoint of 21동
    features.append(make_point_feature(
        "node/skku_bearing_1", {"level": "1"}, bearing_1[0], bearing_1[1],
    ))
    features.append(make_point_feature(
        "node/skku_bearing_2", {"level": "1"}, bearing_2[0], bearing_2[1],
    ))

    # 3. Generate rooms, corridors, and walls for each floor
    for level in range(1, 6):
        features.extend(generate_horizontal_wing(WING_21, level))
        features.extend(generate_vertical_wing(WING_22, level))
        features.extend(generate_horizontal_wing(WING_23, level))

    # 4. Stairs and elevator (shared across all floors)
    features.extend(generate_stairs_and_elevator())

    return {"type": "FeatureCollection", "features": features}


if __name__ == "__main__":
    geojson = generate_geojson()

    output_path = "2.5D-Indoor-Maps/public/geojson/eng1.geojson"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    # Summary
    total = len(geojson["features"])
    rooms = sum(1 for f in geojson["features"]
                if f["properties"].get("indoor") == "room"
                and "stairs" not in f["properties"]
                and "highway" not in f["properties"])
    corridors = sum(1 for f in geojson["features"]
                    if f["properties"].get("indoor") == "corridor")
    walls_count = sum(1 for f in geojson["features"]
                      if f["properties"].get("indoor") == "wall")
    stairs = sum(1 for f in geojson["features"]
                 if f["properties"].get("stairs") == "yes")
    elevators = sum(1 for f in geojson["features"]
                    if f["properties"].get("highway") == "elevator")

    print(f"Generated {output_path}")
    print(f"  Total features: {total}")
    print(f"  Building outline: 1")
    print(f"  Bearing nodes: 2")
    print(f"  Rooms: {rooms} (across 5 floors)")
    print(f"  Corridors: {corridors}")
    print(f"  Walls: {walls_count}")
    print(f"  Stairs: {stairs}")
    print(f"  Elevators: {elevators}")
