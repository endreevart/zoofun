import * as THREE from 'three';

export const CHEST_GLOW_RADIUS = 8.8;
export const CHEST_GLOW_OUTER = 13.2;

export function chestGlowMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const glow = ctx.createRadialGradient(64, 64, 1, 64, 64, 62);
    glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
    glow.addColorStop(0.08, 'rgba(255, 250, 200, 1)');
    glow.addColorStop(0.22, 'rgba(255, 220, 90, 1)');
    glow.addColorStop(0.48, 'rgba(255, 170, 40, 0.9)');
    glow.addColorStop(0.72, 'rgba(255, 110, 10, 0.4)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

function glowDisc(name: string, radius: number, color: number, map: THREE.Texture | null): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(1, 32);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  if (map) material.map = map;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.scale.set(radius, 1, radius);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  return mesh;
}

export function chestGlowDisc(map: THREE.Texture | null = null): THREE.Mesh {
  return glowDisc('chest-glow', CHEST_GLOW_RADIUS, 0xfff3b0, map);
}

export function chestGlowOuterDisc(map: THREE.Texture | null = null): THREE.Mesh {
  const mesh = glowDisc('chest-glow-outer', CHEST_GLOW_OUTER, 0xffc45c, map);
  mesh.renderOrder = 1;
  return mesh;
}

export function chestLamp(): THREE.PointLight {
  const light = new THREE.PointLight(0xffe08a, 7.2, 16, 1.35);
  light.name = 'chest-lamp';
  light.castShadow = false;
  return light;
}
