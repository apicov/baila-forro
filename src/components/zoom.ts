/** The timeline's zoom levels (seconds on screen); a pinch snaps to them (the picture is drawn once per level). */
export const WINDOWS = [3, 6, 12, 24];

/** The level nearest to `sec` seconds, on a log scale. */
export const nearestWindow = (sec: number) =>
  WINDOWS.reduce((best, w) => (Math.abs(Math.log(w / sec)) < Math.abs(Math.log(best / sec)) ? w : best));
