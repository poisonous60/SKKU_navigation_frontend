export function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getDistanceBetweenCoordinatesInM(pos1: GeoJSON.Position, pos2: GeoJSON.Position): number {
  return getDistanceFromLatLonInKm(pos1[1], pos1[0], pos2[1], pos2[0]) * 1000;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function lat2y(lat: number): number {
  return Math.log(Math.tan((lat / 90 + 1) * (Math.PI / 4))) * (180 / Math.PI);
}

export function y2lat(y: number): number {
  return (Math.atan(Math.exp(y / (180 / Math.PI))) / (Math.PI / 4) - 1) * 90;
}
