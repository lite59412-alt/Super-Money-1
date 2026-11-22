import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { detectSoftwareWebGL } from '../three/casinoMaterials';

export interface AviatorTelemetry {
  phase: 'waiting' | 'flying' | 'crashed';
  multiplier: number;
  flightElapsedSec: number;
  crashElapsedSec: number;
}

interface Aviator3DStageProps {
  telemetryRef: React.MutableRefObject<AviatorTelemetry>;
}

const TRAIL_POINTS = 72;

export const Aviator3DStage: React.FC<Aviator3DStageProps> = ({ telemetryRef }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      return;
    }

    const isSoftware = detectSoftwareWebGL(renderer);
    renderer.setPixelRatio(isSoftware ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0b0710, 0.036);

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 260);
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 160);
    camera.position.set(0.2, 1.35, 9.4);
    camera.lookAt(0.4, 0.25, 0);
    renderer.setSize(width, height, false);

    const disposables: { dispose: () => void }[] = [];
    const track = <T extends { dispose: () => void }>(x: T): T => {
      disposables.push(x);
      return x;
    };

    // Studio Hangar & Sky Lighting
    scene.add(new THREE.HemisphereLight(0xfda4af, 0x0a0d18, 1.05));
    const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.3);
    keyLight.position.set(6, 9, 8);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xf43f5e, 1.7);
    rimLight.position.set(-7, 4, -5);
    scene.add(rimLight);

    const engineGlowLight = new THREE.PointLight(0xff5a1f, 3.2, 8);
    scene.add(engineGlowLight);

    // Subtle 3D altitude radar grid in background
    const gridGroup = new THREE.Group();
    gridGroup.position.set(0, -2.5, -2.8);
    const gridHelper = new THREE.GridHelper(34, 24, 0x3f1d28, 0x1c1426);
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.45;
    gridGroup.add(gridHelper);
    scene.add(gridGroup);

    // 3D Starfield / Parallax speed streaks
    const starCount = isSoftware ? 110 : 260;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 34;
      starPositions[i * 3 + 1] = (Math.random() - 0.35) * 18;
      starPositions[i * 3 + 2] = -3 - Math.random() * 24;
    }
    const starGeo = track(new THREE.BufferGeometry());
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = track(
      new THREE.PointsMaterial({
        color: 0xfde2e4,
        size: 0.085,
        transparent: true,
        opacity: 0.72,
      })
    );
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Volumetric soft parallax clouds
    const cloudGroup = new THREE.Group();
    const cloudMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x3b1f30,
        roughness: 0.95,
        metalness: 0.0,
        transparent: true,
        opacity: 0.32,
      })
    );
    const cloudGeo = track(new THREE.SphereGeometry(1, 14, 10));
    const clouds: THREE.Group[] = [];
    for (let i = 0; i < (isSoftware ? 5 : 9); i++) {
      const c = new THREE.Group();
      for (let p = 0; p < 3; p++) {
        const puff = new THREE.Mesh(cloudGeo, cloudMat);
        puff.scale.set(1.2 + Math.random() * 0.9, 0.48 + Math.random() * 0.25, 0.7);
        puff.position.set((p - 1) * 0.9, (Math.random() - 0.5) * 0.2, 0);
        c.add(puff);
      }
      c.position.set(-14 + i * 3.8, -1.8 + Math.random() * 5.2, -5.5 - Math.random() * 7);
      cloudGroup.add(c);
      clouds.push(c);
    }
    scene.add(cloudGroup);

    // =========================================================================
    // 3D CRIMSON AVIATOR STUNT PLANE
    // =========================================================================
    const planeGroup = new THREE.Group();
    planeGroup.position.set(-1.6, -1.55, 0.3);
    scene.add(planeGroup);

    const crimsonMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0xe11d48,
        emissive: 0x4c0519,
        emissiveIntensity: 0.32,
        roughness: 0.22,
        metalness: 0.35,
        clearcoat: 0.9,
        clearcoatRoughness: 0.14,
      })
    );
    const goldMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        roughness: 0.22,
        metalness: 0.9,
      })
    );
    const chromeMat = track(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.16,
        metalness: 0.94,
      })
    );
    const canopyMat = track(
      new THREE.MeshPhysicalMaterial({
        color: 0x38bdf8,
        emissive: 0x0c4a6e,
        emissiveIntensity: 0.4,
        roughness: 0.08,
        metalness: 0.2,
        clearcoat: 1.0,
      })
    );

    const fuselageGeo = track(new THREE.CapsuleGeometry(0.28, 1.35, 10, 20));
    const fuselage = new THREE.Mesh(fuselageGeo, crimsonMat);
    fuselage.rotation.z = Math.PI / 2;
    fuselage.scale.set(1, 1.05, 0.88);
    planeGroup.add(fuselage);

    const noseCone = new THREE.Mesh(track(new THREE.ConeGeometry(0.24, 0.46, 20)), goldMat);
    noseCone.rotation.z = -Math.PI / 2;
    noseCone.position.set(0.95, 0, 0);
    planeGroup.add(noseCone);

    const cowling = new THREE.Mesh(track(new THREE.TorusGeometry(0.25, 0.04, 12, 24)), chromeMat);
    cowling.rotation.y = Math.PI / 2;
    cowling.position.set(0.74, 0, 0);
    planeGroup.add(cowling);

    const canopy = new THREE.Mesh(track(new THREE.SphereGeometry(0.22, 16, 12)), canopyMat);
    canopy.scale.set(1.55, 0.72, 0.86);
    canopy.position.set(0.18, 0.22, 0);
    planeGroup.add(canopy);

    const wingGeo = track(new THREE.BoxGeometry(0.56, 0.06, 2.35));
    const wing = new THREE.Mesh(wingGeo, crimsonMat);
    wing.position.set(0.12, -0.02, 0);
    planeGroup.add(wing);

    const wingStripe = new THREE.Mesh(track(new THREE.BoxGeometry(0.14, 0.072, 2.37)), goldMat);
    wingStripe.position.set(0.22, -0.02, 0);
    planeGroup.add(wingStripe);

    const tailFin = new THREE.Mesh(track(new THREE.BoxGeometry(0.44, 0.56, 0.06)), crimsonMat);
    tailFin.position.set(-0.74, 0.26, 0);
    tailFin.rotation.z = 0.28;
    planeGroup.add(tailFin);

    const tailStripe = new THREE.Mesh(track(new THREE.BoxGeometry(0.46, 0.1, 0.07)), goldMat);
    tailStripe.position.set(-0.72, 0.34, 0);
    tailStripe.rotation.z = 0.28;
    planeGroup.add(tailStripe);

    const hStab = new THREE.Mesh(track(new THREE.BoxGeometry(0.32, 0.045, 0.92)), crimsonMat);
    hStab.position.set(-0.76, 0.06, 0);
    planeGroup.add(hStab);

    const propPivot = new THREE.Group();
    propPivot.position.set(1.18, 0, 0);
    planeGroup.add(propPivot);

    const bladeGeo = track(new THREE.BoxGeometry(0.03, 0.92, 0.09));
    const blade1 = new THREE.Mesh(bladeGeo, chromeMat);
    const blade2 = new THREE.Mesh(bladeGeo, chromeMat);
    blade2.rotation.x = Math.PI / 2;
    propPivot.add(blade1, blade2);

    const propBlurDisc = new THREE.Mesh(
      track(new THREE.CircleGeometry(0.46, 24)),
      track(
        new THREE.MeshBasicMaterial({
          color: 0xfde68a,
          transparent: true,
          opacity: 0.2,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      )
    );
    propBlurDisc.rotation.y = Math.PI / 2;
    propPivot.add(propBlurDisc);

    const flameMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xff9f1c,
        transparent: true,
        opacity: 0.88,
      })
    );
    const flameCore = new THREE.Mesh(track(new THREE.ConeGeometry(0.14, 0.95, 14)), flameMat);
    flameCore.rotation.z = Math.PI / 2;
    flameCore.position.set(-1.22, -0.02, 0);
    planeGroup.add(flameCore);

    // =========================================================================
    // GLOWING FLIGHT TRAJECTORY RIBBON + FILLED AREA CURVE
    // =========================================================================
    const trailPositions = new Float32Array(TRAIL_POINTS * 3);
    const trailGeo = track(new THREE.BufferGeometry());
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    const trailMat = track(
      new THREE.LineBasicMaterial({
        color: 0xf43f5e,
        transparent: true,
        opacity: 0.96,
      })
    );
    const trailLine = new THREE.Line(trailGeo, trailMat);
    scene.add(trailLine);

    const ribbonVerts = new Float32Array(TRAIL_POINTS * 2 * 3);
    const ribbonIndices: number[] = [];
    for (let i = 0; i < TRAIL_POINTS - 1; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = (i + 1) * 2;
      const d = (i + 1) * 2 + 1;
      ribbonIndices.push(a, b, c, b, d, c);
    }
    const ribbonGeo = track(new THREE.BufferGeometry());
    ribbonGeo.setAttribute('position', new THREE.BufferAttribute(ribbonVerts, 3));
    ribbonGeo.setIndex(ribbonIndices);
    const ribbonMat = track(
      new THREE.MeshBasicMaterial({
        color: 0xe11d48,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const ribbonMesh = new THREE.Mesh(ribbonGeo, ribbonMat);
    scene.add(ribbonMesh);

    const onResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 320);
      const h = Math.max(container.clientHeight, 260);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    let rafId = 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let lastPhase: 'waiting' | 'flying' | 'crashed' = telemetryRef.current.phase;
    let lastFov = camera.fov;

    const resetRibbonHidden = () => {
      trailLine.visible = false;
      ribbonMesh.visible = false;
    };

    const animate = (now: number) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += dt;

      const { phase, multiplier, flightElapsedSec, crashElapsedSec } = telemetryRef.current;

      // Cleanly snap plane back to tarmac when a new waiting countdown begins after crash
      if (lastPhase === 'crashed' && phase === 'waiting') {
        planeGroup.position.set(-1.6, -1.55, 0.3);
        planeGroup.rotation.set(0, 0.08, 0.04);
        planeGroup.scale.setScalar(1);
        resetRibbonHidden();
      }
      lastPhase = phase;

      const speedFactor =
        phase === 'flying' ? Math.min(3.5, 1 + Math.log(Math.max(1, multiplier)) * 0.85) : 0.45;

      // Spin propeller smoothly
      propPivot.rotation.x += dt * (phase === 'flying' ? 44 : 18);
      (propBlurDisc.material as THREE.MeshBasicMaterial).opacity =
        phase === 'flying' ? 0.36 : 0.14;

      // Scroll parallax clouds & starfield
      const scrollStep = dt * (phase === 'flying' ? 2.4 * speedFactor : 0.45);
      for (const c of clouds) {
        c.position.x -= scrollStep * 0.72;
        if (c.position.x < -16) c.position.x = 16;
      }
      const posAttr = starGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < starCount; i++) {
        let sx = posAttr.getX(i) - scrollStep * 1.45;
        if (sx < -17) sx = 17;
        posAttr.setX(i, sx);
      }
      posAttr.needsUpdate = true;
      gridGroup.position.x = -((elapsed * (phase === 'flying' ? 3.2 : 0.55)) % 1.4);

      if (phase === 'waiting') {
        planeGroup.position.x = THREE.MathUtils.damp(planeGroup.position.x, -1.6, 7, dt);
        planeGroup.position.y = THREE.MathUtils.damp(
          planeGroup.position.y,
          -1.55 + Math.sin(elapsed * 2.8) * 0.08,
          7,
          dt
        );
        planeGroup.position.z = THREE.MathUtils.damp(planeGroup.position.z, 0.3, 7, dt);
        planeGroup.rotation.z = THREE.MathUtils.damp(planeGroup.rotation.z, 0.04, 7, dt);
        planeGroup.rotation.x = THREE.MathUtils.damp(
          planeGroup.rotation.x,
          Math.sin(elapsed * 1.6) * 0.05,
          7,
          dt
        );
        planeGroup.rotation.y = THREE.MathUtils.damp(planeGroup.rotation.y, 0.08, 7, dt);
        flameCore.scale.set(0.5, 0.35 + Math.sin(elapsed * 22) * 0.08, 0.5);
        flameMat.opacity = 0.38;
        resetRibbonHidden();

        camera.position.x = THREE.MathUtils.damp(camera.position.x, 0.0, 5, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, 1.25, 5, dt);
        const targetFov = 44;
        const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 5, dt);
        if (Math.abs(nextFov - lastFov) > 0.008) {
          camera.fov = nextFov;
          lastFov = nextFov;
          camera.updateProjectionMatrix();
        }
        camera.lookAt(0.2, 0.15, 0);
      } else if (phase === 'flying') {
        const progress = Math.min(1, 1 - Math.exp(-flightElapsedSec * 0.24));
        const targetX = -1.6 + progress * 4.75;
        const targetY = -1.55 + Math.pow(progress, 1.25) * 3.45 + Math.sin(elapsed * 3.6) * 0.11;
        const targetZ = 0.3 + Math.sin(elapsed * 2.1) * 0.22;

        planeGroup.position.x = THREE.MathUtils.damp(planeGroup.position.x, targetX, 8, dt);
        planeGroup.position.y = THREE.MathUtils.damp(planeGroup.position.y, targetY, 8, dt);
        planeGroup.position.z = THREE.MathUtils.damp(planeGroup.position.z, targetZ, 7, dt);

        const climbPitch = 0.22 + (1 - progress) * 0.16 + Math.cos(elapsed * 3.6) * 0.035;
        planeGroup.rotation.z = THREE.MathUtils.damp(planeGroup.rotation.z, climbPitch, 8, dt);
        planeGroup.rotation.x = THREE.MathUtils.damp(
          planeGroup.rotation.x,
          -0.22 + Math.sin(elapsed * 2.4) * 0.09,
          7,
          dt
        );
        planeGroup.rotation.y = THREE.MathUtils.damp(planeGroup.rotation.y, 0.12, 7, dt);

        const flameLen = 0.95 + Math.sin(elapsed * 34) * 0.2 + Math.min(0.6, (multiplier - 1) * 0.12);
        flameCore.scale.set(1.05, flameLen, 1.05);
        flameMat.opacity = 0.92;

        // Smooth curved parabolic trajectory ribbon from origin to plane tail
        const startX = -3.8;
        const startY = -2.1;
        const endX = planeGroup.position.x - 0.62;
        const endY = planeGroup.position.y - 0.08;
        const tAttr = trailGeo.getAttribute('position') as THREE.BufferAttribute;
        const rAttr = ribbonGeo.getAttribute('position') as THREE.BufferAttribute;

        for (let i = 0; i < TRAIL_POINTS; i++) {
          const u = i / (TRAIL_POINTS - 1);
          const x = THREE.MathUtils.lerp(startX, endX, u);
          const curveU = Math.pow(u, 1.72);
          const y = THREE.MathUtils.lerp(startY, endY, curveU);
          const z = THREE.MathUtils.lerp(0.1, planeGroup.position.z, u);
          tAttr.setXYZ(i, x, y, z);
          rAttr.setXYZ(i * 2, x, y, z);
          rAttr.setXYZ(i * 2 + 1, x, startY - 0.2, z);
        }
        tAttr.needsUpdate = true;
        rAttr.needsUpdate = true;
        trailLine.visible = true;
        ribbonMesh.visible = true;

        const targetFov = Math.min(54, 44 + (multiplier - 1) * 1.15);
        const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 4, dt);
        if (Math.abs(nextFov - lastFov) > 0.008) {
          camera.fov = nextFov;
          lastFov = nextFov;
          camera.updateProjectionMatrix();
        }
        camera.position.x = THREE.MathUtils.damp(camera.position.x, progress * 0.55, 4, dt);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, 1.35 + progress * 0.45, 4, dt);
        camera.lookAt(0.4 + progress * 0.45, 0.25 + progress * 0.28, 0);
      } else {
        // Crashed — jet rockets out smoothly into upper-right sky
        const boost = 1 + crashElapsedSec * 3.8;
        planeGroup.position.x += dt * 11.5 * boost;
        planeGroup.position.y += dt * 7.2 * boost;
        planeGroup.position.z -= dt * 4.0;
        planeGroup.rotation.z = THREE.MathUtils.damp(planeGroup.rotation.z, 0.62, 10, dt);
        planeGroup.rotation.x += dt * 1.4;
        flameCore.scale.set(1.3, 1.85, 1.3);
        flameMat.opacity = 1;
        resetRibbonHidden();
      }

      engineGlowLight.position.set(
        planeGroup.position.x - 1.0,
        planeGroup.position.y,
        planeGroup.position.z + 0.5
      );

      renderer.render(scene, camera);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [telemetryRef]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden="true"
    />
  );
};
