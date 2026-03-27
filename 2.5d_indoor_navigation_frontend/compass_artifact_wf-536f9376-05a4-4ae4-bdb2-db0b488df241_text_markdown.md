# The optimal tech stack for SKKU's 2.5D campus navigator

**React + FastAPI + PostGIS forms the ideal foundation** for a web-based 2.5D indoor navigation system with 360° video, giving a capstone team the best balance of capability, learning curve, and zero licensing cost. The stack leverages React Three Fiber for 2.5D map rendering, MapLibre GL JS for campus-level mapping, Python's networkx for A* pathfinding, and Photo Sphere Viewer for immersive 360° video playback — all open-source, well-documented, and proven in similar university wayfinding projects.

This report covers every layer of the system: frontend framework, backend API, spatial database, 2.5D map creation and rendering, pathfinding algorithms, 360° video processing pipeline, and playback libraries. Each recommendation accounts for the realities of a student team — limited budget, moderate experience, and a semester-length timeline.

---

## React with Three Fiber wins the frontend decision

**React 19 + TypeScript + Vite** is the strongest frontend choice, and the reason comes down to one library: **React Three Fiber (R3F)**. R3F is a mature React renderer for Three.js that lets the team build 2.5D indoor scenes declaratively with JSX. Its companion library `@react-three/drei` provides pre-built components for cameras, controls, model loaders, and interactions. No other frontend framework has an equivalent ecosystem for 3D web rendering.

Vue.js 3.5 offers a gentler learning curve and slightly better raw performance (Vapor Mode delivers **21% better memory efficiency**), but its Three.js integration through TresJS is far less mature, with fewer examples and a smaller community. Next.js blurs the frontend-backend boundary that this project specifically requires to be separated, and adds server-component complexity unnecessary for a client-heavy map SPA. Svelte's tiny ecosystem makes it risky when the team inevitably needs to solve niche 3D rendering problems.

The recommended frontend toolchain:

| Tool | Purpose | Version |
|------|---------|---------|
| React + TypeScript | UI framework | React 19 |
| Vite | Build tool with fast HMR | Latest |
| React Three Fiber | Declarative 3D rendering | @react-three/fiber@9 |
| @react-three/drei | 3D component helpers | Latest |
| MapLibre GL JS | Campus-level outdoor mapping | v4.x |
| react-map-gl | React wrapper for MapLibre | Latest |
| Zustand | Lightweight state management | Latest |
| React Router | Client-side routing | v7 |

MapLibre GL JS deserves special attention. It is the **BSD-licensed open-source fork of Mapbox GL JS** and requires no API key or usage fees — critical for a zero-budget capstone. It supports WebGL-powered vector tiles, `fill-extrusion` layers for 2.5D building visualization, and integrates with `react-three-map` to bridge MapLibre and R3F scenes for combined outdoor-to-indoor views.

---

## FastAPI and PostGIS power the spatial backend

**FastAPI** is the optimal backend framework because Python's algorithmic ecosystem directly solves the project's core challenge: graph-based pathfinding. The `networkx` library provides production-ready **A\*, Dijkstra, and shortest-path algorithms** out of the box, operating on graph structures that naturally model campus corridors and rooms. A pathfinding endpoint can be implemented in roughly 20 lines of Python.

FastAPI also auto-generates interactive Swagger documentation from type hints — invaluable when frontend and backend developers on the team need to coordinate API contracts. Pydantic v2 handles request validation with clear error messages. The development speed advantage over NestJS or Spring Boot is substantial: less boilerplate, faster iteration, and lower learning curve for students already familiar with Python.

NestJS would unify the language stack (TypeScript everywhere) but forces the team to implement A* from scratch or rely on less mature JavaScript graph libraries. Spring Boot is enterprise-grade overkill that would consume weeks of setup time better spent on features.

**PostgreSQL 17 with PostGIS 3.5** is the database layer. PostGIS is the gold standard for spatial data — it provides spatial indexing (R-tree/GiST), geometry types, and functions like `ST_Distance` and `ST_Contains` that enable queries such as "find the nearest restroom." A Utrecht University thesis comparing Neo4j-Spatial and PostGIS found PostGIS **"by far the more mature database with a lot of functionality, documentation and support."** In benchmarks, PostGIS processes **10,000 routing points in 6.5 seconds** versus MySQL's 58.9 seconds.

The optional `pgRouting` extension adds database-level pathfinding (`pgr_dijkstra`, `pgr_astar`), but the recommended approach for this project is simpler: load the navigation graph into memory on backend startup using networkx, and perform pathfinding in the application layer. Campus-scale graphs (hundreds to low thousands of nodes) fit trivially in memory, and this approach is easier to test and debug.

The backend stack:

| Tool | Purpose |
|------|---------|
| FastAPI + Uvicorn | ASGI web framework and server |
| Pydantic v2 | Data validation and serialization |
| networkx | Graph algorithms (A*, Dijkstra) |
| SQLAlchemy 2.0 + GeoAlchemy2 | ORM with PostGIS spatial support |
| asyncpg | Async PostgreSQL driver |
| Alembic | Database schema migrations |
| PostgreSQL 17 + PostGIS 3.5 | Spatial database |

