/**
 * Palettes. Every frame of the game is snapped to one of these in the pixel pass, so
 * art is authored by choosing palette colours (material colours below are palette entries).
 */

// ENDESGA 32 by Endesga (lospec.com/palette-list/endesga-32)
export const ENDESGA32 = [
  '#be4a2f', '#d77643', '#ead4aa', '#e4a672', '#b86f50', '#733e39', '#3e2731', '#a22633',
  '#e43b44', '#f77622', '#feae34', '#fee761', '#63c74d', '#3e8948', '#265c42', '#193c3e',
  '#124e89', '#0099db', '#2ce8f5', '#ffffff', '#c0cbdc', '#8b9bb4', '#5a6988', '#3a4466',
  '#262b44', '#181425', '#ff0044', '#68386c', '#b55088', '#f6757a', '#e8b796', '#c28569',
];

/** Green phosphor scanner. */
export const SCANNER = ['#06140c', '#0c3020', '#17603a', '#2f9e4f', '#6fe07a', '#d4ffc2'];

/** Cyan hologram. */
export const HOLOGRAM = ['#030c14', '#0a2a3d', '#0f5875', '#1a96b8', '#2ce8f5', '#c6fbff'];

// RESURRECT 64 by Kerrie Lake (lospec.com/palette-list/resurrect-64), in ramp order,
// plus one extra "true black" for deep space.
export const RESURRECT64 = [
  '#2e222f', '#3e3546', '#625565', '#966c6c', '#ab947a', '#694f62', '#7f708a', '#9babb2', '#c7dcd0', '#ffffff',
  '#6e2727', '#b33831', '#ea4f36', '#f57d4a', '#ae2334', '#e83b3b', '#fb6b1d', '#f79617', '#f9c22b',
  '#7a3045', '#9e4539', '#cd683d', '#e6904e', '#fbb954',
  '#4c3e24', '#676633', '#a2a947', '#d5e04b', '#fbff86',
  '#165a4c', '#239063', '#1ebc73', '#91db69', '#cddf6c',
  '#313638', '#374e4a', '#547e64', '#92a984', '#b2ba90',
  '#0b5e65', '#0b8a8f', '#0eaf9b', '#30e1b9', '#8ff8e2',
  '#323353', '#484a77', '#4d65b4', '#4d9be6', '#8fd3ff',
  '#45293f', '#6b3e75', '#905ea9', '#a884f3', '#eaaded',
  '#753c54', '#a24b6f', '#cf657f', '#ed8099',
  '#831c5d', '#c32454', '#f04f78', '#f68181', '#fca790', '#fdcbb0',
  '#18141a',
];

/** Named Resurrect 64 entries used by the art code. */
export const C = {
  // greys (warm -> cool) and wool
  ink: '#2e222f', coal: '#3e3546', stone: '#625565', clay: '#966c6c', khaki: '#ab947a',
  mauve: '#694f62', lilac: '#7f708a', fog: '#9babb2', mist: '#c7dcd0', white: '#ffffff', black: '#18141a',
  // reds / oranges / yellows
  blood: '#6e2727', brick: '#b33831', red: '#ea4f36', salmon: '#f57d4a',
  crimson: '#ae2334', scarlet: '#e83b3b', orange: '#fb6b1d', amber: '#f79617', gold: '#f9c22b',
  // wood / brick
  wine: '#7a3045', rust: '#9e4539', terracotta: '#cd683d', tan: '#e6904e', straw: '#fbb954',
  // olive
  mud: '#4c3e24', olive: '#676633', moss: '#a2a947', lime: '#d5e04b', lemon: '#fbff86',
  // grass
  pine: '#165a4c', grass: '#239063', leaf: '#1ebc73', meadow: '#91db69', hay: '#cddf6c',
  // grey-greens
  slate: '#313638', swamp: '#374e4a', sage: '#547e64', sageLight: '#92a984', bone: '#b2ba90',
  // teal (alien tech)
  deepTeal: '#0b5e65', teal: '#0b8a8f', jade: '#0eaf9b', mint: '#30e1b9', ice: '#8ff8e2',
  // blues
  navy: '#323353', indigo: '#484a77', blue: '#4d65b4', sky: '#4d9be6', skyLight: '#8fd3ff',
  // purples
  plumDark: '#45293f', plum: '#6b3e75', violet: '#905ea9', lavender: '#a884f3', pinkLight: '#eaaded',
  // pinks / skin
  rose: '#753c54', raspberry: '#a24b6f', pink: '#cf657f', blush: '#ed8099',
  magenta: '#831c5d', cherry: '#c32454', hotPink: '#f04f78', coral: '#f68181', peach: '#fca790', skin: '#fdcbb0',
} as const;
