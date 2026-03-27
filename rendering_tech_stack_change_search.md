# Replacing MapTalk.js for 60fps indoor navigation

**MapLibre GL JS combined with deck.gl is the strongest replacement stack** for a campus-scale indoor navigation system currently struggling with Plasma + MapTalk.js + Google Maps. MapTalk.js's architecture—Canvas 2D immediate-mode rendering, per-polygon draw calls, and double-pipeline overhead when overlaid on Google Maps—makes sustained 60fps nearly impossible for interactive floor plan rendering. A switch to a GPU-native WebGL2 pipeline with instanced rendering, geometry batching, and tile-based loading can resolve the problem entirely, with campus-scale floor plans (hundreds to low-thousands of polygons) well within the performance budget of modern alternatives.

---

## Why MapTalk.js fundamentally can't hold 60fps

MapTalk.js uses a **hybrid Canvas 2D + WebGL architecture** that creates several compounding bottlenecks. The default `VectorLayer` renders polygons through Canvas 2D's immediate-mode pipeline: every pan, zoom, or rotate frame triggers a full CPU-side redraw of all visible wall and door geometries via `beginPath()/moveTo()/lineTo()/fill()` calls. There is no GPU-retained geometry between frames, and performance scales linearly with polygon count.

When 3D extrusions are needed, the `maptalks.three` plugin creates **individual Three.js mesh objects per GeoJSON feature**—each wall segment, door, and room becomes a separate mesh generating its own WebGL draw call. A modest floor plan with 200 walls and 50 doors produces 250+ draw calls per frame, far exceeding the ~100 draw call target for stable 60fps. Neither the Canvas 2D path nor the Three.js plugin implements geometry batching or instanced rendering for repeated elements.

Overlaying MapTalk.js on Google Maps compounds these issues. The system runs **two independent rendering pipelines**—Google Maps renders tiles in one WebGL context while MapTalk.js renders floor plans in another—and both must complete within the 16.6ms frame budget. Camera synchronization between the two introduces at least one frame of latency, and each context maintains separate GPU state, preventing shared resources. GitHub Issue #845 documents that MapTalk.js uses **2.5x more memory than Leaflet** for equivalent datasets, with memory climbing continuously during panning and insufficient garbage collection, causing GC-induced frame drops.

The project's active migration to `maptalks-gl` (a pure WebGL/WebGPU engine built on regl) addresses some of these issues with shared WebGL contexts via `GroupGLLayer`, but this migration remains in active development as of v1.0.5 (March 2026) and is not yet production-ready. The community is small (~4,500 GitHub stars) and predominantly Chinese-speaking, limiting English and Korean documentation and support.

"Plasma" in this stack likely refers to an internal/proprietary middleware layer rather than a well-known open-source library—no established web mapping framework by that name was identified.

---

## The four strongest replacement architectures

### MapLibre GL JS: the open-source frontrunner

**MapLibre GL JS is purpose-built for this exact use case.** The open-source fork of Mapbox GL JS (BSD 3-Clause license) provides GPU-accelerated WebGL2 rendering targeting 60fps, with a native `fill-extrusion` layer type that renders 3D building polygons directly from GeoJSON sources. MapLibre publishes an official example titled "Extrude polygons for 3D indoor mapping" showing colored rooms with height-based extrusions—essentially a working prototype of the required feature.

Critically, **Mappedin—a global leader in indoor mapping** powering AT&T Stadium, LAX, and Amsterdam Airport Schiphol—sponsors MapLibre GL JS at $10K/year, a strong signal of the library's indoor mapping suitability. The rendering pipeline uses tiled vector rendering with internal batching, loads only features visible in the current viewport, and supports tilt, rotation, and smooth camera animations. For campus-scale data (hundreds of simple floor plan polygons), 60fps is trivially achievable on desktop hardware.

MapLibre's `CustomLayerInterface` allows injecting Three.js or raw WebGL directly into the map's GL context for any rendering needs beyond fill-extrusion. The library requires no API keys or usage fees—you supply your own tile source (free options include OSM tiles, PMTiles, or self-hosted MapTiler). Active development continues with v5.0 (December 2024, globe mode), Amazon/Meta/Microsoft sponsorship, and an experimental WebGPU backend.

### deck.gl: GPU-instanced rendering for data-heavy scenarios

deck.gl achieves exceptional performance through **WebGL2 instanced rendering as its core architecture**—each layer renders all data items as instances of a single geometry with a minimal number of GPU draw calls. On a 2015 MacBook Pro, basic layers maintain **60fps with up to ~1 million data items**. The `PolygonLayer` and `GeoJsonLayer` directly support extruded polygons with elevation, materials, and lighting—ideal for indoor floor plans.

The `@deck.gl/mapbox` module provides a `MapboxOverlay` that integrates with MapLibre GL JS in interleaved mode, rendering deck.gl layers directly within the map's WebGL2 context with proper z-ordering between deck.gl polygons and map features. This **MapLibre + deck.gl combination** is the recommended hybrid architecture: MapLibre handles the basemap, tile loading, and camera controls, while deck.gl handles the floor plan polygon rendering with GPU-accelerated performance.

