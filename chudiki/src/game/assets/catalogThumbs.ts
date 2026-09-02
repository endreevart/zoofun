import * as THREE from 'three';
import type { IdyllicLibrary } from './IdyllicLibrary';

const SIZE = 128;

/**
 * One offscreen WebGL pass per catalog item. Shared renderer so opening the
 * layout panel does not spawn twenty contexts.
 */
export function renderCatalogThumbs(
  library: IdyllicLibrary,
  names: readonly string[],
): Record<string, string> {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x1c2620, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
  scene.add(new THREE.HemisphereLight(0xfff3dc, 0x2f4a3a, 1.15));
  const key = new THREE.DirectionalLight(0xfff1c8, 1.35);
  key.position.set(2.4, 3.6, 2.6);
  scene.add(key);

  const group = new THREE.Group();
  scene.add(group);

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const thumbs: Record<string, string> = {};

  for (const name of names) {
    if (!library.has(name)) continue;
    while (group.children.length) group.remove(group.children[0]);
    const model = library.get(name);
    for (const primitive of model.primitives) {
      group.add(new THREE.Mesh(primitive.geometry, primitive.material));
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
    renderer.render(scene, camera);
    thumbs[name] = renderer.domElement.toDataURL('image/png');
  }

  renderer.dispose();
  return thumbs;
}
