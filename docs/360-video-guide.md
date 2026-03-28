# 360° Video Naming Convention & Export Guide

## Overview

48 raw 360° videos (.insv) captured on 2026-03-28 for eng1 building (제1공학관).
Videos are **continuous recordings** — the route engine plays **segments** (`startTime` → `endTime`) of each video depending on the path.

- Corridor: room exit → play from the middle of a corridor video
- Staircase: 2F→4F → play a segment of the full 1F→5F staircase video
- Elevator: enter clip at departure floor + exit clip at arrival floor

---

## Naming Convention

### Pattern

```
eng1_{type}_{location}_{detail}.mp4
```

### Corridors (30 files)

`eng1_corridor_{wing}_{floor}F_{direction}.mp4`

| Parameter | Values                                       |
| --------- | -------------------------------------------- |
| wing      | `21`, `22`, `23`                             |
| floor     | `1F` ~ `5F`                                 |
| direction | `cw` (clockwise), `ccw` (counterclockwise)  |

```
eng1_corridor_21_1F_cw.mp4
eng1_corridor_21_1F_ccw.mp4
eng1_corridor_22_3F_cw.mp4
eng1_corridor_23_5F_ccw.mp4
```

### Staircases (8 files)

`eng1_stair_{id}_{direction}.mp4`

| Parameter | Values                          |
| --------- | ------------------------------- |
| id        | `1`, `2`, `3`, `4`             |
| direction | `up` (1F→5F), `down` (5F→1F)  |

```
eng1_stair_1_down.mp4     eng1_stair_1_up.mp4
eng1_stair_2_down.mp4     eng1_stair_2_up.mp4
eng1_stair_3_down.mp4     eng1_stair_3_up.mp4
eng1_stair_4_down.mp4     eng1_stair_4_up.mp4
```

### Elevators (10 files)

`eng1_elev_{id}_{floor}F.mp4`

| Parameter | Values       |
| --------- | ------------ |
| id        | `1`, `2`     |
| floor     | `1F` ~ `5F`  |

Each clip contains enter + exit at that floor as one continuous shot.

```
eng1_elev_1_1F.mp4    eng1_elev_2_1F.mp4
eng1_elev_1_2F.mp4    eng1_elev_2_2F.mp4
eng1_elev_1_3F.mp4    eng1_elev_2_3F.mp4
eng1_elev_1_4F.mp4    eng1_elev_2_4F.mp4
eng1_elev_1_5F.mp4    eng1_elev_2_5F.mp4
```

---

## Complete File List (48 files)

### Corridors (30)

```
eng1_corridor_21_1F_cw.mp4     eng1_corridor_21_1F_ccw.mp4
eng1_corridor_21_2F_cw.mp4     eng1_corridor_21_2F_ccw.mp4
eng1_corridor_21_3F_cw.mp4     eng1_corridor_21_3F_ccw.mp4
eng1_corridor_21_4F_cw.mp4     eng1_corridor_21_4F_ccw.mp4
eng1_corridor_21_5F_cw.mp4     eng1_corridor_21_5F_ccw.mp4
eng1_corridor_22_1F_cw.mp4     eng1_corridor_22_1F_ccw.mp4
eng1_corridor_22_2F_cw.mp4     eng1_corridor_22_2F_ccw.mp4
eng1_corridor_22_3F_cw.mp4     eng1_corridor_22_3F_ccw.mp4
eng1_corridor_22_4F_cw.mp4     eng1_corridor_22_4F_ccw.mp4
eng1_corridor_22_5F_cw.mp4     eng1_corridor_22_5F_ccw.mp4
eng1_corridor_23_1F_cw.mp4     eng1_corridor_23_1F_ccw.mp4
eng1_corridor_23_2F_cw.mp4     eng1_corridor_23_2F_ccw.mp4
eng1_corridor_23_3F_cw.mp4     eng1_corridor_23_3F_ccw.mp4
eng1_corridor_23_4F_cw.mp4     eng1_corridor_23_4F_ccw.mp4
eng1_corridor_23_5F_cw.mp4     eng1_corridor_23_5F_ccw.mp4
```

### Staircases (8)

```
eng1_stair_1_down.mp4     eng1_stair_1_up.mp4
eng1_stair_2_down.mp4     eng1_stair_2_up.mp4
eng1_stair_3_down.mp4     eng1_stair_3_up.mp4
eng1_stair_4_down.mp4     eng1_stair_4_up.mp4
```

### Elevators (10)

```
eng1_elev_1_1F.mp4    eng1_elev_2_1F.mp4
eng1_elev_1_2F.mp4    eng1_elev_2_2F.mp4
eng1_elev_1_3F.mp4    eng1_elev_2_3F.mp4
eng1_elev_1_4F.mp4    eng1_elev_2_4F.mp4
eng1_elev_1_5F.mp4    eng1_elev_2_5F.mp4
```

