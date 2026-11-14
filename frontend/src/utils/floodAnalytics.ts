/**
 * Real-time flood impact analysis derived deterministically from actual simulation frame tensors.
 * No fabricated metrics; strictly calculated from actual cell values.
 */

export interface FrameImpactAnalysis {
  maxDepthM: number;
  meanDepthM: number;
  floodedAreaKm2: number;
  moderateHazardKm2: number;
  severeHazardKm2: number;
  affectedBuildingsCount: number;
  totalVolumeM3: number;
  inundatedCellCount: number;
  hotspot: {
    row: number;
    col: number;
    depthM: number;
  } | null;
}

const INUNDATION_THRESHOLD_M = 0.03;
const MODERATE_HAZARD_M = 0.15;
const SEVERE_HAZARD_M = 0.60;

export function computeFrameImpact(
  frameH: number[][],
  buildingMask: number[][] | null,
  resolutionM = 10.0
): FrameImpactAnalysis {
  const height = frameH.length;
  const width = frameH[0]?.length ?? 0;

  if (height === 0 || width === 0) {
    return {
      maxDepthM: 0,
      meanDepthM: 0,
      floodedAreaKm2: 0,
      moderateHazardKm2: 0,
      severeHazardKm2: 0,
      affectedBuildingsCount: 0,
      totalVolumeM3: 0,
      inundatedCellCount: 0,
      hotspot: null,
    };
  }

  const cellAreaM2 = resolutionM * resolutionM;
  let maxDepthM = 0;
  let totalDepthSum = 0;
  let inundatedCellCount = 0;
  let moderateCellCount = 0;
  let severeCellCount = 0;
  let affectedBuildingsCount = 0;
  let totalVolumeM3 = 0;
  let hotspot: { row: number; col: number; depthM: number } | null = null;

  for (let r = 0; r < height; r++) {
    const rowH = frameH[r];
    const rowB = buildingMask?.[r];

    for (let c = 0; c < width; c++) {
      const h = Number(rowH?.[c] ?? 0);
      if (!Number.isFinite(h) || h <= 0) continue;

      if (h > maxDepthM) {
        maxDepthM = h;
        hotspot = { row: r, col: c, depthM: Math.round(h * 100) / 100 };
      }

      if (h >= INUNDATION_THRESHOLD_M) {
        inundatedCellCount++;
        totalDepthSum += h;
        totalVolumeM3 += h * cellAreaM2;

        if (h >= SEVERE_HAZARD_M) {
          severeCellCount++;
        } else if (h >= MODERATE_HAZARD_M) {
          moderateCellCount++;
        }

        // Check if building cell is inundated
        if ((rowB?.[c] ?? 0) > 0 && h >= MODERATE_HAZARD_M) {
          affectedBuildingsCount++;
        }
      }
    }
  }

  const meanDepthM = inundatedCellCount > 0 ? totalDepthSum / inundatedCellCount : 0;
  const floodedAreaKm2 = (inundatedCellCount * cellAreaM2) / 1_000_000.0;
  const moderateHazardKm2 = (moderateCellCount * cellAreaM2) / 1_000_000.0;
  const severeHazardKm2 = (severeCellCount * cellAreaM2) / 1_000_000.0;

  return {
    maxDepthM: Math.round(maxDepthM * 100) / 100,
    meanDepthM: Math.round(meanDepthM * 100) / 100,
    floodedAreaKm2: Math.round(floodedAreaKm2 * 100) / 100,
    moderateHazardKm2: Math.round(moderateHazardKm2 * 100) / 100,
    severeHazardKm2: Math.round(severeHazardKm2 * 100) / 100,
    affectedBuildingsCount,
    totalVolumeM3: Math.round(totalVolumeM3),
    inundatedCellCount,
    hotspot,
  };
}
