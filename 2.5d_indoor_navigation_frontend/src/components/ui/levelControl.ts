import LevelService from "../../services/levelService";
import { geoMap } from "../../main";

let allLevelNames: string[] = [];

function handleLoad(): void {
  allLevelNames = LevelService.getLevelNames();
}

function focusOnLevel(_selectedLevel: number): void {
  // Floor wheel handles this now
}

function setupControlShifter(): void {
  // Legacy sidebar removed — floor wheel handles level changes
}

function setWindow(): void {
  // No-op — legacy sidebar removed
}

function scrollToCurrentLevel(): void {
  // No-op — legacy sidebar removed
}

export default {
  handleChange: handleLoad,
  focusOnLevel,
  setupControlShifter,
  setMargin: scrollToCurrentLevel,
  setWindow,
};
