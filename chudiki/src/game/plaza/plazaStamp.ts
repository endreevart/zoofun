export type PlazaStampDto = {
  id: string;
  model: string;
  x: number;
  z: number;
  height: number;
  rotation_y: number;
  mine?: boolean;
  still_url?: string;
  model_url?: string;
  mesh_status?: string;
};

export function asPlazaProp(stamp: PlazaStampDto) {
  return {
    id: stamp.id,
    model: stamp.model,
    x: stamp.x,
    z: stamp.z,
    y: 0,
    height: stamp.height,
    rotationY: stamp.rotation_y,
    mine: stamp.mine !== false,
    stillUrl: stamp.still_url,
    modelUrl: stamp.model_url,
    meshStatus: stamp.mesh_status,
  };
}
