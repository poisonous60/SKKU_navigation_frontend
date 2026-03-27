from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "buildings" / "eng1.json"
GEOJSON_PATH = ROOT / "2.5d_indoor_navigation_frontend" / "public" / "geojson" / "eng1.geojson"
OUTPUT_BASENAME = "eng1_level1_reference"


LAYER_STYLES = {
    "SITE_OUTLINE": {"dxf_color": 8, "stroke": "#A8A8A8", "fill": None, "stroke_width": 1, "dash": "10 6"},
    "ROOM_21": {"dxf_color": 5, "stroke": "#506674", "fill": "#D7E7F2", "stroke_width": 1},
    "ROOM_22": {"dxf_color": 3, "stroke": "#567A56", "fill": "#D9ECD6", "stroke_width": 1},
    "ROOM_23": {"dxf_color": 30, "stroke": "#8B6A3D", "fill": "#F5DFC1", "stroke_width": 1},
    "CORRIDOR": {"dxf_color": 7, "stroke": "#888888", "fill": "#F5F5F0", "stroke_width": 1},
    "CONNECTOR": {"dxf_color": 9, "stroke": "#888888", "fill": "#ECEBE2", "stroke_width": 1},
    "PROTRUSION": {"dxf_color": 8, "stroke": "#7F7F7F", "fill": "#D8D8D8", "stroke_width": 1},
    "STAIR": {"dxf_color": 33, "stroke": "#6A4A2A", "fill": "#B89B87", "stroke_width": 1},
    "ELEVATOR": {"dxf_color": 151, "stroke": "#4D6A8A", "fill": "#BCD1EA", "stroke_width": 1},
    "ROOM_LABELS": {"dxf_color": 7, "stroke": "#2E2E2E", "fill": None, "stroke_width": 1},
    "ANNOTATION": {"dxf_color": 7, "stroke": "#2E2E2E", "fill": None, "stroke_width": 1},
    "GUIDE": {"dxf_color": 8, "stroke": "#666666", "fill": None, "stroke_width": 1},
}


@dataclass
class PolyEntity:
    points: list[tuple[float, float]]
    layer: str
    closed: bool = True


@dataclass
class TextEntity:
    text: str
    x: float
    y: float
    height: float
    layer: str
    rotation: float = 0.0


