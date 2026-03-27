# ENG1 Reference CAD

Files in this folder were generated from the local meter grid in [eng1.json](/E:/260301/캡스톤프로젝트/buildings/eng1.json), the OSM outline in [eng1.geojson](/E:/260301/캡스톤프로젝트/2.5d_indoor_navigation_frontend/public/geojson/eng1.geojson), and the first-floor signboard photo in [제1공학관_1.jpg](/E:/260301/캡스톤프로젝트/reference/제1공학관_1.jpg).

- `eng1_level1_reference.dxf`: AutoCAD-compatible schematic reference drawing.
- `eng1_level1_reference.svg`: vector preview of the same drawing.
- `eng1_level1_reference.png`: raster preview for quick inspection.
- `export_eng1_reference_cad.py`: regeneration script.

Notes:

- Units are meters.
- Origin is the south-west corner of the main body of Wing 21.
- `SITE_OUTLINE` uses the OSM footprint.
- Interior rooms/corridors are schematic blocks from the project config, not surveyed wall-by-wall CAD.
- `ROOM_LABELS` follow the generated project room refs. Some official room labels on the signboard differ and should be field-checked before final delivery.

Regenerate with:

```powershell
python cad/export_eng1_reference_cad.py
```
