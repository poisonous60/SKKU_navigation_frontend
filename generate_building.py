"""
범용 건물 JSON → GeoJSON 변환기
Usage: python generate_building.py buildings/eng1.json [--output path/to/output.geojson]
"""

import json
import math
import sys
import os

# === OSM Building Outline (제1공학관) ===
BUILDING_OUTLINES = {
    "osm": [
        [126.976093, 37.2937298], [126.9768556, 37.2936361], [126.976843, 37.293539],
        [126.9769404, 37.2935317], [126.9770163, 37.2940618], [126.9771373, 37.2940455],
        [126.977147, 37.2941199], [126.9762726, 37.2942163], [126.9762628, 37.2941081],
        [126.9761843, 37.2941168], [126.9761747, 37.2940332], [126.975968, 37.2940549],
        [126.9759085, 37.2941193], [126.9759206, 37.2942468], [126.9760287, 37.2942384],
        [126.9760272, 37.294286], [126.9760161, 37.2942946], [126.9760219, 37.294364],
        [126.9760688, 37.2943915], [126.9761499, 37.2943892], [126.9761887, 37.2943538],
        [126.9761887, 37.294319], [126.9763173, 37.294313], [126.9763228, 37.2943898],
        [126.976452, 37.2943762], [126.976448, 37.2943249], [126.9765065, 37.2943222],
        [126.9765122, 37.2943698], [126.9771484, 37.2943025], [126.9771701, 37.2943002],
        [126.9771604, 37.2942245], [126.9773246, 37.2942134], [126.9773053, 37.2941024],
        [126.9772167, 37.2941122], [126.9772061, 37.2940383], [126.9772925, 37.2940284],
        [126.9772013, 37.2934949], [126.977076, 37.2935029], [126.9770614, 37.293395],
        [126.9769186, 37.2934173], [126.976928, 37.2934874], [126.9768379, 37.2934908],
        [126.9768316, 37.2934508], [126.9760751, 37.2935423], [126.976079, 37.2935836],
        [126.976044, 37.2935827], [126.9760467, 37.2936077], [126.9759583, 37.2936169],
        [126.9759696, 37.2937252], [126.9760583, 37.293716], [126.9760517, 37.2936543],
        [126.9760856, 37.2936523], [126.976093, 37.2937298],
    ]
}


