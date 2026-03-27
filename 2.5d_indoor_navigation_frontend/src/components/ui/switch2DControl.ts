import { geoMap } from "../../main";
import * as Maptalks from "maptalks";
import { LEVEL_HEIGHT, OPACITY_TRANSLUCENT_LAYER } from "../../../public/strings/settings.json"
import BackendService from "../../services/backendService";

function setup(): void {
  document.getElementById("switch2D").onclick = () => {
    geoMap.flatMode = !geoMap.flatMode;

    if (geoMap.flatMode) {
      document.getElementById("switch2DLabel").innerHTML = "3d_rotation";
      geoMap.mapInstance.setOptions({
        dragRotate: false,
        dragPan: true,
        switchDragButton: false,
        zoomInCenter: false,
      });
      // Collapse all levels back to altitude 0 for 2D view
      const levels2D = BackendService.getAllLevels();
      const minLevel2D = levels2D[levels2D.length - 1];
      const currentLevel2D = geoMap.getCurrentLevel();

      levels2D.forEach(level => {
        const alt = (level - minLevel2D) * LEVEL_HEIGHT;
        const layer = geoMap.indoorLayers.get(level);

        if (level === currentLevel2D) {
          layer.animateAltitude(alt, 0, 1, 1, 0.5).then(() => layer.hide3D());
        } else if (level < currentLevel2D) {
          layer.animateAltitude(alt, 0, OPACITY_TRANSLUCENT_LAYER, 0, 0.5)
            .then(() => layer.hideAll());
        } else {
          // already hidden
        }
      });
      
      animate({
        centerStart: geoMap.mapInstance.getCenter(),
        centerEnd: geoMap.mapInstance.getCenter(),
        bearingStart: geoMap.mapInstance.getBearing(),
        bearingEnd: geoMap.standardBearing,
        pitchStart: geoMap.mapInstance.getPitch(),
        pitchEnd: 0,
        zoomStart: geoMap.mapInstance.getZoom(),
        // zoomEnd: document.getElementById("uiWrapper").classList.contains("wheelchairMode") ? geoMap.standardZoomWheelchairMode : geoMap.standardZoom
        zoomEnd: geoMap.standardZoom
      }, 0.5)
    } else {
      document.getElementById("switch2DLabel").innerHTML = "map";
      geoMap.mapInstance.setOptions({
        dragRotate: true,
        dragPitch: true,
        dragPan: true,
        switchDragButton: true,
        zoomInCenter: true,
      })

      // Show all levels at their real building heights, hide levels above current
      const levels = BackendService.getAllLevels(); // [5, 4, 3, 2, 1]
      const minLevel = levels[levels.length - 1];
      const currentLevel = geoMap.getCurrentLevel();

      levels.forEach(level => {
        const alt = (level - minLevel) * LEVEL_HEIGHT;
        const layer = geoMap.indoorLayers.get(level);

        if (level <= currentLevel) {
          layer.show3D();
          const opacity = level === currentLevel ? 1 : OPACITY_TRANSLUCENT_LAYER;
          layer.animateAltitude(0, alt, 0, opacity, 0.5);
        } else {
          layer.hideAll();
        }
      });

      animate({
        centerStart: geoMap.mapInstance.getCenter(),
        centerEnd: new Maptalks.Coordinate(geoMap.standardCenter as [number, number]),
        bearingStart: geoMap.mapInstance.getBearing(),
        bearingEnd: geoMap.standardBearing3DMode,
        pitchStart: geoMap.mapInstance.getPitch(),
        pitchEnd: geoMap.standardPitch3DMode,
        zoomStart: geoMap.mapInstance.getZoom(),
        zoomEnd: geoMap.standardZoom3DMode
      }, 0.5)
    }
  };
}

interface AnimationOptions {
  centerStart: Maptalks.Coordinate,
  centerEnd: Maptalks.Coordinate,
  bearingStart: number,
  bearingEnd: number,
  pitchStart: number,
  pitchEnd: number,
  zoomStart: number,
  zoomEnd: number
}

function animate(options: AnimationOptions, duration = 0.5): void {
  let startTime: number | null = null;
  const dir = ((options.bearingStart + 360) % 360) - ((options.bearingEnd + 360) % 360); // neg = clockwise, pos = counter-clockwise
  let bearingEnd = options.bearingEnd;
  if (dir < 0 && options.bearingStart > 0 && options.bearingEnd < 0) {
      bearingEnd = options.bearingEnd + 360;
  }
  if (dir > 0 && options.bearingStart < 0 && options.bearingEnd > 0) {
      bearingEnd = options.bearingEnd - 360;
  }

  function easeInOutCubic(x: number): number {
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }

  function animateStep(time: number) {
      if (!startTime) startTime = time;
      const elapsed = (time - startTime) / 1000; // convert to seconds
      const progress = Math.min(elapsed / duration, 1);

      const bearing = options.bearingStart + easeInOutCubic(progress) * (bearingEnd - options.bearingStart);
      const pitch = options.pitchStart + easeInOutCubic(progress) * (options.pitchEnd - options.pitchStart);
      const centerX = options.centerStart.x + easeInOutCubic(progress) * (options.centerEnd.x - options.centerStart.x);
      const centerY = options.centerStart.y + easeInOutCubic(progress) * (options.centerEnd.y - options.centerStart.y);
      const zoom = options.zoomStart + easeInOutCubic(progress) * (options.zoomEnd - options.zoomStart);

      geoMap.mapInstance.setBearing(bearing);
      geoMap.mapInstance.setPitch(pitch);
      geoMap.mapInstance.setCenterAndZoom(new Maptalks.Coordinate(centerX, centerY), zoom);

      if (progress < 1) {
          requestAnimationFrame(animateStep);
      } else {
          // Ensure the final state is set
          geoMap.mapInstance.setBearing(options.bearingEnd);
          geoMap.mapInstance.setPitch(options.pitchEnd);
          geoMap.mapInstance.setCenterAndZoom(options.centerEnd, options.zoomEnd);
      }
  }

  requestAnimationFrame(animateStep);
}


export default {
  setup,
};