def rect(bounds: list[float] | tuple[float, float, float, float]) -> list[tuple[float, float]]:
    x0, y0, x1, y1 = bounds
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def polygon_center(points: list[tuple[float, float]]) -> tuple[float, float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return ((min(xs) + max(xs)) / 2.0, (min(ys) + max(ys)) / 2.0)


def polygon_size(points: list[tuple[float, float]]) -> tuple[float, float]:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (max(xs) - min(xs), max(ys) - min(ys))


class Eng1ReferenceCad:
    def __init__(self, config_path: Path, geojson_path: Path):
        self.config = json.loads(config_path.read_text(encoding="utf-8"))
        self.geojson = json.loads(geojson_path.read_text(encoding="utf-8"))
        self.origin_lon, self.origin_lat = self.config["origin_wgs84"]
        angle_rad = math.radians(self.config["rotation_deg"])
        lat_rad = math.radians(self.origin_lat)
        meters_per_deg_lat = 111320.0
        meters_per_deg_lon = 111320.0 * math.cos(lat_rad)

        self.u_per_m = (
            math.cos(angle_rad) / meters_per_deg_lon,
            math.sin(angle_rad) / meters_per_deg_lat,
        )
        self.v_per_m = (
            -math.sin(angle_rad) / meters_per_deg_lon,
            math.cos(angle_rad) / meters_per_deg_lat,
        )
        det = self.u_per_m[0] * self.v_per_m[1] - self.u_per_m[1] * self.v_per_m[0]
        self.inv_transform = (
            self.v_per_m[1] / det,
            -self.v_per_m[0] / det,
            -self.u_per_m[1] / det,
            self.u_per_m[0] / det,
        )

    def wgs84_to_local(self, lon: float, lat: float) -> tuple[float, float]:
        dx = lon - self.origin_lon
        dy = lat - self.origin_lat
        u = self.inv_transform[0] * dx + self.inv_transform[1] * dy
        v = self.inv_transform[2] * dx + self.inv_transform[3] * dy
        return (u, v)

    def site_outline_local(self) -> list[tuple[float, float]]:
        for feature in self.geojson["features"]:
            props = feature.get("properties", {})
            feature_id = feature.get("id", "")
            if props.get("building") and feature["geometry"]["type"] == "Polygon":
                coords = feature["geometry"]["coordinates"][0]
                return [self.wgs84_to_local(lon, lat) for lon, lat in coords[:-1]]
            if "outline" in feature_id and feature["geometry"]["type"] == "Polygon":
                coords = feature["geometry"]["coordinates"][0]
                return [self.wgs84_to_local(lon, lat) for lon, lat in coords[:-1]]
        return []

    def level_room_polygons(self, level: int) -> list[dict]:
        rooms: list[dict] = []
        for wing in self.config["wings"]:
            wing_id = wing["id"]
            if wing["orientation"] == "horizontal":
                u0, u1 = wing["u_range"]
                v0, v1 = wing["v_range"]
                vc0, vc1 = wing["corridor"]["v_range"]
                south = wing["rooms"].get("south", {})
                north = wing["rooms"].get("north", {})
                south_count = south.get("count", 0)
                north_count = north.get("count", 0)
                south_range = south.get("v_range", [v0, vc0])
                north_range = north.get("v_range", [vc1, v1])

                for index in range(south_count):
                    left = u0 + index * (u1 - u0) / south_count
                    right = u0 + (index + 1) * (u1 - u0) / south_count
                    rooms.append(
                        {
                            "ref": f"{wing_id}{level}{index + 1:02d}",
                            "wing": wing_id,
                            "poly": rect((left, south_range[0], right, south_range[1])),
                        }
                    )

                for index in range(north_count):
                    left = u0 + index * (u1 - u0) / north_count
                    right = u0 + (index + 1) * (u1 - u0) / north_count
                    rooms.append(
                        {
                            "ref": f"{wing_id}{level}{index + 1 + south_count:02d}",
                            "wing": wing_id,
                            "poly": rect((left, north_range[0], right, north_range[1])),
                        }
                    )

            else:
                u0, u1 = wing["u_range"]
                v0, v1 = wing["v_range"]
                uc0, uc1 = wing["corridor"]["u_range"]
                west = wing["rooms"].get("west", {})
                east = wing["rooms"].get("east", {})
                west_count = west.get("count", 0)
                east_count = east.get("count", 0)
                west_range = west.get("u_range", [u0, uc0])
                east_range = east.get("u_range", [uc1, u1])

                for index in range(west_count):
                    bottom = v0 + index * (v1 - v0) / west_count
                    top = v0 + (index + 1) * (v1 - v0) / west_count
                    rooms.append(
                        {
                            "ref": f"{wing_id}{level}{index + 1:02d}",
                            "wing": wing_id,
                            "poly": rect((west_range[0], bottom, west_range[1], top)),
                        }
                    )

                for index in range(east_count):
                    bottom = v0 + index * (v1 - v0) / east_count
                    top = v0 + (index + 1) * (v1 - v0) / east_count
                    rooms.append(
                        {
                            "ref": f"{wing_id}{level}{index + 1 + west_count:02d}",
                            "wing": wing_id,
                            "poly": rect((east_range[0], bottom, east_range[1], top)),
                        }
                    )
        return rooms

    def build_entities(self, level: int = 1) -> tuple[list[PolyEntity], list[TextEntity]]:
        polys: list[PolyEntity] = []
        texts: list[TextEntity] = []
        site_outline = self.site_outline_local()

        for wing in self.config["wings"]:
            wing_id = wing["id"]
            room_layer = f"ROOM_{wing_id}"
            if wing["orientation"] == "horizontal":
                u0, u1 = wing["u_range"]
                vc0, vc1 = wing["corridor"]["v_range"]
                polys.append(PolyEntity(rect((u0, vc0, u1, vc1)), "CORRIDOR"))
            else:
                v0, v1 = wing["v_range"]
                uc0, uc1 = wing["corridor"]["u_range"]
                polys.append(PolyEntity(rect((uc0, v0, uc1, v1)), "CORRIDOR"))

            for room in [room for room in self.level_room_polygons(level) if room["wing"] == wing_id]:
                polys.append(PolyEntity(room["poly"], room_layer))
                width, height = polygon_size(room["poly"])
                if min(width, height) >= 6:
                    cx, cy = polygon_center(room["poly"])
                    angle = 90.0 if wing["orientation"] == "vertical" and height > width else 0.0
                    texts.append(TextEntity(room["ref"], cx, cy, 1.75, "ROOM_LABELS", angle))

        for connector in self.config.get("connectors", []):
            polys.append(PolyEntity(rect(connector["bounds"]), "CONNECTOR"))

        for protrusion in self.config.get("protrusions", []):
            polys.append(PolyEntity(rect(protrusion["bounds"]), "PROTRUSION"))

        for stair in self.config.get("stairs", []):
            stair_poly = rect(stair["bounds"])
            polys.append(PolyEntity(stair_poly, "STAIR"))
            cx, cy = polygon_center(stair_poly)
            texts.append(TextEntity(stair["ref"].replace("계단", "Stair "), cx, cy, 2.2, "ANNOTATION", 90.0))

        for elevator in self.config.get("elevators", []):
            elevator_poly = rect(elevator["bounds"])
            polys.append(PolyEntity(elevator_poly, "ELEVATOR"))
            cx, cy = polygon_center(elevator_poly)
            texts.append(TextEntity("EV", cx, cy, 2.0, "ANNOTATION", 90.0))

        texts.extend(
            [
                TextEntity("WING 23", 36.0, 83.0, 4.5, "ANNOTATION"),
                TextEntity("WING 22", 76.0, 47.0, 4.5, "ANNOTATION", 90.0),
                TextEntity("WING 21", 43.0, 11.0, 4.5, "ANNOTATION"),
                TextEntity("Engineering Building 1 - Level 1", 38.0, 100.0, 3.0, "ANNOTATION"),
                TextEntity("Reference CAD | local meters", 38.0, 96.0, 2.1, "GUIDE"),
                TextEntity("Origin: SW corner of Wing 21 body", 10.0, -8.0, 1.7, "GUIDE"),
                TextEntity("Outline: OSM footprint | Interior: eng1.json schematic", 22.0, -11.0, 1.7, "GUIDE"),
                TextEntity("Use ROOM_LABELS layer as generated refs, not surveyed room IDs.", 27.0, -14.0, 1.7, "GUIDE"),
            ]
        )

        guide_lines = [
            [(-18.0, -4.0), (94.0, -4.0)],
            [(-18.0, -16.5), (94.0, -16.5)],
            [(-18.0, 95.0), (94.0, 95.0)],
        ]
        for line_points in guide_lines:
            polys.append(PolyEntity(line_points, "GUIDE", closed=False))

        if site_outline:
            inset_min_x = -9.0
            inset_min_y = 34.0
            outline_xs = [point[0] for point in site_outline]
            outline_ys = [point[1] for point in site_outline]
            outline_width = max(outline_xs) - min(outline_xs)
            outline_height = max(outline_ys) - min(outline_ys)
            inset_scale = 0.24
            inset_width = outline_width * inset_scale
            inset_height = outline_height * inset_scale

            def inset_point(point: tuple[float, float]) -> tuple[float, float]:
                x, y = point
                return (
                    inset_min_x + (x - min(outline_xs)) * inset_scale,
                    inset_min_y + (y - min(outline_ys)) * inset_scale,
                )

            inset_outline = [inset_point(point) for point in site_outline]
            polys.append(
                PolyEntity(
                    rect((inset_min_x - 3.0, inset_min_y - 4.0, inset_min_x + inset_width + 3.0, inset_min_y + inset_height + 4.0)),
                    "GUIDE",
                )
            )
            polys.append(PolyEntity(inset_outline, "SITE_OUTLINE", closed=True))

            texts.append(TextEntity("Key map", inset_min_x + inset_width / 2.0, inset_min_y + inset_height + 1.8, 1.8, "GUIDE"))
            for label, point in {
                "W23": (36.0, 83.0),
                "W22": (76.0, 47.0),
                "W21": (43.0, 11.0),
            }.items():
                inset_x, inset_y = inset_point(point)
                texts.append(TextEntity(label, inset_x, inset_y, 1.45, "GUIDE"))

            polys.append(PolyEntity(site_outline, "SITE_OUTLINE", closed=True))

        return polys, texts


class DxfWriter:
    def __init__(self):
        self.entities: list[str] = []

    @staticmethod
    def fmt(value: float) -> str:
        return f"{value:.4f}"

    def add_lwpolyline(self, points: list[tuple[float, float]], layer: str, closed: bool = True):
        self.entities.extend(
            [
                "0",
                "LWPOLYLINE",
                "8",
                layer,
                "90",
                str(len(points)),
                "70",
                "1" if closed else "0",
            ]
        )
        for x, y in points:
            self.entities.extend(["10", self.fmt(x), "20", self.fmt(y)])

    def add_text(self, text: str, x: float, y: float, height: float, layer: str, rotation: float = 0.0):
        self.entities.extend(
            [
                "0",
                "TEXT",
                "8",
                layer,
                "10",
                self.fmt(x),
                "20",
                self.fmt(y),
                "30",
                "0.0",
                "40",
                self.fmt(height),
                "1",
                text,
                "50",
                self.fmt(rotation),
                "7",
                "STANDARD",
                "72",
                "1",
                "73",
                "2",
                "11",
                self.fmt(x),
                "21",
                self.fmt(y),
                "31",
                "0.0",
            ]
        )

    def write(self, path: Path):
        layer_names = ["0"] + [name for name in LAYER_STYLES if name != "0"]
        layer_records: list[str] = []
        for layer_name in layer_names:
            color = LAYER_STYLES.get(layer_name, {}).get("dxf_color", 7)
            layer_records.extend(
                [
                    "0",
                    "LAYER",
                    "2",
                    layer_name,
                    "70",
                    "0",
                    "62",
                    str(color),
                    "6",
                    "CONTINUOUS",
                ]
            )

        parts = [
            "0",
            "SECTION",
            "2",
            "HEADER",
            "9",
            "$ACADVER",
            "1",
            "AC1015",
            "9",
            "$INSUNITS",
            "70",
            "6",
            "0",
            "ENDSEC",
            "0",
            "SECTION",
            "2",
            "TABLES",
            "0",
            "TABLE",
            "2",
            "LTYPE",
            "70",
            "1",
            "0",
            "LTYPE",
            "2",
            "CONTINUOUS",
            "70",
            "0",
            "3",
            "Solid line",
            "72",
            "65",
            "73",
            "0",
            "40",
            "0.0",
            "0",
            "ENDTAB",
            "0",
            "TABLE",
            "2",
            "LAYER",
            "70",
            str(len(layer_records) // 10),
            *layer_records,
            "0",
            "ENDTAB",
            "0",
            "TABLE",
            "2",
            "STYLE",
            "70",
            "1",
            "0",
            "STYLE",
            "2",
            "STANDARD",
            "70",
            "0",
            "40",
            "0.0",
            "41",
            "1.0",
            "50",
            "0.0",
            "71",
            "0",
            "42",
            "0.2",
            "3",
            "txt",
            "4",
            "",
            "0",
            "ENDTAB",
            "0",
            "ENDSEC",
            "0",
            "SECTION",
            "2",
            "ENTITIES",
            *self.entities,
            "0",
            "ENDSEC",
            "0",
            "EOF",
        ]
        path.write_text("\n".join(parts) + "\n", encoding="utf-8")


class PreviewWriter:
    def __init__(self, polys: list[PolyEntity], texts: list[TextEntity]):
        self.polys = polys
        self.texts = texts
        self.margin = 48
        self.scale = 10.0
        self.bounds = self.compute_bounds()

    def compute_bounds(self) -> tuple[float, float, float, float]:
        xs: list[float] = []
        ys: list[float] = []
        for poly in self.polys:
            for x, y in poly.points:
                xs.append(x)
                ys.append(y)
        for text in self.texts:
            xs.append(text.x)
            ys.append(text.y)
        return (min(xs) - 4.0, min(ys) - 4.0, max(xs) + 4.0, max(ys) + 4.0)

    def to_px(self, point: tuple[float, float]) -> tuple[float, float]:
        min_x, min_y, max_x, max_y = self.bounds
        x, y = point
        px = self.margin + (x - min_x) * self.scale
        py = self.margin + (max_y - y) * self.scale
        return (px, py)

    def canvas_size(self) -> tuple[int, int]:
        min_x, min_y, max_x, max_y = self.bounds
        width = int((max_x - min_x) * self.scale + self.margin * 2)
        height = int((max_y - min_y) * self.scale + self.margin * 2)
        return (width, height)

    def svg(self, path: Path):
        width, height = self.canvas_size()
        lines = [
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
            '<rect width="100%" height="100%" fill="#FAFAF7"/>',
        ]

        filled_polys = [poly for poly in self.polys if LAYER_STYLES[poly.layer]["fill"]]
        outline_polys = [poly for poly in self.polys if not LAYER_STYLES[poly.layer]["fill"]]

        for poly in filled_polys + outline_polys:
            style = LAYER_STYLES[poly.layer]
            points_str = " ".join(f"{self.to_px(point)[0]:.2f},{self.to_px(point)[1]:.2f}" for point in poly.points)
            fill = style["fill"] or "none"
            dash_attr = f' stroke-dasharray="{style["dash"]}"' if "dash" in style else ""
            tag = "polygon" if poly.closed else "polyline"
            lines.append(
                f'<{tag} points="{points_str}" fill="{fill}" stroke="{style["stroke"]}" '
                f'stroke-width="{style["stroke_width"]}"{dash_attr} />'
            )

        for text in self.texts:
            px, py = self.to_px((text.x, text.y))
            pixel_height = max(11, int(text.height * self.scale * 0.7))
            rotate = (
                f' transform="rotate({-text.rotation:.2f} {px:.2f} {py:.2f})"'
                if abs(text.rotation) > 0.01
                else ""
            )
            lines.append(
                f'<text x="{px:.2f}" y="{py:.2f}" font-family="Segoe UI, Arial, sans-serif" '
                f'font-size="{pixel_height}" text-anchor="middle" dominant-baseline="middle" '
                f'fill="{LAYER_STYLES[text.layer]["stroke"]}"{rotate}>{text.text}</text>'
            )

        lines.append("</svg>")
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    @staticmethod
    def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
        candidates = [
            Path("C:/Windows/Fonts/segoeui.ttf"),
            Path("C:/Windows/Fonts/arial.ttf"),
            Path("C:/Windows/Fonts/malgun.ttf"),
        ]
        for candidate in candidates:
            if candidate.exists():
                return ImageFont.truetype(str(candidate), size=size)
        return ImageFont.load_default()

    def png(self, path: Path):
        width, height = self.canvas_size()
        image = Image.new("RGB", (width, height), "#FAFAF7")
        draw = ImageDraw.Draw(image)

        filled_polys = [poly for poly in self.polys if LAYER_STYLES[poly.layer]["fill"]]
        outline_polys = [poly for poly in self.polys if not LAYER_STYLES[poly.layer]["fill"]]

        for poly in filled_polys + outline_polys:
            style = LAYER_STYLES[poly.layer]
            points = [self.to_px(point) for point in poly.points]
            if poly.closed:
                draw.polygon(points, outline=style["stroke"], fill=style["fill"])
                if style["stroke_width"] > 1:
                    points_cycle = points + [points[0]]
                    draw.line(points_cycle, fill=style["stroke"], width=style["stroke_width"])
            else:
                draw.line(points, fill=style["stroke"], width=style["stroke_width"])

        for text in self.texts:
            px, py = self.to_px((text.x, text.y))
            font_size = max(12, int(text.height * self.scale * 0.7))
            font = self.load_font(font_size)
            bbox = draw.textbbox((0, 0), text.text, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]

            if abs(text.rotation) > 0.01:
                temp = Image.new("RGBA", (text_width + 8, text_height + 8), (255, 255, 255, 0))
                temp_draw = ImageDraw.Draw(temp)
                temp_draw.text((4, 4), text.text, font=font, fill=LAYER_STYLES[text.layer]["stroke"])
                rotated = temp.rotate(text.rotation, expand=True, resample=Image.Resampling.BICUBIC)
                image.paste(rotated, (int(px - rotated.width / 2), int(py - rotated.height / 2)), rotated)
            else:
                draw.text(
                    (px - text_width / 2, py - text_height / 2),
                    text.text,
                    font=font,
                    fill=LAYER_STYLES[text.layer]["stroke"],
                )

        image.save(path)


def main():
    output_dir = Path(__file__).resolve().parent
    output_dir.mkdir(parents=True, exist_ok=True)

    cad = Eng1ReferenceCad(CONFIG_PATH, GEOJSON_PATH)
    polys, texts = cad.build_entities(level=1)

    dxf = DxfWriter()
    for poly in polys:
        dxf.add_lwpolyline(poly.points, poly.layer, poly.closed)
    for text in texts:
        dxf.add_text(text.text, text.x, text.y, text.height, text.layer, text.rotation)
    dxf.write(output_dir / f"{OUTPUT_BASENAME}.dxf")

    preview = PreviewWriter(polys, texts)
    preview.svg(output_dir / f"{OUTPUT_BASENAME}.svg")
    preview.png(output_dir / f"{OUTPUT_BASENAME}.png")

    print(f"Generated {OUTPUT_BASENAME}.dxf/.svg/.png in {output_dir}")


if __name__ == "__main__":
    main()
