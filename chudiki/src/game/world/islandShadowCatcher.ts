import * as THREE from 'three';

export type HeightField = {
  minX: number;
  minZ: number;
  step: number;
  cols: number;
  rows: number;
  heights: Float32Array;
};

/**
 * Cheap lawn that only samples the shadow map. The Meshy isle stays pretty
 * and does not pay per-fragment shadow reads on millions of triangles.
 */
export function shadowCatcherGeometry(
  surface: HeightField,
  stride = 1,
  lift = 0,
): THREE.BufferGeometry | null {
  const positions: number[] = [];
  const endCol = surface.cols - 1;
  const endRow = surface.rows - 1;
  for (let row = 0; row < endRow; row += stride) {
    for (let col = 0; col < endCol; col += stride) {
      const nextCol = Math.min(col + stride, endCol);
      const nextRow = Math.min(row + stride, endRow);
      const h00 = heightAt(surface, col, row);
      const h10 = heightAt(surface, nextCol, row);
      const h01 = heightAt(surface, col, nextRow);
      const h11 = heightAt(surface, nextCol, nextRow);
      if (h00 === null || h10 === null || h01 === null || h11 === null) continue;
      const x0 = surface.minX + col * surface.step;
      const x1 = surface.minX + nextCol * surface.step;
      const z0 = surface.minZ + row * surface.step;
      const z1 = surface.minZ + nextRow * surface.step;
      pushTri(positions, x0, h00 + lift, z0, x1, h10 + lift, z0, x0, h01 + lift, z1);
      pushTri(positions, x1, h10 + lift, z0, x1, h11 + lift, z1, x0, h01 + lift, z1);
    }
  }
  if (positions.length < 9) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Flat plateau catcher. Grove's voxel lawn is a disc, not a draped heightfield. */
export function createFlatShadowCatcher(x: number, y: number, z: number, radius: number): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(Math.max(radius, 1), 48);
  geometry.rotateX(-Math.PI / 2);
  const mesh = dressShadowCatcher(geometry);
  mesh.position.set(x, y, z);
  mesh.updateMatrix();
  return mesh;
}

export function createShadowCatcher(surface: HeightField, lift = 0): THREE.Mesh | null {
  const geometry = shadowCatcherGeometry(surface, 1, lift);
  if (!geometry) return null;
  return dressShadowCatcher(geometry);
}

function dressShadowCatcher(geometry: THREE.BufferGeometry): THREE.Mesh {
  // Same lighting/shadow path as the garden isle (that one samples the map
  // correctly). We then throw away albedo and keep only the umbra, so the
  // voxel lawn stays visible.
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0,
    transparent: true,
    depthWrite: false,
    fog: false,
    side: THREE.FrontSide,
  });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -8;
  material.polygonOffsetUnits = -8;
  material.customProgramCacheKey = () => 'lawn-shadow-only';
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `
      float shade = 1.0;
      #if NUM_DIR_LIGHT_SHADOWS > 0
        shade = receiveShadow ? getShadow(
          directionalShadowMap[ 0 ],
          directionalLightShadows[ 0 ].shadowMapSize,
          directionalLightShadows[ 0 ].shadowIntensity,
          directionalLightShadows[ 0 ].shadowBias,
          directionalLightShadows[ 0 ].shadowRadius,
          vDirectionalShadowCoord[ 0 ]
        ) : 1.0;
      #endif
      float umbra = max( 0.0, ( 1.0 - shade ) - 0.08 );
      gl_FragColor = vec4( 0.0, 0.0, 0.0, umbra * 0.55 );
      `,
    );
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'lawn-shadows';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

function heightAt(surface: HeightField, col: number, row: number): number | null {
  if (col < 0 || row < 0 || col >= surface.cols || row >= surface.rows) return null;
  const value = surface.heights[row * surface.cols + col];
  return Number.isFinite(value) ? value : null;
}

function pushTri(
  positions: number[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
) {
  positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
}