deck.gl's binary data mode accepts pre-formatted typed arrays, bypassing CPU attribute generation entirely for maximum throughput. GPU-based "color picking" eliminates the need for CPU raycasting—each pickable object receives a unique color in an offscreen buffer, and pointer interactions resolve in constant time regardless of polygon count. The library is MIT-licensed, hosted by the OpenJS Foundation, and receives ~150K weekly npm downloads. v9 (March 2024) introduced WebGPU readiness and full TypeScript support.

### Three.js standalone: maximum control, maximum effort

For teams wanting **complete rendering pipeline control**, Three.js with map tiles as a ground plane texture offers unmatched flexibility. Libraries like `geo-three` handle tile loading from OSM, Bing, or MapTiler sources, while floor plan geometries render as `ExtrudeGeometry` meshes. Three.js can comfortably render millions of triangles at 60fps on modern hardware—campus-scale floor plans (~500–5,000 polygons, <100K triangles) are trivial.

The key technique is **geometry merging**: `BufferGeometryUtils.mergeGeometries()` combines all static floor plan elements into a single draw call, while `InstancedMesh` renders repeated elements (doors, desks) with one draw call for potentially 100,000+ instances. This approach reduces the MapTalk.js problem of 250+ draw calls to **under 10 draw calls** for an entire floor.

The tradeoff is significant implementation overhead. Pan/zoom/rotate map controls, lat/lng ↔ Mercator coordinate transformation, tile caching, labels, POI rendering, and navigation routing must all be built or sourced from third-party libraries. This path is best suited for teams that need highly custom rendering (shaders, animations, AR integration) and can invest the engineering effort. The `indoor3D` open-source library provides a starting point with 2D/3D modes, floor switching, and area selection built on Three.js.

### Google Maps WebGLOverlayView: the natural upgrade path

If the team prefers to remain within the Google Maps ecosystem, the `WebGLOverlayView` API provides **direct access to the same WebGL context** used by the Google Maps vector basemap. Unlike the current MapTalk.js overlay approach (separate canvases, dual pipelines), this shares a single GL context with Google's 3D building geometry, enabling depth occlusion and eliminating compositing overhead.

Google provides the `@googlemaps/three` npm package for Three.js integration, handling coordinate transformation via `latLngAltitudeToVector3`. For simple floor plan geometry, 60fps is easily achievable. The main drawbacks are **Google Maps Platform pricing** (~$200/month free credit, ~28,500 map loads) and vendor lock-in. This option makes most sense when Google Maps features (Street View, Places API, Directions API) are integral to the product.

---

## Performance benchmarks tell a clear story

A 2024 MDPI study comparing Leaflet, Mapbox GL JS, MapLibre GL JS, and OpenLayers across datasets from 50 to 500,000 features found that **WebGL-based libraries (Mapbox/MapLibre) dominate at high feature counts** while Canvas/SVG-based libraries (Leaflet) win at low counts due to lower initialization overhead. For campus-scale indoor mapping (~100–10,000 features), all WebGL libraries perform well, but Mapbox/MapLibre's tiled rendering architecture provides the best scaling headroom.

A 2025 arXiv study comparing CesiumJS against MapLibre GL JS + deck.gl for large-scale 3D building data found **MapLibre's MVT-based building visualization achieved optimal performance** with FCP of 0.8 seconds and TBT of 0ms, while CesiumJS excelled only for streaming massive 3D Tile datasets. Three.js benchmarks show that `InstancedMesh` scales from ~1,500 individual objects (without instancing) to **100,000+ objects at acceptable framerates** with instancing—a 67x improvement in object count from a single architectural change.

| Stack | Max features at 60fps | 3D extrusion | License | Cost |
|---|---|---|---|---|
| MapLibre GL JS | **50K+ polygons** (vector tiles) | Native fill-extrusion | BSD 3-Clause | Free |
| deck.gl | **~1M points**, ~100K polygons | PolygonLayer with elevation | MIT | Free |
| Three.js | **100K+ objects** (instanced) | ExtrudeGeometry | MIT | Free |
| Mapbox GL JS | 50K+ polygons | Native fill-extrusion | Proprietary | $$ after 50K loads/mo |
| MapTalk.js | ~10K (Canvas 2D bottleneck) | Via Three.js plugin | BSD 3-Clause | Free |

---

## Optimization techniques that guarantee 60fps

**Geometry batching is the single most impactful optimization.** Reducing draw calls from hundreds (one per polygon, as MapTalk.js does) to under 10 (merged static geometry) can transform performance from 20fps to a locked 60fps. In Three.js, `BufferGeometryUtils.mergeGeometries()` merges all walls into one mesh; in Mapbox/MapLibre, combining features into fewer layers with data-driven styling achieves the same result. For repeated elements like doors, `InstancedMesh` (Three.js) or deck.gl's native instancing renders thousands of copies in a single draw call.

