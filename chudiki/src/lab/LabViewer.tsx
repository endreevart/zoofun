import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { fitLabModel } from './labFit';

const loader = new GLTFLoader();

export function LabViewer({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0xf6efe2, 1);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 80);
    camera.position.set(2.2, 1.4, 2.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.6;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xfff4d2, 1.1);
    key.position.set(3, 5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcde8ff, 0.4);
    fill.position.set(-3, 2, -2);
    scene.add(fill);

    const root = new THREE.Group();
    scene.add(root);

    let dead = false;

    void loader.loadAsync(url).then((gltf) => {
      if (dead) return;
      fitLabModel(gltf.scene);
      root.add(gltf.scene);
      controls.target.set(0, 0, 0);
      controls.update();
    });

    const resize = () => {
      const width = Math.max(1, Math.round(host.clientWidth || 280));
      const height = Math.max(1, Math.round(host.clientHeight || width));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame = 0;
    const tick = () => {
      frame = window.requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      dead = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      root.clear();
    };
  }, [url]);

  return <div className="lab-viewer" ref={hostRef} />;
}
