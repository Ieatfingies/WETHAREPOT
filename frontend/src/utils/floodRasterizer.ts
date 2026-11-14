const INUNDATION_CUTOFF_M = 0.02;
const MODERATE_HAZARD_M = 0.30;
const SEVERE_HAZARD_M = 0.75;

export function renderFloodFrameToDataUrl(
  depthGrid: number[][],
  buildingMask: number[][]
): string {
  const height = depthGrid.length;
  const width = depthGrid[0]?.length ?? 0;
  if (height === 0 || width === 0) return "";

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    const rowH = depthGrid[y];
    const rowB = buildingMask[y];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isBuilding = (rowB?.[x] ?? 0) > 0;
      const h = rowH?.[x] ?? 0;

      if (isBuilding) {
        data[idx] = 42;
        data[idx + 1] = 52;
        data[idx + 2] = 70;
        data[idx + 3] = 140;
        continue;
      }

      if (h < INUNDATION_CUTOFF_M) {
        data[idx + 3] = 0;
        continue;
      }

      if (h < MODERATE_HAZARD_M) {
        const t = (h - INUNDATION_CUTOFF_M) / (MODERATE_HAZARD_M - INUNDATION_CUTOFF_M);
        data[idx] = Math.round(92 * (1 - t) + 56 * t);
        data[idx + 1] = Math.round(198 * (1 - t) + 178 * t);
        data[idx + 2] = 242;
        data[idx + 3] = Math.round(135 + 65 * t);
      } else if (h < SEVERE_HAZARD_M) {
        const t = (h - MODERATE_HAZARD_M) / (SEVERE_HAZARD_M - MODERATE_HAZARD_M);
        data[idx] = Math.round(56 * (1 - t) + 235 * t);
        data[idx + 1] = Math.round(178 * (1 - t) + 168 * t);
        data[idx + 2] = Math.round(242 * (1 - t) + 64 * t);
        data[idx + 3] = 215;
      } else {
        data[idx] = 228;
        data[idx + 1] = 88;
        data[idx + 2] = 88;
        data[idx + 3] = 235;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}