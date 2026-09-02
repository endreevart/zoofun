import * as THREE from 'three';
import type { IdyllicLibrary } from './IdyllicLibrary';

/**
 * Collects placements first, then emits one InstancedMesh per model primitive.
 * Hundreds of trees, bushes and flowers end up costing a few dozen draw calls.
 */

export type Placement = {
  position: THREE.Vector3;
  /** Target size in world units along the axis named by `fit`. */
  height: number;
  /**
   * Which dimension `height` refers to. Flat props like stepping stones are
   * almost no height at all, so fitting them by height blows up their footprint.
   */
  fit?: 'height' | 'width';
  rotationY?: number;
  /** Small lean, so a grove of identical trees stops looking surveyed. */
  tiltX?: number;
  /** Extra non-uniform squash, applied after the height fit. */
  stretch?: THREE.Vector3;
  /**
   * Fraction of the fitted height to bury. Rocks need this: their pivot is the
   * bounding-box floor, so sitting on the lawn leaves a gap under any mesh that
   * does not fill its own box, and they read as hovering.
   */
  sink?: number;
  /** Per-instance multiplier, used for subtle colour variety. */
  tint?: THREE.Color;
};

export class InstancedScatter {
  private queued = new Map<string, Placement[]>();

  constructor(private library: IdyllicLibrary) {}

  place(modelName: string, placement: Placement) {
    if (!this.library.has(modelName)) return;
    const bucket = this.queued.get(modelName) ?? [];
    bucket.push(placement);
    this.queued.set(modelName, bucket);
  }

  /** Snapshot of queued stamps, so the layout editor can take over. */
  exportRecords(): {
    id: string;
    model: string;
    x: number;
    z: number;
    height: number;
    rotationY: number;
    sink?: number;
    fit?: 'height' | 'width';
    stretch?: number;
    tiltX?: number;
    tint?: [number, number, number];
  }[] {
    const records: ReturnType<InstancedScatter['exportRecords']> = [];
    let index = 0;
    for (const [model, placements] of this.queued) {
      for (const placement of placements) {
        records.push({
          id: `p${index++}-${model}`,
          model,
          x: placement.position.x,
          z: placement.position.z,
          height: placement.height,
          rotationY: placement.rotationY ?? 0,
          sink: placement.sink,
          fit: placement.fit,
          tiltX: placement.tiltX,
          stretch: placement.stretch?.x,
          tint: placement.tint ? [placement.tint.r, placement.tint.g, placement.tint.b] : undefined,
        });
      }
    }
    return records;
  }

  get count(): number {
    let total = 0;
    for (const bucket of this.queued.values()) total += bucket.length;
    return total;
  }

  build(options: {
    castShadow?: boolean | ((modelName: string) => boolean);
    receiveShadow?: boolean;
    name?: string;
  } = {}): THREE.Group {
    const group = new THREE.Group();
    group.name = options.name ?? 'nature';

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();

    for (const [modelName, placements] of this.queued) {
      const model = this.library.get(modelName);
      const modelWidth = Math.max(model.size.x, model.size.z);
      const unitByHeight = model.size.y > 1e-4 ? 1 / model.size.y : 1;
      const unitByWidth = modelWidth > 1e-4 ? 1 / modelWidth : 1;
      const casts =
        typeof options.castShadow === 'function'
          ? options.castShadow(modelName)
          : (options.castShadow ?? true);

      for (const primitive of model.primitives) {
        const mesh = new THREE.InstancedMesh(
          primitive.geometry,
          primitive.material,
          placements.length,
        );
        mesh.name = `${modelName}:${primitive.materialName}`;
        mesh.castShadow = casts;
        mesh.receiveShadow = options.receiveShadow ?? true;

        let usesTint = false;
        const colors = new Float32Array(placements.length * 3).fill(1);

        placements.forEach((placement, index) => {
          const unit = placement.fit === 'width' ? unitByWidth : unitByHeight;
          const uniform = placement.height * unit;
          scale.set(uniform, uniform, uniform);
          if (placement.stretch) scale.multiply(placement.stretch);

          euler.set(placement.tiltX ?? 0, placement.rotationY ?? 0, 0, 'YXZ');
          quaternion.setFromEuler(euler);
          const bury = (placement.sink ?? 0) * model.size.y * scale.y;
          matrix.compose(
            new THREE.Vector3(placement.position.x, placement.position.y - bury, placement.position.z),
            quaternion,
            scale,
          );
          mesh.setMatrixAt(index, matrix);

          if (placement.tint) {
            usesTint = true;
            colors[index * 3 + 0] = placement.tint.r;
            colors[index * 3 + 1] = placement.tint.g;
            colors[index * 3 + 2] = placement.tint.b;
          }
        });

        mesh.instanceMatrix.needsUpdate = true;
        if (usesTint) {
          mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        }
        mesh.computeBoundingSphere();
        group.add(mesh);
      }
    }

    this.queued.clear();
    return group;
  }
}

export function composePlacement(
  modelSize: THREE.Vector3,
  placement: Placement,
  matrix: THREE.Matrix4,
) {
  const modelWidth = Math.max(modelSize.x, modelSize.z);
  const unitByHeight = modelSize.y > 1e-4 ? 1 / modelSize.y : 1;
  const unitByWidth = modelWidth > 1e-4 ? 1 / modelWidth : 1;
  const unit = placement.fit === 'width' ? unitByWidth : unitByHeight;
  const uniform = placement.height * unit;
  const scale = new THREE.Vector3(uniform, uniform, uniform);
  if (placement.stretch) scale.multiply(placement.stretch);
  const euler = new THREE.Euler(placement.tiltX ?? 0, placement.rotationY ?? 0, 0, 'YXZ');
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  const bury = (placement.sink ?? 0) * modelSize.y * scale.y;
  matrix.compose(
    new THREE.Vector3(placement.position.x, placement.position.y - bury, placement.position.z),
    quaternion,
    scale,
  );
}

/** Small brightness/hue jitter so repeated models stop reading as copies. */
export function jitterTint(random: () => number, amount = 0.12): THREE.Color {
  const lift = 1 + (random() - 0.5) * amount * 2;
  const warm = 1 + (random() - 0.5) * amount;
  return new THREE.Color(lift * warm, lift, lift / warm);
}