---

## Video Segment Mapping

### Concept

Each video is a continuous recording. The route engine plays **segments** of each video.
Each graph edge maps to a `(video, startTime, endTime)` tuple.

### Example Route

```
Route: Room 21301 → Staircase 2 → Room 22502

Edge 1: room exit      → corridor A         (no video)
Edge 2: corridor A     → corridor B         eng1_corridor_21_3F_cw.mp4  [12.5s ~ 28.0s]
Edge 3: corridor B     → stair 2 entrance   eng1_corridor_21_3F_cw.mp4  [28.0s ~ 35.2s]
Edge 4: stair entrance → stair exit 5F      eng1_stair_2_up.mp4         [24.0s ~ 48.0s]
Edge 5: stair exit     → corridor C         eng1_corridor_22_5F_ccw.mp4 [0.0s ~ 15.0s]
Edge 6: corridor C     → room 22502         eng1_corridor_22_5F_ccw.mp4 [15.0s ~ 22.3s]
```

### Data Structure: `video_segments.json`

```json
{
  "segments": {
    "eng1_corridor_21_3F_cw": {
      "video": "eng1_corridor_21_3F_cw.mp4",
      "totalDuration": 62.5,
      "markers": [
        { "nodeId": "node-21-3F-001", "time": 0.0,  "label": "Wing 21 3F start" },
        { "nodeId": "node-21-3F-002", "time": 12.5, "label": "Room 21301 door" },
        { "nodeId": "node-21-3F-003", "time": 28.0, "label": "Junction" },
        { "nodeId": "node-21-3F-004", "time": 35.2, "label": "Staircase 2 entrance" },
        { "nodeId": "node-21-3F-005", "time": 48.7, "label": "Room 21305 door" },
        { "nodeId": "node-21-3F-006", "time": 62.5, "label": "Wing 21 3F end" }
      ]
    },
    "eng1_stair_2_up": {
      "video": "eng1_stair_2_up.mp4",
      "totalDuration": 60.0,
      "markers": [
        { "floor": 1, "time": 0.0  },
        { "floor": 2, "time": 12.0 },
        { "floor": 3, "time": 24.0 },
        { "floor": 4, "time": 36.0 },
        { "floor": 5, "time": 48.0 }
      ]
    },
    "eng1_elev_1_3F": {
      "video": "eng1_elev_1_3F.mp4",
      "totalDuration": 8.0,
      "markers": [
        { "event": "enter", "time": 0.0 },
        { "event": "exit",  "time": 4.5 }
      ]
    }
  }
}
```

### RouteEdge Type

```typescript
interface RouteEdge {
  from: string;
  to: string;
  video: string;       // filename
  startTime: number;   // seek to this point (seconds)
  endTime: number;     // stop/transition here (seconds)
}
```

### Elevator Special Case

Route from 3F → 5F via elevator 1:

1. Play `eng1_elev_1_3F.mp4` — **enter portion only** (0.0s → 4.5s)
2. Floor transition animation (elevator moving)
3. Play `eng1_elev_1_5F.mp4` — **exit portion only** (4.5s → 8.0s)

---

## Export Settings

### Step 1: Insta360 Studio

| Setting       | Value                          |
| ------------- | ------------------------------ |
| Format        | MP4                            |
| Codec         | H.264                          |
| Resolution    | 3840 x 1920                    |
| Bitrate       | Default (30-40 Mbps)           |
| Frame Rate    | Keep original (30fps)          |
| Stabilization | FlowState ON                   |
| Audio         | OFF                            |

### Step 2: Web Compression (FFmpeg)

```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset medium -an output.mp4
```

| Flag              | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `-c:v libx264`    | H.264 codec (universal browser support)                |
| `-crf 23`         | Quality/size balance (18=high, 28=low)                 |
| `-preset medium`  | Encoding speed (`slow` for better compression)         |
| `-an`             | Strip audio                                            |

Expected output: ~5-15 MB per corridor, ~20-40 MB per staircase.

### Why H.264?

Three.js VideoTexture uses the `<video>` element internally.
H.264 is the only codec with universal browser support (Chrome, Firefox, Safari, Edge).
H.265 has no Firefox/Chrome support without hardware flags.

---

## Workflow: Creating the Segment Map

After exporting all 48 videos:

1. **Corridors** — Watch each video, note timestamps at every room door, junction, staircase entrance
2. **Staircases** — Note timestamp at each floor landing
3. **Elevators** — Note the midpoint between enter and exit

These timestamps populate `video_segments.json`, which the route engine uses to look up `(startTime, endTime)` for each graph edge.
