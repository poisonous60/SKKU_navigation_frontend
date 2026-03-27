import {
  CARTO_TILE_SERVER,
  CARTO_TILE_SUBDOMAINS,
  CARTO_ATTRIBUTION,
} from "../../public/strings/constants.json";
import {
  INDOOR_LEVEL,
  MAP_START_LAT,
  MAP_START_LNG,
  LEVEL_HEIGHT,
  OPACITY_TRANSLUCENT_LAYER,
} from "../../public/strings/settings.json";
import LevelControl from "./ui/levelControl";
import DescriptionArea from "./ui/descriptionArea";
import BuildingService from "../services/buildingService";
import LoadingIndicator from "./ui/loadingIndicator";
import { IndoorLayer } from "./indoorLayer";
import AccessibilityService from "../services/accessibilityService";
import LevelService from "../services/levelService";
import ColorService from "../services/colorService";
import { lang } from "../services/languageService";
import FeatureService from "../services/featureService";
import * as Maptalks from "maptalks";
import BackendService from "../services/backendService";
import RouteService from "../services/routeService";

export class GeoMap {
  mapInstance: Maptalks.Map = null;
  flatMapInstance: Maptalks.Map = null;
  currentLevel = INDOOR_LEVEL;
  indoorLayers: Map<number, IndoorLayer>;
  selectedFeatures: string[] = [];
  flatMode = true;
  standardCenter = [parseFloat(MAP_START_LNG), parseFloat(MAP_START_LAT)];
  standardBearing = 0;
  standardZoom = 0;
  maxZoom = 0;
  minZoom = 0;
  standardZoom3DMode = 0;
  standardPitch3DMode = 0;
  standardBearing3DMode = 0;
  infoPoint: GeoJSON.Feature;
  infoPointLevel = INDOOR_LEVEL;
  configMode = false; // set only during configuration of building constants

  constructor() {
    const buildingConstants = BackendService.getBuildingConstants();
    this.standardZoom = buildingConstants["standardZoom"];
    this.maxZoom = buildingConstants["maxZoom"];
    this.minZoom = buildingConstants["minZoom"];
    this.standardBearing = buildingConstants["standardBearing"];
    this.standardBearing3DMode = buildingConstants["standardBearing3DMode"];
    this.standardPitch3DMode = buildingConstants["standardPitch3DMode"];
    this.standardZoom3DMode = buildingConstants["standardZoom3DMode"];

    // default infoPoint location is on default level (in case no explicit infoPoint is set)
    this.infoPoint = {
      "properties": {
        "level": INDOOR_LEVEL
      },
      "type": "Feature",
      "geometry": null
    };

    this.mapInstance = new Maptalks.Map("map", {
      center: [parseFloat(MAP_START_LNG), parseFloat(MAP_START_LAT)],
      zoom: this.standardZoom,
      maxZoom: this.configMode ? null : this.maxZoom,
      minZoom: this.configMode ? null : this.minZoom,
      dragRotate: true,
      dragPitch: this.configMode,
      baseLayer: new Maptalks.TileLayer("carto", {
        urlTemplate: CARTO_TILE_SERVER,
        subdomains: CARTO_TILE_SUBDOMAINS,
        attribution: CARTO_ATTRIBUTION,
      }),
    });

    this.flatMapInstance = new Maptalks.Map("flatMap", {
      center: [parseFloat(MAP_START_LNG), parseFloat(MAP_START_LAT)],
      zoom: this.standardZoom,
      maxZoom: this.maxZoom,
      minZoom: this.minZoom,
      baseLayer: new Maptalks.TileLayer("carto", {
        urlTemplate: CARTO_TILE_SERVER,
        subdomains: CARTO_TILE_SUBDOMAINS,
        attribution: CARTO_ATTRIBUTION,
      }),
    });

    this.mapInstance.on("moving moveend", () => {
      this.flatMapInstance.setCenter(this.mapInstance.getCenter());
    });

    this.mapInstance.on("zooming zoomend", () => {
      if (this.configMode)
        console.log("zoom", this.mapInstance.getZoom());
      this.flatMapInstance.setCenterAndZoom(
        this.mapInstance.getCenter(),
        this.mapInstance.getZoom()
      );
    });

    this.mapInstance.on("zooming zoomend", () => {
      if (this.indoorLayers) {
        const size = IndoorLayer.interpolateStops(this.mapInstance.getZoom());
        this.indoorLayers.forEach((layer) => layer.updateRoomNumberSize(size));
      }
    });

    this.mapInstance.on("rotate", () => {
      if (this.configMode)
        console.log("bearing", this.mapInstance.getBearing());
      this.flatMapInstance.setBearing(this.mapInstance.getBearing());
    });

    this.mapInstance.on("pitch", () => {
      if (this.configMode)
        console.log("pitch", this.mapInstance.getPitch());
    });

    this.applyStyleFilters();
  }

  add(obj: Maptalks.Layer): Maptalks.Layer {
    return obj.addTo(this.mapInstance);
  }

  remove(obj: Maptalks.Layer): void {
    this.mapInstance.removeLayer(obj);
  }

