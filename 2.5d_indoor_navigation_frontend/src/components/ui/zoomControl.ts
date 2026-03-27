import { geoMap } from "../../main";

function setup(): void {
  const zoomIn = document.getElementById("zoomControlIn");
  const zoomOut = document.getElementById("zoomControlOut");
  if (zoomIn) {
    zoomIn.onclick = () => {
      geoMap.mapInstance.setZoom(geoMap.mapInstance.getZoom() + 0.33);
    };
  }
  if (zoomOut) {
    zoomOut.onclick = () => {
      geoMap.mapInstance.setZoom(geoMap.mapInstance.getZoom() - 0.33);
    };
  }
}

export default {
  setup,
};
