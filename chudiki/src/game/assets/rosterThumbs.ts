import * as THREE from 'three';

const SIZE = 256;

type Puppet = {
  id: string;
  object3D: THREE.Object3D;
};

/**
 * A cream-studio still of each puppet, using the garden renderer.
 * A second WebGL context on a phone often returns blank frames.
 */
export function captureRosterThumbs(
  renderer: THREE.WebGLRenderer,
  puppets: Iterable<Puppet>,
): Record<string, string> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfffaf0);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 80);
  scene.add(new THREE.HemisphereLight(0xfff6e4, 0x3a4f3c, 1.2));
  const key = new THREE.DirectionalLight(0xfff1c8, 1.4);
  key.position.set(2.2, 3.4, 2.8);
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
  renderer.setClearColor(0xfffaf0, 1);

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  const thumbs: Record<string, string> = {};

  for (const puppet of puppets) {
    const object = puppet.object3D;
    const parent = object.parent;
    const pos = object.position.clone();
    const quat = object.quaternion.clone();
    const scl = object.scale.clone();

    parent?.remove(object);
    object.position.set(0, 0, 0);
    object.quaternion.identity();
    object.rotation.y = Math.PI * 0.18;
    group.add(object);
    object.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      restore(object, parent, pos, quat, scl, group);
      continue;
    }
    box.getSize(size);
    box.getCenter(center);
    const radius = Math.max(size.x, size.y, size.z, 0.18);
    camera.position.set(center.x + radius * 0.9, center.y + radius * 0.45, center.z + radius * 1.45);
    camera.near = Math.max(0.02, radius * 0.04);
    camera.far = radius * 12;
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
    thumbs[puppet.id] = scratch.toDataURL('image/png');
    restore(object, parent, pos, quat, scl, group);
  }

  renderer.setRenderTarget(prevTarget);
  renderer.setViewport(prevViewport);
  renderer.setScissor(prevScissor);
  renderer.setScissorTest(prevScissorTest);
  renderer.setClearColor(prevClear, prevAlpha);
  target.dispose();
  return thumbs;
}

function restore(
  object: THREE.Object3D,
  parent: THREE.Object3D | null,
  pos: THREE.Vector3,
  quat: THREE.Quaternion,
  scl: THREE.Vector3,
  group: THREE.Group,
) {
  group.remove(object);
  parent?.add(object);
  object.position.copy(pos);
  object.quaternion.copy(quat);
  object.scale.copy(scl);
}