---

## Building the 2.5D map from GeoJSON extrusion

The most efficient approach to 2.5D indoor maps is **procedural GeoJSON extrusion** — not hand-modeling every building in Blender. Define room and corridor boundaries as GeoJSON polygons with `height`, `base_height`, and `level` properties, then let MapLibre GL JS or Three.js extrude them into 2.5D shapes automatically. This is data-driven, easy to update, and scales well across buildings.

MapLibre's `fill-extrusion` layer type converts flat GeoJSON polygons into extruded 3D blocks with a few lines of configuration. Each room gets properties like floor level, room type, and color. For a stacked multi-floor visualization, offset each floor's `base_height` vertically. The `map-gl-indoor` plugin (works with both Mapbox GL and MapLibre) adds floor-switching UI controls and parses GeoJSON with `level` tags automatically.

For richer 3D elements — staircases, elevator shafts, key landmarks — optional **Blender models exported as glTF 2.0 (.glb)** can be overlaid via Three.js. Keep models under **100k–500k polygons total**, use Principled BSDF materials, and apply Draco compression via `gltf-transform` for smaller file sizes. Export each floor as a separate collection in Blender's scene hierarchy.

The spatial data architecture should use two complementary formats. **GeoJSON** stores visual map data — room polygons, floor outlines, furniture footprints — with properties for rendering. A **separate JSON navigation graph** stores pathfinding data — nodes at corridor intersections, room entrances, and stair/elevator locations, connected by weighted edges. This decoupling keeps the pathfinding graph lean and the visual data flexible.

A multi-floor navigation graph structure:

```json
{
  "nodes": [
    {"id": "F1_hall_01", "x": 100, "y": 200, "floor": 1, "type": "hallway"},
    {"id": "F1_stairs_A", "x": 300, "y": 100, "floor": 1, "type": "stairs"},
    {"id": "F2_stairs_A", "x": 300, "y": 100, "floor": 2, "type": "stairs"}
  ],
  "edges": [
    {"from": "F1_hall_01", "to": "F1_stairs_A", "weight": 12, "type": "walk"},
    {"from": "F1_stairs_A", "to": "F2_stairs_A", "weight": 15, "type": "stairs"}
  ]
}
```

Stairs add a weight penalty (~15 seconds per floor), elevators less (~10 seconds). The complete campus graph is the union of all floor sub-graphs connected by these vertical edges. For frontend pathfinding, **ngraph.path** (2.6k GitHub stars, MIT license) handles A* on arbitrary graph structures — not grid-limited like PathFinding.js — and supports custom heuristics that incorporate floor differences. For a campus with fewer than 10,000 navigation nodes, **frontend pathfinding delivers instant results** with no network round-trip and works offline.

Two open-source reference projects are especially valuable. **indrz** (github.com/indrz) is purpose-built for university campus wayfinding using Vue + Django + PostGIS + pgRouting + MapLibre GL, with production-ready routing, room search, and floor switching. **Accessible-InfoPoint/2.5D-Indoor-Maps** (MIT license) uses TypeScript + Maptalks + Three.js to render 2.5D multi-floor maps from OpenStreetMap data, with stair and elevator visualization — the closest existing open-source project to this capstone's goal.

---

## 360° video pipeline from Insta360 to browser

The 360° video workflow has three stages: recording and stitching, backend processing, and frontend playback. Each stage has a clear best tool.

**Recording**: The Insta360 X4 Air captures dual-fisheye video at up to 8K resolution. For this project, **4K (3840×1920) at 30fps with H.264 codec** is the sweet spot — sufficient quality for immersive viewing while keeping file sizes manageable for web delivery. Raw `.insv` files must be stitched into equirectangular projection using **Insta360 Studio** (free desktop app), which applies the proprietary stitching algorithm and FlowState stabilization. Batch export is supported. The output is standard equirectangular MP4 with XMP-GSpherical metadata.

**Backend processing**: **FFmpeg** handles all video manipulation — trimming segments, concatenating clips, re-encoding for web, and generating thumbnails. Key commands for the team:

- Trim: `ffmpeg -i input.mp4 -ss 00:00:10 -to 00:00:30 -c copy output.mp4`
- Concatenate: `ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4`
- Web-optimize: `ffmpeg -i input.mp4 -c:v libx264 -b:v 15M -pix_fmt yuv420p output.mp4`
- Extract flat thumbnail: `ffmpeg -i video.mp4 -vf "v360=e:flat:d_fov=90" -frames:v 1 thumb.jpg`

When re-encoding strips 360° metadata, Google's **Spatial Media Metadata Injector** (Python tool) re-injects the XMP-GSpherical tags. However, most web-based 360° viewers render equirectangular video onto a sphere regardless of metadata, so this matters mainly for YouTube uploads. OpenCV is unnecessary here — it lacks native 360° awareness and FFmpeg handles all needed operations.