  showBuilding(): string {
    this.handleBuildingLoad();
    this.centerMapToBuilding();

    return lang.searchBuildingFound;
  }

  handleBuildingLoad(): void {
    LevelControl.handleChange();
    LevelService.clearData();

    this.mapInstance.setBearing(this.standardBearing);

    this.indoorLayers = new Map(
      BackendService.getAllLevels()
        .reverse()
        .map((val) => [
          val,
          new IndoorLayer(LevelService.getLevelGeoJSON(val), val, 0),
        ])
    );
    this.indoorLayers.forEach((layer) => {
      layer.hideAll();
    });

    const levels = BackendService.getAllLevels();
    const startLevel = levels.includes(INDOOR_LEVEL) ? INDOOR_LEVEL : levels[levels.length - 1];
    this.currentLevel = startLevel;
    this.handleLevelChange(startLevel);

    AccessibilityService.reset();

    const message = BuildingService.getBuildingDescription();
    DescriptionArea.update(message, "selectedBuilding");
  }

  centerMapToBuilding(): void {
    const ext = BackendService.getBoundingBoxExtent();

    this.standardCenter = [ext.getCenter().x, ext.getCenter().y];

    this.mapInstance.animateTo(
      { center: ext.getCenter() },
      { duration: 350 }
    );
    setTimeout(() => {
      this.mapInstance.animateTo(
        {
          zoom: this.standardZoom
        },
        { duration: 350 }
      );
    }, 350);
    setTimeout(() => {
      // this.indoorLayer.animateAltitude(10, 0, 0, 0.25, 0.5)
      console.log(this.mapInstance.getCenter(), this.mapInstance.getZoom());
    }, 1000);
  }

  handleLevelChange(newLevel: number): void {
    const animationDuration = 1;

    if (this.flatMode) {
      this.indoorLayers.get(this.currentLevel).hideAll();
      this.currentLevel = newLevel;
      this.indoorLayers.get(this.currentLevel).hide3D();
    } else {
      if (newLevel == this.currentLevel) {
        return;
      }

      // Each level sits at its real building height, levels above selected are hidden
      const levels = BackendService.getAllLevels(); // [5, 4, 3, 2, 1]
      const minLevel = levels[levels.length - 1];
      const dur = 0.5;

      levels.forEach(level => {
        const alt = (level - minLevel) * LEVEL_HEIGHT;
        const layer = this.indoorLayers.get(level);

        if (level <= newLevel) {
          layer.show3D();
          const targetOpacity = level === newLevel ? 1 : OPACITY_TRANSLUCENT_LAYER;
          layer.animateAltitude(alt, alt, targetOpacity, targetOpacity, dur);
        } else if (level <= this.currentLevel) {
          // Only fade out layers that were previously visible
          layer.animateAltitude(alt, alt, level === this.currentLevel ? 1 : OPACITY_TRANSLUCENT_LAYER, 0, dur)
            .then(() => layer.hideAll());
        }
        // Layers already hidden stay hidden
      });

      this.currentLevel = newLevel;
    }

    const message = LevelService.getCurrentLevelDescription();
    DescriptionArea.update(message);

    // Update header building info with current level
    const descEl = document.getElementById('description');
    if (descEl) descEl.textContent = `${this.currentLevel}F`;

    // Update route opacity for the new active level
    RouteService.updateRouteOpacityForLevel(this.currentLevel);

    // Sync floor dropdown
    const floorSelect = document.getElementById('floorSelect') as HTMLSelectElement;
    if (floorSelect) floorSelect.value = this.currentLevel.toString();
  }

  // only support whole level differences
  getLevelDifference(level1: number, level2: number): number {
    return (
      BackendService.getAllLevels().indexOf(level1) -
      BackendService.getAllLevels().indexOf(level2)
    );
  }

  getCurrentLevel(): number {
    return this.currentLevel;
  }

  handleIndoorSearch(searchString: string): void {
    if (searchString) {
      const results = BuildingService.runIndoorSearch(searchString);
      if (results.length != 0) {
        this.selectedFeatures = results.map((feature) => feature.id.toString());
        this.indoorLayers.forEach((layer) => layer.updateLayer());

        // from the levels of the feature, select the nearest to the current level
        const selectedLevel = (results[0].properties.level as number[]).sort((a, b) => Math.abs(a - this.currentLevel) - Math.abs(b - this.currentLevel))[0];
        LevelControl.focusOnLevel(selectedLevel);
        this.handleLevelChange(selectedLevel);

        const feature = results[0];
        const accessibilityDescription =
          FeatureService.getAccessibilityDescription(feature);
        DescriptionArea.update(accessibilityDescription);
      } else LoadingIndicator.error(lang.searchNotFound);
    } else LoadingIndicator.error(lang.searchEmpty);
  }

  applyStyleFilters = (): void => {
    this.mapInstance.getBaseLayer().setOpacity(ColorService.getEnvOpacity() / 100);
    document.getElementById("map").style.filter = `saturate(${
      (ColorService.getColorStrength() * 2) / 100
    })`;

    //wall weight rendered per feature -> feature service
  };
}
