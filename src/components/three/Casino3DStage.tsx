import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as THREE from 'three';
import type { GameEngineType } from '../../types';
import { addCasinoStudioLights, setupStudioEnvironment } from './casinoMaterials';
import { buildCardsScene, buildMinesScene, buildSlotsScene } from './scenesCardsMinesSlots';
import {
  buildCoinScene,
  buildDiceScene,
  buildWheelScene,
  type CasinoSceneController,
} from './scenesWheelDiceCoin';

export interface Casino3DStageHandle {
  startSpin: () => void;
  settleOutcome: (isWin: boolean, choice: string) => void;
  getVisualDetail: () => string;
}

interface Casino3DStageProps {
  engine: GameEngineType;
  onSelectMinesChest?: (chestLabel: string) => void;
}

export const Casino3DStage = React.forwardRef<Casino3DStageHandle, Casino3DStageProps>(
  ({ engine, onSelectMinesChest }, ref) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const controllerRef = useRef<CasinoSceneController | null>(null);
    const onSelectChestRef = useRef(onSelectMinesChest);
    const [contextLost, setContextLost] = useState(false);

    useEffect(() => {
      onSelectChestRef.current = onSelectMinesChest;
    }, [onSelectMinesChest]);

    useImperativeHandle(ref, () => ({
      startSpin: () => controllerRef.current?.startSpin(),
      settleOutcome: (isWin: boolean, choice: string) =>
        controllerRef.current?.settleOutcome(isWin, choice),
      getVisualDetail: () => controllerRef.current?.getVisualDetail() || 'Round completed',
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const width = Math.max(container.clientWidth, 300);
      const height = Math.max(container.clientHeight, 260);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x061024);
      scene.fog = new THREE.FogExp2(0x061024, 0.042);

      const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 60);
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const studio = setupStudioEnvironment(renderer, scene);
      addCasinoStudioLights(scene, studio.isSoftwareGl);

      let controller: CasinoSceneController;
      if (engine === 'wheel') {
        controller = buildWheelScene(scene, studio.maxAnisotropy, studio.isSoftwareGl);
      } else if (engine === 'dice') {
        controller = buildDiceScene(scene, studio.maxAnisotropy, studio.isSoftwareGl);
      } else if (engine === 'coin') {
        controller = buildCoinScene(scene, studio.maxAnisotropy, studio.isSoftwareGl);
      } else if (engine === 'cards') {
        controller = buildCardsScene(scene, studio.maxAnisotropy, studio.isSoftwareGl);
      } else if (engine === 'mines') {
        controller = buildMinesScene(scene, studio.maxAnisotropy, studio.isSoftwareGl);
      } else {
        controller = buildSlotsScene(scene, studio.maxAnisotropy, studio.isSoftwareGl);
      }

      controllerRef.current = controller;
      camera.position.copy(controller.cameraPos);
      camera.lookAt(controller.cameraLookAt);

      // Pointer parallax & Mines 3D chest raycasting
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let targetParallaxX = 0;
      let targetParallaxY = 0;
      let curParallaxX = 0;
      let curParallaxY = 0;
      let lastHoverCheck = 0;

      const updatePointer = (clientX: number, clientY: number) => {
        const rect = renderer.domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        targetParallaxX = THREE.MathUtils.clamp(pointer.x * 0.55, -0.65, 0.65);
        targetParallaxY = THREE.MathUtils.clamp(pointer.y * 0.28, -0.35, 0.35);
      };

      const handlePointerMove = (e: PointerEvent) => {
        updatePointer(e.clientX, e.clientY);
        const targets = controller.getRaycastTargets?.();
        if (targets && targets.length > 0 && controller.onHoverObject) {
          const now = performance.now();
          if (now - lastHoverCheck < 45) return;
          lastHoverCheck = now;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(targets, false);
          controller.onHoverObject(hits.length > 0 ? hits[0].object : null);
          renderer.domElement.style.cursor = hits.length > 0 ? 'pointer' : 'grab';
        }
      };

      const handlePointerLeave = () => {
        targetParallaxX = 0;
        targetParallaxY = 0;
        controller.onHoverObject?.(null);
      };

      const handlePointerDown = (e: PointerEvent) => {
        updatePointer(e.clientX, e.clientY);
        const targets = controller.getRaycastTargets?.();
        if (targets && targets.length > 0 && controller.onSelectObject) {
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(targets, false);
          if (hits.length > 0) {
            const label = controller.onSelectObject(hits[0].object);
            if (label && onSelectChestRef.current) {
              onSelectChestRef.current(label);
            }
          }
        }
      };

      renderer.domElement.addEventListener('pointermove', handlePointerMove);
      renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.addEventListener('pointerdown', handlePointerDown);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const handleContextRestored = () => {
        setContextLost(false);
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const w = Math.max(entry.contentRect.width, 280);
        const h = Math.max(entry.contentRect.height, 240);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      resizeObserver.observe(container);

      const clock = new THREE.Clock();
      let disposed = false;
      let rafId = 0;
      let timerId: number | undefined;

      const afterDraw = (fn: () => void) => {
        if (disposed) return;
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (gl && typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const check = () => {
            if (disposed) {
              if (sync) gl.deleteSync(sync);
              return;
            }
            const res = sync ? gl.clientWaitSync(sync, 0, 0) : gl.ALREADY_SIGNALED;
            if (res === gl.TIMEOUT_EXPIRED) {
              timerId = window.setTimeout(check, 24);
            } else {
              if (sync) gl.deleteSync(sync);
              timerId = window.setTimeout(fn, 70);
            }
          };
          timerId = window.setTimeout(check, 24);
        } else {
          timerId = window.setTimeout(fn, 80);
        }
      };

      const renderFrame = () => {
        if (disposed) return;
        const dt = Math.min(clock.getDelta(), 0.05);
        const elapsed = clock.elapsedTime;

        controller.update(dt, elapsed);

        curParallaxX = THREE.MathUtils.damp(curParallaxX, targetParallaxX, 6.5, dt);
        curParallaxY = THREE.MathUtils.damp(curParallaxY, targetParallaxY, 6.5, dt);
        camera.position.set(
          controller.cameraPos.x + curParallaxX,
          controller.cameraPos.y + curParallaxY,
          controller.cameraPos.z,
        );
        camera.lookAt(controller.cameraLookAt);

        renderer.render(scene, camera);

        if (studio.isSoftwareGl) {
          afterDraw(renderFrame);
        } else {
          rafId = requestAnimationFrame(renderFrame);
        }
      };

      renderFrame();

      return () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        if (timerId !== undefined) clearTimeout(timerId);
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
        renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
        controller.dispose();
        controllerRef.current = null;
        studio.disposeEnv();
        renderer.dispose();
        if (renderer.domElement.parentNode === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }, [engine]);

    return (
      <div className="relative w-full h-[290px] sm:h-[340px] rounded-2xl overflow-hidden border border-blue-800/70 bg-[#061024] shadow-inner">
        <div ref={mountRef} className="w-full h-full touch-none select-none" />

        {/* Corner interactive badge (no backdrop-blur over WebGL canvas) */}
        <div className="pointer-events-none absolute top-2.5 left-2.5 px-2.5 py-1 rounded-lg bg-[#071126]/90 border border-blue-700/60 text-[10px] font-bold tracking-wide text-amber-300 uppercase">
          3D Physics Engine
        </div>

        {engine === 'mines' && (
          <div className="pointer-events-none absolute bottom-2.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-lg bg-[#071126]/90 border border-blue-700/60 text-[11px] text-blue-200 whitespace-nowrap">
            Tap any 3D Chest directly to open
          </div>
        )}

        {contextLost && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#061024]/95 text-xs text-slate-300 p-4 text-center">
            Restoring 3D graphics context...
          </div>
        )}
      </div>
    );
  },
);

Casino3DStage.displayName = 'Casino3DStage';
