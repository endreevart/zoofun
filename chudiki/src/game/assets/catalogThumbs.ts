import * as THREE from 'three';
import type { IdyllicLibrary } from './IdyllicLibrary';
import { placePackedMesh } from './packModel';

const SIZE = 192;

/**
 * Renders catalog previews through the garden's WebGL context.
 * A second renderer on a phone often returns blank frames.
 */
export function renderCatalogThumbs(
  library: IdyllicLibrary,
  names: readonly string[],
  renderer: THREE.WebGLRenderer,
): Record<string, string> {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
  scene.add(new THREE.HemisphereLight(0xfff3dc, 0x2f4a3a, 1.15));
  const key = new THREE.DirectionalLight(0xfff1c8, 1.35);
  key.position.set(2.4, 3.6, 2.6);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);

  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    colorSpace: THREE.SRGBColorSpace,
  });
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const scratch = document.createElement('canvas');
  scratch.width = SIZE;
  scratch.height = SIZE;
  const ctx = scratch.getContext('2d');
  if (!ctx) {
    target.dispose();
    return {};
  }
  const image = ctx.createImageData(SIZE, SIZE);

  const prevTarget = renderer.getRenderTarget();
  const prevClear = new THREE.Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  const prevViewport = new THREE.Vector4();
  renderer.getViewport(prevViewport);
  const prevScissor = new THREE.Vector4();
  renderer.getScissor(prevScissor);
  const prevScissorTest = renderer.getScissorTest();

  renderer.setRenderTarget(target);
  renderer.setViewport(0, 0, SIZE, SIZE);
  renderer.setScissorTest(false);
  renderer.setClearColor(0x1c2620, 1);

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const thumbs: Record<string, string> = {};

  for (const name of names) {
    if (!library.has(name)) continue;
    while (group.children.length) group.remove(group.children[0]);
    const model = library.get(name);
    for (const primitive of model.primitives) {
      const mesh = new THREE.Mesh(primitive.geometry, primitive.material);
      placePackedMesh(mesh, primitive);
      group.add(mesh);
    }
    const box = new THREE.Box3().setFromObject(group);
    box.getSize(size);
    box.getCenter(center);
    const radius = Math.max(size.x, size.y, size.z, 0.2);
    camera.position.set(center.x + radius * 0.95, center.y + radius * 0.7, center.z + radius * 1.2);
    camera.near = Math.max(0.02, radius * 0.04);
    camera.far = radius * 10;
    camera.updateProjectionMatrix();
    camera.lookAt(center);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
    for (let y = 0; y < SIZE; y += 1) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      image.data.set(pixels.subarray(src, src + SIZE * 4), y * SIZE * 4);
    }
    ctx.putImageData(image, 0, 0);
    thumbs[name] = scratch.toDataURL('image/png');
  }

  renderer.setRenderTarget(prevTarget);
  renderer.setViewport(prevViewport);
  renderer.setScissor(prevScissor);
  renderer.setScissorTest(prevScissorTest);
  renderer.setClearColor(prevClear, prevAlpha);
  target.dispose();
  return thumbs;
}