**Vector tiles over raw GeoJSON** eliminate the most common performance trap in web mapping. Converting floor plan data to MVT format using Tippecanoe enables tile-based loading (only visible tiles fetched), automatic geometry simplification per zoom level, and viewport culling. MapLibre and Mapbox natively parse vector tiles on Web Worker threads, keeping the main thread free for interaction handling. One documented bottleneck: MapLibre's `GeoJSON.setData()` uses `JSON.stringify` on the main thread for worker serialization—for 200 LineStrings with 4,500 coordinates, this takes ~200ms. Vector tiles bypass this entirely.

**Level of Detail for floor plans** follows a natural hierarchy: building footprints at low zoom, room outlines at medium zoom, furniture and fixtures at high zoom. MapLibre's `minzoom`/`maxzoom` layer properties make this trivial to implement. For Three.js, creating separate `InstancedMesh` objects per detail level and swapping based on camera distance "almost doubled frame rate" according to one developer's benchmark.

**The dual-canvas pattern** addresses a fundamental limitation documented in MapLibre Issue #96: even MapLibre "can't achieve stable 60fps with a fullscreen map if the camera is animated"—the entire map re-renders when anything changes. The solution is one canvas for the basemap (updates only on camera moves) plus a separate canvas for animated overlays (updates at 60fps). This separation ensures floor plan interactions don't trigger full basemap redraws.

---

## Real-world indoor navigation systems and what they use

**MazeMap** (Norway) serves universities including Cambridge and NTNU with web-based campus wayfinding featuring 3D mapping, WiFi/BLE positioning, and space booking. **Mappedin** (Canada) powers indoor maps at LAX, Amsterdam Schiphol, and major shopping centers with a custom WebGL-based 3D rendering SDK supporting pan, zoom, and rotate interactions. Both are commercial platforms achieving smooth performance through purpose-built rendering engines.

In the open-source space, **indrz** (university indoor wayfinding) uses **MapLibre GL JS** with a Django/PostGIS backend—validating the MapLibre recommendation. **OpenIndoor** uses Mapbox GL JS for 3D indoor viewing with OSM indoor tagging. The **Anyplace** project from the University of Cyprus (MIT license) provides WiFi fingerprint-based indoor localization with 1.96m accuracy, deployed at 67+ buildings. Notable production deployments of the MapLibre ecosystem include Volkswagen's in-car navigation (maintaining 60fps while processing CAN-bus data) and the European Environment Agency's visualization of **1.2 million pollution sensor readings per frame**.

In Korea specifically, **Dabeeo (다비오)** is the dominant indoor mapping platform, powering Kakao Map's nationwide indoor map service with a JavaScript API (v3/v4) distributed via npm. Their IM Studio converts CAD/JPG/PNG floor plans into interactive indoor maps with navigation, POI management, and RESTful deployment. For a Korean campus project, Dabeeo's API could eliminate the need to build custom indoor rendering entirely—though at the cost of platform dependency. **Naver Maps API v3** also provides built-in indoor map viewing, and Korea's V-World government platform offers LoD3-4 3D building models for major urban areas.

KAIST's **KAILOS** system represents the most prominent Korean university indoor positioning research, using WiFi crowdsourced fingerprinting with 5m accuracy. It was first commercialized at COEX in 2010 and provides a web-based building/floor registration system.

---

## Concrete recommendation and migration path

The optimal architecture for this campus indoor navigation system is a **three-layer stack**:

- **MapLibre GL JS** as the basemap renderer — free, GPU-accelerated, native fill-extrusion for 3D floor plans, official indoor mapping examples, no API keys required. Use self-hosted PMTiles or free OSM tiles to eliminate ongoing costs entirely.
- **deck.gl PolygonLayer** (via `MapboxOverlay` in interleaved mode) for floor plan rendering when datasets grow large or when GPU picking and instanced rendering are needed. This provides a performance ceiling of ~1M features at 60fps.
- **Three.js via CustomLayerInterface** for any custom 3D elements beyond basic extrusions (furniture models, animated navigation arrows, first-person views).

For the Korean context, evaluate **Dabeeo Maps API** as a potential shortcut—if floor plans can be registered through their IM Studio platform, the entire indoor rendering problem is solved with a production-tested Korean solution. If custom rendering control is essential, the MapLibre + deck.gl stack provides the best balance of performance, flexibility, and zero cost.

The migration path from MapTalk.js is straightforward: replace `VectorLayer` polygons with MapLibre `fill-extrusion` layers consuming the same GeoJSON data, replace Google Maps tiles with MapLibre's vector tile basemap, and remove the dual-rendering pipeline entirely. Convert floor plan GeoJSON to vector tiles via Tippecanoe for optimal loading performance. This single change—from Canvas 2D immediate-mode to WebGL2 tiled vector rendering—addresses every identified bottleneck simultaneously.