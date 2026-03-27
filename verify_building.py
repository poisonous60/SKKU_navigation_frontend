"""
건물 GeoJSON 검증 + 시각화
Usage: python verify_building.py buildings/eng1.json [--floor 1] [--overlay image.jpg]
"""

import json
import sys
import os
import math

def load_config(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_room_polygons(config, level):
    """Get all room polygons in local meter coordinates for a given level."""
    rooms = []
    for wing in config["wings"]:
        wid = wing["id"]
        if wing["orientation"] == "horizontal":
            u0, u1 = wing["u_range"]
            south = wing["rooms"].get("south", {})
            north = wing["rooms"].get("north", {})
            v_cs, v_cn = wing["corridor"]["v_range"]
            v_south = south.get("v_range", [wing["v_range"][0], v_cs])
            v_north = north.get("v_range", [v_cn, wing["v_range"][1]])

            n_s = south.get("count", 0)
            if n_s > 0:
                for i in range(n_s):
                    ul = u0 + i * (u1 - u0) / n_s
                    ur = u0 + (i + 1) * (u1 - u0) / n_s
                    rooms.append({
                        "ref": f"{wid}{level}{i+1:02d}",
                        "wing": wid,
                        "poly": [(ul, v_south[0]), (ur, v_south[0]), (ur, v_south[1]), (ul, v_south[1])],
                    })

            n_n = north.get("count", 0)
            if n_n > 0:
                for i in range(n_n):
                    ul = u0 + i * (u1 - u0) / n_n
                    ur = u0 + (i + 1) * (u1 - u0) / n_n
                    rooms.append({
                        "ref": f"{wid}{level}{i+1+n_s:02d}",
                        "wing": wid,
                        "poly": [(ul, v_north[0]), (ur, v_north[0]), (ur, v_north[1]), (ul, v_north[1])],
                    })

        elif wing["orientation"] == "vertical":
            v0, v1 = wing["v_range"]
            west = wing["rooms"].get("west", {})
            east = wing["rooms"].get("east", {})
            u_cw, u_ce = wing["corridor"]["u_range"]
            u_wr = west.get("u_range", [wing["u_range"][0], u_cw])
            u_er = east.get("u_range", [u_ce, wing["u_range"][1]])

            n_w = west.get("count", 0)
            if n_w > 0:
                for i in range(n_w):
                    vb = v0 + i * (v1 - v0) / n_w
                    vt = v0 + (i + 1) * (v1 - v0) / n_w
                    rooms.append({
                        "ref": f"{wid}{level}{i+1:02d}",
                        "wing": wid,
                        "poly": [(u_wr[0], vb), (u_wr[1], vb), (u_wr[1], vt), (u_wr[0], vt)],
                    })

            n_e = east.get("count", 0)
            if n_e > 0:
                for i in range(n_e):
                    vb = v0 + i * (v1 - v0) / n_e
                    vt = v0 + (i + 1) * (v1 - v0) / n_e
                    rooms.append({
                        "ref": f"{wid}{level}{i+1+n_w:02d}",
                        "wing": wid,
                        "poly": [(u_er[0], vb), (u_er[1], vb), (u_er[1], vt), (u_er[0], vt)],
                    })

    return rooms

def rect_overlap(r1, r2):
    """Check if two axis-aligned rectangles overlap (given as list of 4 corner tuples)."""
    def bounds(poly):
        us = [p[0] for p in poly]
        vs = [p[1] for p in poly]
        return min(us), min(vs), max(us), max(vs)

    a = bounds(r1)
    b = bounds(r2)
    eps = 0.01  # tolerance in meters

    if a[2] <= b[0] + eps or b[2] <= a[0] + eps:
        return False
    if a[3] <= b[1] + eps or b[3] <= a[1] + eps:
        return False
    return True

def check_overlaps(rooms):
    """Check for overlapping rooms."""
    overlaps = []
    for i in range(len(rooms)):
        for j in range(i + 1, len(rooms)):
            if rooms[i]["wing"] == rooms[j]["wing"]:
                continue  # same wing rooms don't overlap (grid-based)
            if rect_overlap(rooms[i]["poly"], rooms[j]["poly"]):
                overlaps.append((rooms[i]["ref"], rooms[j]["ref"]))
    return overlaps

def check_wing_overlaps(config):
    """Check if wing bounding boxes overlap."""
    overlaps = []
    wings = config["wings"]
    for i in range(len(wings)):
        for j in range(i + 1, len(wings)):
            w1 = wings[i]
            w2 = wings[j]
            # Get bounding box for each wing
            if w1["orientation"] == "horizontal":
                bb1 = (w1["u_range"][0], w1["v_range"][0], w1["u_range"][1], w1["v_range"][1])
            else:
                bb1 = (w1["u_range"][0], w1["v_range"][0], w1["u_range"][1], w1["v_range"][1])

            if w2["orientation"] == "horizontal":
                bb2 = (w2["u_range"][0], w2["v_range"][0], w2["u_range"][1], w2["v_range"][1])
            else:
                bb2 = (w2["u_range"][0], w2["v_range"][0], w2["u_range"][1], w2["v_range"][1])

            eps = 0.01
            if bb1[2] <= bb2[0] + eps or bb2[2] <= bb1[0] + eps:
                continue
            if bb1[3] <= bb2[1] + eps or bb2[3] <= bb1[1] + eps:
                continue
            overlaps.append((w1["id"], w2["id"], bb1, bb2))
    return overlaps

def visualize(config, level, output_path, overlay_path=None):
    """Render floor plan using matplotlib."""
    try:
        import matplotlib
        matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        import matplotlib.patches as patches
    except ImportError:
        print("matplotlib not installed. Run: pip install matplotlib")
        print("Skipping visualization, but overlap checks still run.")
        return

    fig, ax = plt.subplots(1, 1, figsize=(16, 12))

    wing_colors = {"21": "#8FB8D0", "22": "#81C784", "23": "#FFB74D"}

    rooms = get_room_polygons(config, level)

    # Draw rooms
    for room in rooms:
        poly = room["poly"]
        us = [p[0] for p in poly]
        vs = [p[1] for p in poly]
        color = wing_colors.get(room["wing"], "#CCCCCC")
        rect = patches.Rectangle(
            (min(us), min(vs)), max(us) - min(us), max(vs) - min(vs),
            linewidth=0.5, edgecolor='#555', facecolor=color, alpha=0.6
        )
        ax.add_patch(rect)
        cx = (min(us) + max(us)) / 2
        cy = (min(vs) + max(vs)) / 2
        ax.text(cx, cy, room["ref"], ha='center', va='center', fontsize=5, fontweight='bold')

    # Draw corridors
    for wing in config["wings"]:
        wid = wing["id"]
        if wing["orientation"] == "horizontal":
            u0, u1 = wing["u_range"]
            v_cs, v_cn = wing["corridor"]["v_range"]
            rect = patches.Rectangle(
                (u0, v_cs), u1 - u0, v_cn - v_cs,
                linewidth=0.5, edgecolor='#888', facecolor='#F5F5F0', alpha=0.4
            )
            ax.add_patch(rect)
        elif wing["orientation"] == "vertical":
            v0, v1 = wing["v_range"]
            u_cw, u_ce = wing["corridor"]["u_range"]
            rect = patches.Rectangle(
                (u_cw, v0), u_ce - u_cw, v1 - v0,
                linewidth=0.5, edgecolor='#888', facecolor='#F5F5F0', alpha=0.4
            )
            ax.add_patch(rect)

    # Draw connectors
    for conn in config.get("connectors", []):
        b = conn["bounds"]
        rect = patches.Rectangle(
            (b[0], b[1]), b[2] - b[0], b[3] - b[1],
            linewidth=1, edgecolor='#888', facecolor='#E8E8E0', alpha=0.5,
            linestyle='--'
        )
        ax.add_patch(rect)
        ax.text((b[0]+b[2])/2, (b[1]+b[3])/2, '통로', ha='center', va='center', fontsize=6, color='#666')

    # Draw protrusions
    for prot in config.get("protrusions", []):
        b = prot["bounds"]
        rect = patches.Rectangle(
            (b[0], b[1]), b[2] - b[0], b[3] - b[1],
            linewidth=1, edgecolor='#999', facecolor='#D0D0D0', alpha=0.4,
            linestyle=':'
        )
        ax.add_patch(rect)

    # Draw stairs
    for stair in config.get("stairs", []):
        b = stair["bounds"]
        rect = patches.Rectangle(
            (b[0], b[1]), b[2] - b[0], b[3] - b[1],
            linewidth=1, edgecolor='brown', facecolor='#A1887F', alpha=0.5
        )
        ax.add_patch(rect)
        ax.text((b[0]+b[2])/2, (b[1]+b[3])/2, stair["ref"], ha='center', va='center', fontsize=6, color='white')

    # Draw elevators
    for elev in config.get("elevators", []):
        b = elev["bounds"]
        rect = patches.Rectangle(
            (b[0], b[1]), b[2] - b[0], b[3] - b[1],
            linewidth=1, edgecolor='blue', facecolor='#42A5F5', alpha=0.5
        )
        ax.add_patch(rect)
        ax.text((b[0]+b[2])/2, (b[1]+b[3])/2, "EV", ha='center', va='center', fontsize=6, color='white')

    # Check and highlight overlaps
    overlaps = check_overlaps(rooms)
    if overlaps:
        for ref1, ref2 in overlaps:
            r1 = next(r for r in rooms if r["ref"] == ref1)
            r2 = next(r for r in rooms if r["ref"] == ref2)
            for r in [r1, r2]:
                us = [p[0] for p in r["poly"]]
                vs = [p[1] for p in r["poly"]]
                rect = patches.Rectangle(
                    (min(us), min(vs)), max(us) - min(us), max(vs) - min(vs),
                    linewidth=2, edgecolor='red', facecolor='red', alpha=0.3
                )
                ax.add_patch(rect)

    # Wing labels
    for wing in config["wings"]:
        if wing["orientation"] == "horizontal":
            cx = sum(wing["u_range"]) / 2
            cy = sum(wing["v_range"]) / 2
        else:
            cx = sum(wing["u_range"]) / 2
            cy = sum(wing["v_range"]) / 2
        ax.text(cx, cy, wing["name"], ha='center', va='center', fontsize=14, fontweight='bold', alpha=0.3)

    ax.set_aspect('equal')
    ax.set_xlabel('U (meters along building)')
    ax.set_ylabel('V (meters perpendicular)')
    ax.set_title(f'{config["name"]} — Level {level}')
    ax.grid(True, alpha=0.2)
    ax.autoscale()

    plt.tight_layout()
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else '.', exist_ok=True)
    plt.savefig(output_path, dpi=150, bbox_inches='tight')
    plt.close()
    print(f"Visualization saved: {output_path}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python verify_building.py <config.json> [--floor N] [--overlay image.jpg]")
        sys.exit(1)

    config_path = sys.argv[1]
    floor = 1
    overlay = None

    if "--floor" in sys.argv:
        floor = int(sys.argv[sys.argv.index("--floor") + 1])
    if "--overlay" in sys.argv:
        overlay = sys.argv[sys.argv.index("--overlay") + 1]

    config = load_config(config_path)
    name = os.path.splitext(os.path.basename(config_path))[0]

    print(f"=== Verifying {config['name']} (Level {floor}) ===\n")

    # 1. Wing overlap check
    wing_overlaps = check_wing_overlaps(config)
    if wing_overlaps:
        print(f"WARNING: {len(wing_overlaps)} wing overlap(s) detected:")
        for w1, w2, bb1, bb2 in wing_overlaps:
            print(f"  {w1}동 vs {w2}동")
            print(f"    {w1}: u=[{bb1[0]},{bb1[2]}] v=[{bb1[1]},{bb1[3]}]")
            print(f"    {w2}: u=[{bb2[0]},{bb2[2]}] v=[{bb2[1]},{bb2[3]}]")
    else:
        print("OK: No wing overlaps detected")

    # 2. Room overlap check
    rooms = get_room_polygons(config, floor)
    room_overlaps = check_overlaps(rooms)
    if room_overlaps:
        print(f"\nWARNING: {len(room_overlaps)} room overlap(s) detected:")
        for r1, r2 in room_overlaps:
            print(f"  {r1} overlaps with {r2}")
    else:
        print(f"OK: No room overlaps detected (level {floor}, {len(rooms)} rooms)")

    # 3. Room count summary
    print(f"\nRoom summary (level {floor}):")
    for wing in config["wings"]:
        wid = wing["id"]
        wing_rooms = [r for r in rooms if r["wing"] == wid]
        print(f"  {wing['name']}: {len(wing_rooms)} rooms")

    # 4. Visualize
    output_path = f"verify_output/{name}_L{floor}.png"
    visualize(config, floor, output_path, overlay)

    # Return exit code
    if wing_overlaps or room_overlaps:
        print(f"\nRESULT: FAIL — overlaps detected")
        return 1
    else:
        print(f"\nRESULT: PASS — no overlaps")
        return 0


if __name__ == "__main__":
    sys.exit(main())
