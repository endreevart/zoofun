import * as THREE from 'three';
import { ISLAND } from './layout';
import { WORLD_CURVE_GLSL, worldCurveUniforms } from '../render/worldCurve';
import {
  CARTOON_WATER_GLSL,
  cartoonWaterUniforms,
  loadCartoonWaterTextures,
  updateCartoonWater,
} from './cartoonWater';

/**
 * The ocean around the island. Inland ponds are the Meshy lotus model now,
 * stamped through the layout editor.
 */

const FOAM = new THREE.Color(0.72, 0.95, 0.9);
const SKY = new THREE.Color(0.55, 0.78, 0.96);
const GLINT = new THREE.Color(1.0, 0.94, 0.72);

const oceanFragmentShader = /* glsl */ `
  ${CARTOON_WATER_GLSL}
  uniform vec3 foamColor;
  uniform vec3 skyColor;
  uniform vec3 glintColor;
  uniform vec3 sunDirection;
  uniform vec2 islandCenter;
  uniform float islandRadius;
  varying float vDepth;
  varying vec3 vWorld;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec3 color = cartoonWater(vWorld.xz);

    float rippleA = sin(vWorld.x * 0.55 + vWorld.z * 0.4 + time * 0.55);
    float rippleB = sin(vWorld.x * -0.38 + vWorld.z * 0.62 + time * 0.4);
    vec3 normal = normalize(vec3(rippleA * 0.12, 1.0, rippleB * 0.12));

    float ndotv = abs(dot(normal, viewDir));
    float fresnel = pow(1.0 - ndotv, 2.4);
    color = mix(color, skyColor, fresnel * 0.38);

    vec3 halfV = normalize(sunDirection + viewDir);
    float spec = pow(max(dot(normal, halfV), 0.0), 48.0);
    color += glintColor * spec * 0.4;

    float dist = length(vWorld.xz - islandCenter);
    float foam = 1.0 - smoothstep(islandRadius - 0.4, islandRadius + 3.5, dist);
    color = mix(color, foamColor, foam * 0.5);

    float near = 1.0 - smoothstep(islandRadius - 1.0, islandRadius + 14.0, dist);
    float alpha = mix(0.88, 0.96, near) + fresnel * 0.08;
    gl_FragColor = vec4(color, clamp(alpha, 0.82, 0.98));
  }
`;

const vertexShader = /* glsl */ `
  ${WORLD_CURVE_GLSL}
  attribute float shoreDepth;
  varying float vDepth;
  varying vec3 vWorld;
  uniform float time;

  void main() {
    vDepth = shoreDepth;
    vec3 pos = position;
    pos.y += sin(position.x * 1.35 + time * 0.85) * cos(position.z * 1.1 + time * 0.6) * 0.03;
    vec4 world = modelMatrix * vec4(pos, 1.0);
    world.xyz = curveWorld(world.xyz);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export class Water {
  readonly group = new THREE.Group();
  private oceanMaterial: THREE.ShaderMaterial;

  constructor() {
    this.group.name = 'water';
    loadCartoonWaterTextures();

    this.oceanMaterial = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader: oceanFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        foamColor: { value: FOAM },
        skyColor: { value: SKY },
        glintColor: { value: GLINT },
        sunDirection: { value: new THREE.Vector3(0.25, 0.85, 0.45).normalize() },
        islandCenter: { value: new THREE.Vector2(ISLAND.centerX, ISLAND.centerZ) },
        islandRadius: { value: ISLAND.radius },
        ...cartoonWaterUniforms,
        ...worldCurveUniforms,
      },
    });

    this.group.add(this.buildOcean());
  }

  private buildOcean(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(520, 520, 48, 48);
    geometry.rotateX(-Math.PI / 2);
    const count = geometry.getAttribute('position').count;
    const depths = new Float32Array(count).fill(1);
    geometry.setAttribute('shoreDepth', new THREE.BufferAttribute(depths, 1));
    const mesh = new THREE.Mesh(geometry, this.oceanMaterial);
    mesh.position.set(ISLAND.centerX, ISLAND.oceanY, ISLAND.centerZ);
    mesh.name = 'ocean';
    mesh.renderOrder = 1;
    mesh.frustumCulled = false;
    return mesh;
  }

  update(elapsed: number, sun?: THREE.DirectionalLight) {
    updateCartoonWater(elapsed);
    if (sun) {
      const dir = sun.position.clone().sub(sun.target.position).normalize();
      (this.oceanMaterial.uniforms.sunDirection.value as THREE.Vector3).copy(dir);
    }
  }

  dispose() {
    this.oceanMaterial.dispose();
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }
}