class BuildingGenerator:
    def __init__(self, config_path: str):
        with open(config_path, 'r', encoding='utf-8') as f:
            self.config = json.load(f)

        self.origin = self.config["origin_wgs84"]
        angle_rad = math.radians(self.config["rotation_deg"])
        lat_rad = math.radians(self.origin[1])

        M_PER_DEG_LAT = 111320.0
        M_PER_DEG_LON = 111320.0 * math.cos(lat_rad)

        self.u_per_m = (
            math.cos(angle_rad) / M_PER_DEG_LON,
            math.sin(angle_rad) / M_PER_DEG_LAT,
        )
        self.v_per_m = (
            -math.sin(angle_rad) / M_PER_DEG_LON,
            math.cos(angle_rad) / M_PER_DEG_LAT,
        )

    def local_to_wgs84(self, u: float, v: float) -> list:
        lon = self.origin[0] + u * self.u_per_m[0] + v * self.v_per_m[0]
        lat = self.origin[1] + u * self.u_per_m[1] + v * self.v_per_m[1]
        return [round(lon, 7), round(lat, 7)]

    def make_polygon(self, corners: list) -> list:
        ring = [self.local_to_wgs84(u, v) for u, v in corners]
        ring.append(ring[0])
        return [ring]

    def make_line(self, points: list) -> list:
        return [self.local_to_wgs84(u, v) for u, v in points]

    def feature(self, fid, props, coords):
        return {"type": "Feature", "id": fid, "properties": {**props, "id": fid},
                "geometry": {"type": "Polygon", "coordinates": coords}}

    def wall_feature(self, fid, props, coords):
        return {"type": "Feature", "id": fid, "properties": {**props, "id": fid},
                "geometry": {"type": "LineString", "coordinates": coords}}

    def point_feature(self, fid, props, lon, lat):
        return {"type": "Feature", "id": fid, "properties": {**props, "id": fid},
                "geometry": {"type": "Point", "coordinates": [lon, lat]}}

    def generate_horizontal_wing(self, wing, level):
        features = []
        wid = wing["id"]
        u0, u1 = wing["u_range"]
        v_os, v_on = wing["v_range"]
        v_cs, v_cn = wing["corridor"]["v_range"]

        south_rooms = wing["rooms"].get("south", {})
        north_rooms = wing["rooms"].get("north", {})
        n_south = south_rooms.get("count", 0)
        n_north = north_rooms.get("count", 0)
        v_south = south_rooms.get("v_range", [v_os, v_cs])
        v_north = north_rooms.get("v_range", [v_cn, v_on])

        # Corridor
        features.append(self.feature(
            f"way/skku_{wid}_corridor_L{level}",
            {"indoor": "corridor", "level": str(level)},
            self.make_polygon([(u0, v_cs), (u1, v_cs), (u1, v_cn), (u0, v_cn)]),
        ))

        # South rooms
        walls = []
        if n_south > 0:
            u_walls = [u0 + i * (u1 - u0) / n_south for i in range(n_south + 1)]
            for i in range(n_south):
                corners = [(u_walls[i], v_south[0]), (u_walls[i+1], v_south[0]),
                           (u_walls[i+1], v_south[1]), (u_walls[i], v_south[1])]
                ref = f"{wid}{level}{i+1:02d}"
                features.append(self.feature(
                    f"way/skku_room_{ref}",
                    {"indoor": "room", "level": str(level), "ref": ref, "name": f"Room {ref}"},
                    self.make_polygon(corners),
                ))
            for i in range(1, n_south):
                walls.append(("partition", [(u_walls[i], v_south[0]), (u_walls[i], v_south[1])]))

        # North rooms
        if n_north > 0:
            u_walls = [u0 + i * (u1 - u0) / n_north for i in range(n_north + 1)]
            for i in range(n_north):
                corners = [(u_walls[i], v_north[0]), (u_walls[i+1], v_north[0]),
                           (u_walls[i+1], v_north[1]), (u_walls[i], v_north[1])]
                ref = f"{wid}{level}{i+1+n_south:02d}"
                features.append(self.feature(
                    f"way/skku_room_{ref}",
                    {"indoor": "room", "level": str(level), "ref": ref, "name": f"Room {ref}"},
                    self.make_polygon(corners),
                ))
            for i in range(1, n_north):
                walls.append(("partition", [(u_walls[i], v_north[0]), (u_walls[i], v_north[1])]))

        # Walls
        walls.extend([
            ("exterior", [(u0, v_os), (u1, v_os)]),
            ("exterior", [(u0, v_on), (u1, v_on)]),
            ("exterior", [(u0, v_os), (u0, v_on)]),
            ("exterior", [(u1, v_os), (u1, v_on)]),
            ("corridor", [(u0, v_cs), (u1, v_cs)]),
            ("corridor", [(u0, v_cn), (u1, v_cn)]),
        ])

        for idx, (wtype, pts) in enumerate(walls):
            features.append(self.wall_feature(
                f"wall/skku_{wid}_L{level}_{wtype}_{idx}",
                {"indoor": "wall", "level": str(level), "wall_type": wtype},
                self.make_line(pts),
            ))

        return features

    def generate_vertical_wing(self, wing, level):
        features = []
        wid = wing["id"]
        u_west, u_east = wing["u_range"]
        v0, v1 = wing["v_range"]
        u_cw, u_ce = wing["corridor"]["u_range"]

        west_rooms = wing["rooms"].get("west", {})
        east_rooms = wing["rooms"].get("east", {})
        n_west = west_rooms.get("count", 0)
        n_east = east_rooms.get("count", 0)
        u_wr = west_rooms.get("u_range", [u_west, u_cw])
        u_er = east_rooms.get("u_range", [u_ce, u_east])

        # Corridor
        features.append(self.feature(
            f"way/skku_{wid}_corridor_L{level}",
            {"indoor": "corridor", "level": str(level)},
            self.make_polygon([(u_cw, v0), (u_ce, v0), (u_ce, v1), (u_cw, v1)]),
        ))

        walls = []

        # West rooms
        if n_west > 0:
            v_walls = [v0 + i * (v1 - v0) / n_west for i in range(n_west + 1)]
            for i in range(n_west):
                corners = [(u_wr[0], v_walls[i]), (u_wr[1], v_walls[i]),
                           (u_wr[1], v_walls[i+1]), (u_wr[0], v_walls[i+1])]
                ref = f"{wid}{level}{i+1:02d}"
                features.append(self.feature(
                    f"way/skku_room_{ref}",
                    {"indoor": "room", "level": str(level), "ref": ref, "name": f"Room {ref}"},
                    self.make_polygon(corners),
                ))
            for i in range(1, n_west):
                walls.append(("partition", [(u_wr[0], v_walls[i]), (u_wr[1], v_walls[i])]))

        # East rooms
        if n_east > 0:
            v_walls = [v0 + i * (v1 - v0) / n_east for i in range(n_east + 1)]
            for i in range(n_east):
                corners = [(u_er[0], v_walls[i]), (u_er[1], v_walls[i]),
                           (u_er[1], v_walls[i+1]), (u_er[0], v_walls[i+1])]
                ref = f"{wid}{level}{i+1+n_west:02d}"
                features.append(self.feature(
                    f"way/skku_room_{ref}",
                    {"indoor": "room", "level": str(level), "ref": ref, "name": f"Room {ref}"},
                    self.make_polygon(corners),
                ))
            for i in range(1, n_east):
                walls.append(("partition", [(u_er[0], v_walls[i]), (u_er[1], v_walls[i])]))

        # Walls
        walls.extend([
            ("exterior", [(u_west, v0), (u_west, v1)]),
            ("exterior", [(u_east, v0), (u_east, v1)]),
            ("exterior", [(u_west, v0), (u_east, v0)]),
            ("exterior", [(u_west, v1), (u_east, v1)]),
            ("corridor", [(u_cw, v0), (u_cw, v1)]),
            ("corridor", [(u_ce, v0), (u_ce, v1)]),
        ])

        for idx, (wtype, pts) in enumerate(walls):
            features.append(self.wall_feature(
                f"wall/skku_{wid}_L{level}_{wtype}_{idx}",
                {"indoor": "wall", "level": str(level), "wall_type": wtype},
                self.make_line(pts),
            ))

        return features

    def generate(self) -> dict:
        features = []
        cfg = self.config

        # Building outline
        outline_key = cfg.get("building_outline", "osm")
        if outline_key in BUILDING_OUTLINES:
            features.append({
                "type": "Feature", "id": "way/70081312",
                "properties": {
                    "building": "university", "building:levels": str(len(cfg["levels"])),
                    "min_level": str(min(cfg["levels"])), "max_level": str(max(cfg["levels"])),
                    "name": cfg["name"], "name:en": cfg.get("name_en", ""),
                    "loc_ref": cfg.get("loc_ref", ""), "id": "way/70081312",
                },
                "geometry": {"type": "Polygon", "coordinates": [BUILDING_OUTLINES[outline_key]]},
            })

        # Bearing calc nodes
        bearing_1 = self.local_to_wgs84(0, 11)
        bearing_2 = self.local_to_wgs84(86, 10)
        features.append(self.point_feature("node/skku_bearing_1", {"level": "1"}, bearing_1[0], bearing_1[1]))
        features.append(self.point_feature("node/skku_bearing_2", {"level": "1"}, bearing_2[0], bearing_2[1]))

        # Wings per level
        for level in cfg["levels"]:
            for wing in cfg["wings"]:
                if wing["orientation"] == "horizontal":
                    features.extend(self.generate_horizontal_wing(wing, level))
                elif wing["orientation"] == "vertical":
                    features.extend(self.generate_vertical_wing(wing, level))

        # Connectors (동 간 연결 통로) per level
        for conn in cfg.get("connectors", []):
            b = conn["bounds"]
            for level in cfg["levels"]:
                features.append(self.feature(
                    f"way/skku_{conn['id']}_L{level}",
                    {"indoor": "corridor", "level": str(level)},
                    self.make_polygon([(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])]),
                ))
                # Connector walls (side walls only)
                features.append(self.wall_feature(
                    f"wall/skku_{conn['id']}_L{level}_w0",
                    {"indoor": "wall", "level": str(level), "wall_type": "corridor"},
                    self.make_line([(b[0], b[1]), (b[0], b[3])]),
                ))
                features.append(self.wall_feature(
                    f"wall/skku_{conn['id']}_L{level}_w1",
                    {"indoor": "wall", "level": str(level), "wall_type": "corridor"},
                    self.make_line([(b[2], b[1]), (b[2], b[3])]),
                ))

        # Protrusions (돌출 영역 — 계단실, 엘리베이터 등) per level
        for prot in cfg.get("protrusions", []):
            b = prot["bounds"]
            indoor_type = prot.get("type", "area")
            for level in cfg["levels"]:
                features.append(self.feature(
                    f"way/skku_{prot['id']}_L{level}",
                    {"indoor": indoor_type, "level": str(level)},
                    self.make_polygon([(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])]),
                ))
                # Protrusion exterior walls
                walls_prot = [
                    [(b[0], b[1]), (b[2], b[1])],
                    [(b[0], b[3]), (b[2], b[3])],
                    [(b[0], b[1]), (b[0], b[3])],
                    [(b[2], b[1]), (b[2], b[3])],
                ]
                for wi, wpts in enumerate(walls_prot):
                    features.append(self.wall_feature(
                        f"wall/skku_{prot['id']}_L{level}_w{wi}",
                        {"indoor": "wall", "level": str(level), "wall_type": "exterior"},
                        self.make_line(wpts),
                    ))

        # Stairs
        for stair in cfg.get("stairs", []):
            b = stair["bounds"]
            features.append(self.feature(
                f"way/skku_stairs_{stair['id']}",
                {"indoor": "room", "level": stair["levels"], "stairs": "yes",
                 "ref": stair["ref"], "name": stair["name"]},
                self.make_polygon([(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])]),
            ))

        # Elevators
        for elev in cfg.get("elevators", []):
            b = elev["bounds"]
            props = {"indoor": "room", "level": elev["levels"], "highway": "elevator",
                     "ref": elev["ref"], "name": elev["name"]}
            if elev.get("wheelchair"):
                props["wheelchair"] = "yes"
            features.append(self.feature(
                f"way/skku_elevator_{elev['id']}",
                props,
                self.make_polygon([(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])]),
            ))

        return {"type": "FeatureCollection", "features": features}


def main():
    if len(sys.argv) < 2:
        print("Usage: python generate_building.py <config.json> [--output <path>]")
        sys.exit(1)

    config_path = sys.argv[1]
    output_path = None
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        output_path = sys.argv[idx + 1]

    gen = BuildingGenerator(config_path)
    geojson = gen.generate()

    if not output_path:
        name = os.path.splitext(os.path.basename(config_path))[0]
        output_path = f"2.5d_indoor_navigation_frontend/public/geojson/{name}.geojson"

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, ensure_ascii=False, indent=2)

    # Summary
    rooms = sum(1 for feat in geojson["features"]
                if feat["properties"].get("indoor") == "room"
                and "stairs" not in feat["properties"]
                and "highway" not in feat["properties"])
    corridors = sum(1 for feat in geojson["features"]
                    if feat["properties"].get("indoor") == "corridor")
    walls = sum(1 for feat in geojson["features"]
                if feat["properties"].get("indoor") == "wall")

    print(f"Generated: {output_path}")
    print(f"  Features: {len(geojson['features'])}")
    print(f"  Rooms: {rooms}")
    print(f"  Corridors: {corridors}")
    print(f"  Walls: {walls}")


if __name__ == "__main__":
    main()
