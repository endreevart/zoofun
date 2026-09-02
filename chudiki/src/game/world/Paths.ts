import * as THREE from 'three';
import type { IdyllicLibrary } from '../assets/IdyllicLibrary';
import type { Terrain } from './Terrain';
import { createToyMaterial } from '../core/geometry';
import { pathMain, pathSide } from './layout';
import { ribbonGeometry } from './idyllic/ribbon';

/**
 * The dirt walkways, ported from build_paths() in render-idyllic-world.py. The
 * main path is widest where it enters the frame and tapers as it climbs to the
 * gate, which is what gives the composition its perspective pull.
 */

const DIRT_TINT = new THREE.Color(0.92, 0.82, 0.68);

export function createPaths(library: IdyllicLibrary, terrain: Terrain): THREE.Group {
  const group = new THREE.Group();
  group.name = 'paths';

  const map = library.groundTexture('dirt_albedo', 3);
  const normalMap = library.groundTexture('dirt_normal', 3);
  const material = createToyMaterial({
    color: DIRT_TINT,
    roughness: 0.92,
    map: map ?? null,
    normalMap: normalMap ?? null,
    translucent: false,
  });

  const lay = (
    at: (t: number, out?: THREE.Vector2) => THREE.Vector2,
    steps: number,
    halfWidth: (t: number) => number,
    lift: number,
    name: string,
  ) => {
    const geometry = ribbonGeometry({
      at,
      steps,
      halfWidth,
      heightAt: (x, z) => terrain.heightAt(x, z) + lift,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.receiveShadow = true;
    // Draped just above the lawn, so it wins the depth test without a gap.
    mesh.renderOrder = 1;
    group.add(mesh);
  };

  lay(pathMain, 170, (t) => 3.2 - 2.25 * t, 0.08, 'path-main');
  lay(pathSide, 60, (t) => 0.95 - 0.2 * t, 0.085, 'path-side');

  return group;
}
