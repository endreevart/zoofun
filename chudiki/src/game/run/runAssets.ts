import { assetUrl } from '../../assetUrl';

export const RUN_IMG = {
  portraitSky: assetUrl('/run/portrait/sky.jpg'),
  portraitHills: assetUrl('/run/portrait/hills.png'),
  portraitFore: assetUrl('/run/portrait/foreground.png'),
  landscapeSky: assetUrl('/run/landscape/sky.jpg'),
  landscapeHills: assetUrl('/run/landscape/hills.png'),
  landscapeFore: assetUrl('/run/landscape/foreground.png'),
  dirt: assetUrl('/run/shared/dirt.png'),
  grass: assetUrl('/run/shared/grass.png'),
  tuft: assetUrl('/run/shared/tuft.png'),
  log: assetUrl('/run/shared/log.png'),
  bush: assetUrl('/run/shared/bush.png'),
  rock: assetUrl('/run/shared/rock.png'),
  flower: assetUrl('/run/shared/flower.png'),
  run: assetUrl('/run/shared/run.png'),
  jump: assetUrl('/run/shared/jump.png'),
  btnJump: assetUrl('/run/shared/btn-jump.png'),
  btnPause: assetUrl('/run/shared/btn-pause.png'),
  btnRestart: assetUrl('/run/shared/btn-restart.png'),
  counter: assetUrl('/run/shared/counter.png'),
} as const;

export type RunImgKey = keyof typeof RUN_IMG;
