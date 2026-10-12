import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeOrbProps {
  isProcessing: boolean;
  status: 'idle' | 'thinking' | 'generating' | 'error';
}

export const ThreeOrb: React.FC<ThreeOrbProps> = ({ isProcessing, status }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(isProcessing);
  const statusRef = useRef(status);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
    statusRef.current = status;
  }, [isProcessing, status]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let width = container.clientWidth || 380;
    let height = container.clientHeight || 280;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 160;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Ambient and Point Lights
    const ambientLight = new THREE.AmbientLight(0x06b6d4, 1.2);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x22d3ee, 3, 250);
    pointLight1.position.set(60, 60, 80);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xa855f7, 3.5, 250);
    pointLight2.position.set(-60, -50, 70);
    scene.add(pointLight2);

    // Group for entire orb
    const orbGroup = new THREE.Group();
    scene.add(orbGroup);

    // 1. Inner Glowing Energy Core
    const innerGeo = new THREE.SphereGeometry(22, 32, 32);
    const innerMat = new THREE.MeshPhongMaterial({
      color: 0x070d1d,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.9,
      shininess: 100,
      wireframe: true,
      transparent: true,
      opacity: 0.65,
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    orbGroup.add(innerSphere);

    // 2. Translucent Holo Shell
    const shellGeo = new THREE.IcosahedronGeometry(32, 3);
    const shellMat = new THREE.MeshPhongMaterial({
      color: 0x1e1b4b,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.35,
      shininess: 90,
      wireframe: true,
      transparent: true,
      opacity: 0.4,
    });
    const holoShell = new THREE.Mesh(shellGeo, shellMat);
    orbGroup.add(holoShell);

    // 3. Orbital Concentric Energy Rings
    const createRing = (radius: number, tube: number, color: number, rotX: number, rotY: number) => {
      const ringGeo = new THREE.TorusGeometry(radius, tube, 16, 100);
      const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = rotX;
      ring.rotation.y = rotY;
      return ring;
    };

    const ring1 = createRing(44, 0.6, 0x22d3ee, Math.PI / 3, Math.PI / 6);
    const ring2 = createRing(52, 0.8, 0xa855f7, -Math.PI / 4, Math.PI / 4);
    const ring3 = createRing(40, 0.5, 0x38bdf8, Math.PI / 2.2, -Math.PI / 5);
    orbGroup.add(ring1);
    orbGroup.add(ring2);
    orbGroup.add(ring3);

    // 4. Converging Synaptic Particle Cloud
    const particleCount = 420;
    const particleGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    const colorsArray = new Float32Array(particleCount * 3);

    const colorCyan = new THREE.Color(0x22d3ee);
    const colorViolet = new THREE.Color(0xc084fc);
    const colorBlue = new THREE.Color(0x3b82f6);

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const dist = 32 + Math.random() * 45;

      posArray[i * 3] = dist * Math.sin(phi) * Math.cos(theta);
      posArray[i * 3 + 1] = dist * Math.sin(phi) * Math.sin(theta);
      posArray[i * 3 + 2] = dist * Math.cos(phi);

      const mixed = Math.random() < 0.4 ? colorCyan : Math.random() < 0.7 ? colorViolet : colorBlue;
      colorsArray[i * 3] = mixed.r;
      colorsArray[i * 3 + 1] = mixed.g;
      colorsArray[i * 3 + 2] = mixed.b;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colorsArray, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    const particleSystem = new THREE.Points(particleGeo, particleMat);
    orbGroup.add(particleSystem);

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth || 380;
      height = container.clientHeight || 280;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let animId: number;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      const active = isProcessingRef.current;
      const speedMultiplier = active ? 2.5 : 1.0;

      // Gentle floating motion
      orbGroup.position.y = Math.sin(elapsedTime * (active ? 3 : 1.5)) * (active ? 6 : 4);

      // Rotations
      innerSphere.rotation.y += delta * 0.4 * speedMultiplier;
      holoShell.rotation.y -= delta * 0.25 * speedMultiplier;
      holoShell.rotation.x = Math.sin(elapsedTime * 0.5) * 0.15;

      ring1.rotation.z += delta * 0.7 * speedMultiplier;
      ring2.rotation.z -= delta * 0.55 * speedMultiplier;
      ring3.rotation.x += delta * 0.8 * speedMultiplier;

      particleSystem.rotation.y += delta * 0.12 * speedMultiplier;
      particleSystem.rotation.z -= delta * 0.08 * speedMultiplier;

      // Pulse scaling
      const pulseSpeed = active ? 4.5 : 2.2;
      const pulseAmplitude = active ? 0.08 : 0.035;
      const scale = 1 + Math.sin(elapsedTime * pulseSpeed) * pulseAmplitude;
      innerSphere.scale.set(scale, scale, scale);

      // Light reactivity when active
      if (active) {
        innerMat.emissiveIntensity = 1.3 + Math.sin(elapsedTime * 6) * 0.4;
        pointLight1.intensity = 4.0;
        pointLight2.intensity = 4.5;
      } else {
        innerMat.emissiveIntensity = 0.8;
        pointLight1.intensity = 2.5;
        pointLight2.intensity = 3.0;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      shellGeo.dispose();
      shellMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  return (
    <div className="w-full relative flex flex-col items-center justify-center my-2">
      {/* Radiant Pedestal Glow Waves */}
      <div
        className={`absolute w-64 h-64 rounded-full blur-3xl pointer-events-none transition-all duration-700 ${
          isProcessing
            ? 'bg-cyan-500/30 scale-125 ring-pulse'
            : 'bg-cyan-500/15'
        }`}
      />
      <div className="absolute w-44 h-44 rounded-full bg-purple-500/15 blur-2xl pointer-events-none" />

      {/* 3D Canvas container */}
      <div ref={containerRef} className="w-full h-64 md:h-72 mx-auto relative z-10" />

      {/* Hologram Pedestal Base */}
      <div className="w-48 h-2 -mt-4 bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent blur-sm" />
      <div className="w-32 h-[1px] bg-gradient-to-r from-transparent via-purple-400 to-transparent shadow-[0_0_12px_#acedff]" />
    </div>
  );
};
