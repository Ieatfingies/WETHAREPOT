/**
 * Solar Astronomical Calculator for Bengaluru (12.9716° N, 77.5946° E)
 * Computes exact solar elevation angle, solar azimuth, and lighting color temperatures
 * for day/night cycles and historical time travel.
 */

export interface SolarState {
  elevationDeg: number;
  azimuthDeg: number;
  phase: "dawn" | "day" | "golden_hour" | "twilight" | "night";
  sunDirection: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  ambientColor: number;
  ambientIntensity: number;
  fogColor: number;
  backgroundColor: number;
  isNight: boolean;
}

const BENGALURU_LAT_RAD = (12.9716 * Math.PI) / 180;
const BENGALURU_LON_DEG = 77.5946;

/**
 * Calculates solar position for Bengaluru given a date and hour of day (0.00 - 24.00)
 */
export function calculateSolarState(
  date: Date = new Date(),
  hourOfDay: number = 12.0
): SolarState {
  // Day of year
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;

  // Fractional year (radians)
  const gamma = (2 * Math.PI * (dayOfYear - 1 + (hourOfDay - 12) / 24)) / 365;

  // Equation of time in minutes
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // Solar declination angle (radians)
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  // Time offset in minutes (Indian Standard Time is UTC+5:30 = 82.5° E)
  const istMeridian = 82.5;
  const timeOffset = eqtime + 4 * (BENGALURU_LON_DEG - istMeridian);

  // True solar time in minutes
  const trueSolarTimeMin = hourOfDay * 60 + timeOffset;
  const hourAngleDeg = (trueSolarTimeMin / 4) - 180;
  const hourAngleRad = (hourAngleDeg * Math.PI) / 180;

  // Solar Zenith Angle (radians)
  const cosZenith =
    Math.sin(BENGALURU_LAT_RAD) * Math.sin(decl) +
    Math.cos(BENGALURU_LAT_RAD) * Math.cos(decl) * Math.cos(hourAngleRad);

  const zenithRad = Math.acos(Math.max(-1, Math.min(1, cosZenith)));
  const elevationRad = Math.PI / 2 - zenithRad;
  const elevationDeg = (elevationRad * 180) / Math.PI;

  // Solar Azimuth Angle (clockwise from North, in radians)
  const cosAzimuth =
    (Math.sin(decl) - Math.sin(BENGALURU_LAT_RAD) * Math.sin(elevationRad)) /
    (Math.cos(BENGALURU_LAT_RAD) * Math.cos(elevationRad));

  let azimuthRad = Math.acos(Math.max(-1, Math.min(1, cosAzimuth)));
  if (hourAngleRad > 0) {
    azimuthRad = 2 * Math.PI - azimuthRad;
  }
  const azimuthDeg = (azimuthRad * 180) / Math.PI;

  // Convert to 3D Cartesian coordinates (Three.js: Y=up, X=east, Z=south)
  const distance = 300;
  const sunX = distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
  const sunY = Math.max(-80, distance * Math.sin(elevationRad));
  const sunZ = -distance * Math.cos(elevationRad) * Math.cos(azimuthRad);

  // Determine lighting phase and colors
  let phase: "dawn" | "day" | "golden_hour" | "twilight" | "night";
  let sunColor = 0xfffaea;
  let sunIntensity = 1.6;
  let ambientColor = 0x989080;
  let ambientIntensity = 1.1;
  let fogColor = 0xece6dc;
  let backgroundColor = 0xece6dc;
  let isNight = false;

  if (elevationDeg > 18) {
    // Broad daylight
    phase = "day";
    sunColor = 0xfffae5;
    sunIntensity = 1.7;
    ambientColor = 0x9ea298;
    ambientIntensity = 1.1;
    fogColor = 0xe6dfd3;
    backgroundColor = 0xe6dfd3;
  } else if (elevationDeg > 3) {
    // Golden Hour (Warm ochre & long shadows)
    phase = "golden_hour";
    sunColor = 0xf59842; // Deep warm amber
    sunIntensity = 1.8;
    ambientColor = 0xbaa48e;
    ambientIntensity = 0.95;
    fogColor = 0xd9c2a7;
    backgroundColor = 0xd9c2a7;
  } else if (elevationDeg > -6) {
    // Civil Twilight / Dawn
    phase = hourOfDay < 12 ? "dawn" : "twilight";
    sunColor = 0xc46951; // Terracotta dusk
    sunIntensity = 0.7;
    ambientColor = 0x5a5666; // Slate twilight
    ambientIntensity = 0.75;
    fogColor = 0x484252;
    backgroundColor = 0x484252;
  } else {
    // Night (Moonlit indigo & deep ink)
    phase = "night";
    isNight = true;
    sunColor = 0x7b96b2; // Cool moonlight
    sunIntensity = 0.45;
    ambientColor = 0x22262d; // Deep obsidian ambient
    ambientIntensity = 0.65;
    fogColor = 0x14171c;
    backgroundColor = 0x14171c;
  }

  return {
    elevationDeg: Math.round(elevationDeg * 10) / 10,
    azimuthDeg: Math.round(azimuthDeg * 10) / 10,
    phase,
    sunDirection: [sunX, Math.max(15, sunY), sunZ],
    sunColor,
    sunIntensity,
    ambientColor,
    ambientIntensity,
    fogColor,
    backgroundColor,
    isNight,
  };
}
