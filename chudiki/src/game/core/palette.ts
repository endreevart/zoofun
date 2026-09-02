/**
 * Colours lifted from the reference frame: saturated, toy-like, warm sunlight.
 * Everything is authored in sRGB hex and converted by three on assignment.
 */

export const SKY = {
  top: '#5fb8ea',
  horizon: '#bfe7f5',
  haze: '#d8eef4',
  hillFar: '#7fbe74',
  hillNear: '#5da84f',
} as const;

export const GRASS = {
  base: '#8ccb46',
  light: '#a8dd5e',
  dark: '#6aac38',
  mound: '#7cbe40',
  tuft: '#9bd44e',
} as const;

export const DIRT = {
  path: '#d99552',
  pathLight: '#e8ab68',
  pathDark: '#bd7a3c',
  stone: '#a89a8c',
} as const;

export const WATER = {
  deep: '#4ee0e8',
  shallow: '#9af3f0',
  foam: '#e7fffb',
  lily: '#4fae4a',
} as const;

export const WOOD = {
  plank: '#c07f42',
  plankDark: '#9c6231',
  post: '#b0733a',
  rail: '#cd8f4f',
} as const;

export const TREE = {
  trunk: '#8a5c34',
  trunkDark: '#6d4526',
  canopy: '#4f9e34',
  canopyLight: '#71c247',
  canopyDeep: '#3d7f28',
} as const;

export const ROCK = {
  base: '#9b93a6',
  light: '#b3aabd',
  dark: '#7d768c',
  moss: '#69b23c',
} as const;

/** Flower petal colours; the reference is dominated by orange, purple and pink. */
export const FLOWERS = [
  '#ff7a2f',
  '#ff5722',
  '#a05bd6',
  '#8b46c4',
  '#ff6fa5',
  '#ffd23f',
  '#4aa8ff',
  '#ff9a3d',
] as const;

export const FLOWER_CENTER = '#ffe066';

/** Body colours for the resident chudiki, matching the reference cast. */
export const CHUDIK_BODY = [
  '#f4f0e4', // cream
  '#f2c33c', // yellow
  '#ff6b8a', // pink
  '#e8562f', // orange-red
  '#8f5bd8', // purple
  '#7ed957', // green
  '#8fd6ee', // light blue
  '#ffa3c7', // pale pink
  '#c9a0e8', // lilac
] as const;

export const CHUDIK_ACCENT = [
  '#ff8fa8',
  '#ffd97a',
  '#a3e88a',
  '#9ad6f5',
  '#ffb27a',
  '#d9a0f0',
] as const;

export const EYE = {
  white: '#ffffff',
  pupil: '#241c24',
  glint: '#ffffff',
} as const;