**Frontend playback**: **Photo Sphere Viewer (PSV)** with its Video Plugin is the top recommendation. PSV is actively maintained (v5.13+, MIT license), weighs only **~50KB** for the core, and offers a dedicated video plugin with play/pause/seek controls. Its **Virtual Tour plugin** handles exactly the use case of linking panoramic scenes with navigation hotspots and configurable transition animations. The Markers plugin adds clickable navigation arrows and room labels overlaid on the 360° view. An official React wrapper (`react-photo-sphere-viewer`) is available.

A-Frame (Mozilla's WebXR framework, v1.7) is the strong alternative if VR headset support becomes a requirement. Its declarative HTML syntax (`<a-videosphere src="#video">`) makes it extremely easy to start, and it supports mixing 3D objects with 360° video. But at **~300KB** it is heavier than PSV, and its React integration is less native. Pannellum is the ultra-lightweight option at just **21KB** with built-in video support and virtual tour mode, though its mobile support and maintenance pace trail PSV. **Marzipano is disqualified** — it supports images only, not video. React 360 is archived and should not be used.

For storage, **15–30 second clips at 4K H.264 ~15Mbps produce files of ~28–56MB each**. A campus with 50 locations averaging 20-second clips totals roughly **1.9GB** — easily manageable. Progressive MP4 download works well for clips this short; HLS adaptive streaming is unnecessary complexity. Host on the university server if available (zero cost, low campus latency), or use **Cloudflare R2** (10GB free, zero egress fees) or **Backblaze B2** (10GB free) as backup options.

---

## Practical recording tips and data creation workflow

**GeoJSON floor plan creation is the most labor-intensive task** in the entire project — budget significant time for it. Use **geojson.io** (free browser-based editor) to trace room boundaries from architectural floor plans or satellite imagery. Alternatively, use JOSM (Java OpenStreetMap editor) if SKKU buildings are partially tagged in OpenStreetMap. Start with **2–3 buildings** as proof of concept before scaling to the full campus.

For 360° recording, maintain **at least 80cm distance** from walls and objects to avoid stitching artifacts along the seam line. Use the camera's auto mode with low-light stabilization for dim corridors. Avoid rotating the camera while walking — the stitching algorithm works best when the camera stays upright. Record systematically: one clip per room, one clip per hallway segment, with clear naming conventions (e.g., `eng_bldg_room301.insv`). At 4K@30fps the camera consumes **3–5GB per minute**, so carry spare SD cards.

---

## Complete recommended stack at a glance

| Layer | Technology | Why this choice |
|-------|-----------|----------------|
| Frontend framework | React 19 + TypeScript + Vite | Largest 3D/map ecosystem, React Three Fiber |
| 2.5D rendering | React Three Fiber + Three.js | Declarative 3D in React, mature |
| Map library | MapLibre GL JS (free) + react-map-gl | Open-source Mapbox fork, no API fees |
| Indoor floor plugin | map-gl-indoor | Floor switching, GeoJSON level parsing |
| State management | Zustand | Lightweight, TypeScript-friendly |
| 360° video viewer | Photo Sphere Viewer + Video Plugin | Active, lightweight, Virtual Tour plugin |
| Backend framework | FastAPI + Uvicorn | Auto-docs, Python algorithm ecosystem |
| Pathfinding engine | networkx (backend) or ngraph.path (frontend) | Production-ready A*, Dijkstra |
| Database | PostgreSQL 17 + PostGIS 3.5 | Gold-standard spatial DB, single DB for all data |
| ORM | SQLAlchemy 2.0 + GeoAlchemy2 | Mature PostGIS integration |
| Video processing | FFmpeg | Industry standard, all 360° operations |
| Video stitching | Insta360 Studio (free) | Best quality for Insta360 footage |
| Map data format | GeoJSON + custom navigation graph JSON | Universal, human-readable, all-library compatible |
| Deployment | Docker + Docker Compose | Containerized FE, BE, DB for easy setup |

**Total licensing cost: $0.** Every component is open-source or offers a sufficient free tier.

## Conclusion

The decisive architectural choices for this project are not the obvious ones (React and PostgreSQL are standard) but the specialized ones. **React Three Fiber** solves the 2.5D rendering challenge that would otherwise require low-level WebGL programming. **networkx on FastAPI** eliminates the need to implement pathfinding algorithms from scratch. **MapLibre GL JS** avoids the API key dependency and usage limits of Mapbox. **Photo Sphere Viewer's Virtual Tour plugin** provides the exact interaction model needed for location-linked 360° video — hotspots, transitions, and navigation arrows — without building a custom viewer.

The team should resist the temptation to model buildings in Blender first. Procedural GeoJSON extrusion delivers 80% of the visual impact with 20% of the effort. Start with a single building's floor plans as GeoJSON, get pathfinding working on that building's navigation graph, wire up 360° video for 5–10 rooms, and expand from there. The open-source **indrz** project (Django + PostGIS + MapLibre, built for university campuses) and **Accessible-InfoPoint/2.5D-Indoor-Maps** (TypeScript + Three.js, 2.5D multi-floor visualization) are the two most valuable reference codebases to study before writing any code.