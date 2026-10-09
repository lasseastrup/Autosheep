// Colour helpers: sRGB <-> linear <-> OKLab/OKLCH, used for palette matching and
// for deriving hue-shifted shading ramps (shadows lean blue/purple, lights lean warm).

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function linearToOklab([r, g, b]: RGB): RGB {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToLinear([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function srgbHexToOklab(hex: string): RGB {
  const [r, g, b] = hexToRgb(hex);
  return linearToOklab([srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]);
}

export function oklabToSrgbHex(lab: RGB): string {
  const [r, g, b] = oklabToLinear(lab);
  return rgbToHex([linearToSrgb(Math.max(0, r)), linearToSrgb(Math.max(0, g)), linearToSrgb(Math.max(0, b))]);
}

/** Shift a colour's lightness and pull its hue toward a target hue (radians) in OKLCH. */
export function shade(hex: string, dL: number, hueTarget: number, hueAmount: number, chromaScale = 1): string {
  const [L, a, b] = srgbHexToOklab(hex);
  let C = Math.hypot(a, b) * chromaScale;
  let h = Math.atan2(b, a);
  let d = hueTarget - h;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  h += d * hueAmount;
  if (C < 0.02) C = Math.max(C, 0.02 * hueAmount); // greys pick up a hint of tint
  return oklabToSrgbHex([Math.min(1, Math.max(0, L + dL)), C * Math.cos(h), C * Math.sin(h)]);
}
