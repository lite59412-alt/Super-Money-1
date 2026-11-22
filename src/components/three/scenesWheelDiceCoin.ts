import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { casinoAudio } from '../../lib/casinoAudio';
import {
  addCasinoTableBase,
  createCoinFaceTexture,
  createContactShadowTexture,
  createDiceFaceTexture,
  createWheelTexture,
} from './casinoMaterials';

export interface CasinoSceneController {
  cameraPos: THREE.Vector3;
  cameraLookAt: THREE.Vector3;
  startSpin: () => void;
  settleOutcome: (isWin: boolean, choice: string) => void;
  update: (dt: number, elapsed: number) => void;
  getVisualDetail: () => string;
  getRaycastTargets?: () => THREE.Object3D[];
  onHoverObject?: (obj: THREE.Object3D | null) => void;
  onSelectObject?: (obj: THREE.Object3D) => string | null;
  dispose: () => void;
}

// ---------------------------------------------------------------------------
// 1. LUCKY SPIN WHEEL (3D Pedestal, Pegs, Spring-Physics Clapper & Inertia)
// ---------------------------------------------------------------------------
export function buildWheelScene(
  scene: THREE.Scene,
  anisotropy: number,
  isSoftwareGl: boolean,
): CasinoSceneController {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  track(addCasinoTableBase(scene, anisotropy, 6.2));

  const root = new THREE.Group();
  root.position.set(0, 0, -0.15);
  scene.add(root);

  // Contact shadow under wheel stand
  const shadowTex = track(createContactShadowTexture());
  const shadowPlane = new THREE.Mesh(
    track(new THREE.PlaneGeometry(4.4, 2.4)),
    track(
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    ),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.set(0, 0.015, 0);
  root.add(shadowPlane);

  const woodMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x3b180e,
      roughness: 0.34,
      metalness: 0.08,
      clearcoat: 0.6,
    }),
  );
  const goldMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.9,
      roughness: 0.2,
    }),
  );
  const darkMetalMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.32,
    }),
  );

  // Mahogany pedestal base
  const basePlate = new THREE.Mesh(track(new RoundedBoxGeometry(2.8, 0.24, 1.5, 3, 0.06)), woodMat);
  basePlate.position.set(0, 0.12, 0);
  basePlate.castShadow = !isSoftwareGl;
  basePlate.receiveShadow = true;
  root.add(basePlate);

  // Two angled A-frame uprights
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(track(new RoundedBoxGeometry(0.2, 2.15, 0.26, 2, 0.04)), woodMat);
    leg.position.set(side * 0.62, 1.15, -0.34);
    leg.rotation.z = side * 0.14;
    leg.castShadow = !isSoftwareGl;
    root.add(leg);
  }

  // Wheel carriage tilted back for dramatic 3D perspective
  const wheelCarriage = new THREE.Group();
  wheelCarriage.position.set(0, 2.15, 0.05);
  wheelCarriage.rotation.x = -0.18;
  root.add(wheelCarriage);

  const wheelSpinGroup = new THREE.Group();
  wheelCarriage.add(wheelSpinGroup);

  const wheelRadius = 1.65;
  const wheelTex = track(createWheelTexture(anisotropy));

  const backingMesh = new THREE.Mesh(
    track(new THREE.CylinderGeometry(wheelRadius + 0.08, wheelRadius + 0.08, 0.16, 48)),
    darkMetalMat,
  );
  backingMesh.rotation.x = Math.PI / 2;
  backingMesh.position.z = -0.09;
  backingMesh.castShadow = !isSoftwareGl;
  wheelSpinGroup.add(backingMesh);

  const faceMesh = new THREE.Mesh(
    track(new THREE.CircleGeometry(wheelRadius, 64)),
    track(
      new THREE.MeshStandardMaterial({
        map: wheelTex,
        roughness: 0.32,
        metalness: 0.14,
      }),
    ),
  );
  faceMesh.position.z = 0.005;
  wheelSpinGroup.add(faceMesh);

  const rimTorus = new THREE.Mesh(
    track(new THREE.TorusGeometry(wheelRadius + 0.04, 0.08, 16, 64)),
    goldMat,
  );
  rimTorus.position.z = 0.01;
  rimTorus.castShadow = !isSoftwareGl;
  wheelSpinGroup.add(rimTorus);

  const pegGeo = track(new THREE.CylinderGeometry(0.036, 0.036, 0.14, 12));
  const step = (Math.PI * 2) / 12;
  for (let i = 0; i < 12; i++) {
    const angle = Math.PI / 2 - (i + 0.5) * step;
    const peg = new THREE.Mesh(pegGeo, goldMat);
    peg.rotation.x = Math.PI / 2;
    peg.position.set(Math.cos(angle) * (wheelRadius - 0.02), Math.sin(angle) * (wheelRadius - 0.02), 0.06);
    wheelSpinGroup.add(peg);
  }

  const hubCap = new THREE.Mesh(track(new THREE.CylinderGeometry(0.24, 0.3, 0.18, 24)), goldMat);
  hubCap.rotation.x = Math.PI / 2;
  hubCap.position.z = 0.07;
  wheelSpinGroup.add(hubCap);

  // Spring-hinged brass clapper/pointer at 12 o'clock
  const clapperPivot = new THREE.Group();
  clapperPivot.position.set(0, wheelRadius + 0.22, 0.09);
  wheelCarriage.add(clapperPivot);

  const clapperMount = new THREE.Mesh(track(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 16)), darkMetalMat);
  clapperMount.rotation.x = Math.PI / 2;
  clapperPivot.add(clapperMount);

  const pointerShape = new THREE.Shape();
  pointerShape.moveTo(-0.1, 0);
  pointerShape.lineTo(0.1, 0);
  pointerShape.lineTo(0, -0.4);
  pointerShape.closePath();
  const pointerGeo = track(
    new THREE.ExtrudeGeometry(pointerShape, {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
    }),
  );
  const pointerMesh = new THREE.Mesh(pointerGeo, goldMat);
  pointerMesh.position.z = -0.03;
  clapperPivot.add(pointerMesh);

  let state: 'idle' | 'spinning' | 'settling' | 'done' = 'idle';
  let angle = 0;
  let angularSpeed = 0.25;
  let settleElapsed = 0;
  const settleDuration = 2.4;
  let startAngle = 0;
  let targetAngle = 0;
  let lastPegBucket = 0;
  let clapperAngle = 0;
  let clapperVel = 0;
  let landedLabel = 'Sapphire #1';

  return {
    cameraPos: new THREE.Vector3(0, 2.65, 4.9),
    cameraLookAt: new THREE.Vector3(0, 2.0, 0),
    startSpin: () => {
      // Normalize angle cleanly to prevent float precision drift over many rounds
      angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      state = 'spinning';
      lastPegBucket = Math.floor(angle / step + 0.5);
    },
    settleOutcome: (isWin: boolean, choice: string) => {
      const wantSapphire = isWin ? choice === 'Sapphire' : choice !== 'Sapphire';
      const candidateIndices = wantSapphire ? [0, 2, 4, 6, 8, 10] : [1, 3, 5, 7, 9, 11];
      const chosenIdx = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
      landedLabel = `${wantSapphire ? 'Sapphire' : 'Gold'} #${chosenIdx + 1}`;

      const desiredRemainder = chosenIdx * step;
      // Match initial deceleration speed closely to spinning angular velocity (~15 rad/s)
      const baseTurns = Math.ceil(angle / (Math.PI * 2)) * (Math.PI * 2) + Math.PI * 2 * 3;
      const jitter = (Math.random() - 0.5) * (step * 0.36);
      startAngle = angle;
      targetAngle = baseTurns + desiredRemainder + jitter;
      settleElapsed = 0;
      state = 'settling';
    },
    update: (dt: number) => {
      if (state === 'idle') {
        angularSpeed = THREE.MathUtils.damp(angularSpeed, 0.25, 4, dt);
        angle += dt * angularSpeed;
      } else if (state === 'spinning') {
        angularSpeed = THREE.MathUtils.damp(angularSpeed, 15.2, 6, dt);
        angle += dt * angularSpeed;
      } else if (state === 'settling') {
        settleElapsed += dt;
        const t = Math.min(1, settleElapsed / settleDuration);
        const eased = 1 - Math.pow(1 - t, 3.6);
        angle = THREE.MathUtils.lerp(startAngle, targetAngle, eased);
        if (t >= 1) {
          angle = targetAngle;
          angularSpeed = 0;
          state = 'done';
        }
      }

      wheelSpinGroup.rotation.z = angle;

      // Physical spring-damper clapper kick when a rim peg crosses 12 o'clock
      const pegBucket = Math.floor(angle / step + 0.5);
      if (pegBucket !== lastPegBucket) {
        lastPegBucket = pegBucket;
        if (state === 'spinning' || state === 'settling') {
          clapperAngle = Math.max(clapperAngle - 0.42, -0.58);
          clapperVel = -1.6;
          casinoAudio.playPegTick(state === 'settling' ? 0.92 : 1.08);
        }
      }
      const springForce = -240 * clapperAngle - 18 * clapperVel;
      clapperVel += springForce * dt;
      clapperAngle += clapperVel * dt;
      clapperPivot.rotation.z = THREE.MathUtils.clamp(clapperAngle, -0.68, 0.22);
    },
    getVisualDetail: () => `Wheel landed on ${landedLabel}`,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

// ---------------------------------------------------------------------------
// 2. DICE ROLL DUEL (Two 3D Rounded Casino Dice, Smooth Arc Launch & Roll)
// ---------------------------------------------------------------------------
export function buildDiceScene(
  scene: THREE.Scene,
  anisotropy: number,
  isSoftwareGl: boolean,
): CasinoSceneController {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  track(addCasinoTableBase(scene, anisotropy, 6.0));

  const root = new THREE.Group();
  scene.add(root);

  const dieSize = 0.94;
  const half = dieSize / 2;
  const shadowTex = track(createContactShadowTexture());

  const makeDie = (accent: 'sapphire' | 'gold', restX: number) => {
    const faceOrder: (1 | 2 | 3 | 4 | 5 | 6)[] = [3, 4, 6, 1, 2, 5];
    const mats = faceOrder.map((val) =>
      track(
        new THREE.MeshPhysicalMaterial({
          map: track(createDiceFaceTexture(val, accent, anisotropy)),
          roughness: 0.18,
          metalness: 0.05,
          clearcoat: 0.9,
          clearcoatRoughness: 0.08,
        }),
      ),
    );
    const geo = track(new RoundedBoxGeometry(dieSize, dieSize, dieSize, 4, 0.13));
    const mesh = new THREE.Mesh(geo, mats);
    mesh.castShadow = !isSoftwareGl;
    mesh.position.set(restX, half, 0);
    root.add(mesh);

    const shadow = new THREE.Mesh(
      track(new THREE.PlaneGeometry(1.5, 1.5)),
      track(
        new THREE.MeshBasicMaterial({
          map: shadowTex,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
        }),
      ),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(restX, 0.015, 0);
    root.add(shadow);

    return { mesh, shadow, restX };
  };

  const dieA = makeDie('sapphire', -0.92);
  const dieB = makeDie('gold', 0.92);
  const diceMeshes = [dieA, dieB];

  const scratchUp = new THREE.Vector3(0, 1, 0);
  const scratchEuler = new THREE.Euler();

  function getQuaternionForTopFace(face: 1 | 2 | 3 | 4 | 5 | 6, yaw: number): THREE.Quaternion {
    const qBase = new THREE.Quaternion();
    if (face === 6) scratchEuler.set(0, 0, 0);
    else if (face === 1) scratchEuler.set(Math.PI, 0, 0);
    else if (face === 2) scratchEuler.set(-Math.PI / 2, 0, 0);
    else if (face === 5) scratchEuler.set(Math.PI / 2, 0, 0);
    else if (face === 3) scratchEuler.set(0, 0, Math.PI / 2);
    else scratchEuler.set(0, 0, -Math.PI / 2);
    qBase.setFromEuler(scratchEuler);
    const qYaw = new THREE.Quaternion().setFromAxisAngle(scratchUp, yaw);
    return qYaw.multiply(qBase);
  }

  let state: 'idle' | 'spinning' | 'settling' | 'done' = 'idle';
  let settleElapsed = 0;
  const settleDuration = 1.65;

  const dieState = [
    {
      targetFace: 5 as 1 | 2 | 3 | 4 | 5 | 6,
      targetQuat: getQuaternionForTopFace(5, 0.2),
      slerpStartQuat: new THREE.Quaternion(),
      slerpCaptured: false,
      startPos: new THREE.Vector3(-0.92, half, 0),
      targetPos: new THREE.Vector3(-0.92, half, 0.15),
      spinAxis: new THREE.Vector3(1, 0.6, 0.4).normalize(),
      bouncesPlayed: 0,
    },
    {
      targetFace: 4 as 1 | 2 | 3 | 4 | 5 | 6,
      targetQuat: getQuaternionForTopFace(4, -0.35),
      slerpStartQuat: new THREE.Quaternion(),
      slerpCaptured: false,
      startPos: new THREE.Vector3(0.92, half, 0),
      targetPos: new THREE.Vector3(0.92, half, -0.15),
      spinAxis: new THREE.Vector3(-0.5, 0.8, 0.7).normalize(),
      bouncesPlayed: 0,
    },
  ];

  dieA.mesh.quaternion.copy(dieState[0].targetQuat);
  dieB.mesh.quaternion.copy(dieState[1].targetQuat);

  let visualDetail = 'Dice ready on table';

  const pickPairForSum = (wantHigh: boolean): [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6] => {
    const highPairs: [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6][] = [
      [3, 4], [4, 4], [3, 5], [4, 5], [5, 5], [6, 3], [6, 4], [6, 5], [6, 6], [2, 6],
    ];
    const lowPairs: [1 | 2 | 3 | 4 | 5 | 6, 1 | 2 | 3 | 4 | 5 | 6][] = [
      [1, 1], [1, 2], [2, 2], [2, 3], [1, 4], [3, 3], [2, 4], [1, 5],
    ];
    const pool = wantHigh ? highPairs : lowPairs;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  return {
    cameraPos: new THREE.Vector3(0, 3.6, 4.2),
    cameraLookAt: new THREE.Vector3(0, 0.45, 0),
    startSpin: () => {
      state = 'spinning';
      dieState[0].bouncesPlayed = 0;
      dieState[1].bouncesPlayed = 0;
      dieState[0].slerpCaptured = false;
      dieState[1].slerpCaptured = false;
      casinoAudio.playDiceBounce(0.7);
    },
    settleOutcome: (isWin: boolean, choice: string) => {
      const targetHigh = choice.includes('High');
      const wantHigh = isWin ? targetHigh : !targetHigh;
      const [f1, f2] = pickPairForSum(wantHigh);
      const sum = f1 + f2;
      visualDetail = `Dice rolled ${f1} + ${f2} = ${sum} (${sum >= 7 ? 'High' : 'Low'})`;

      dieState[0].targetFace = f1;
      dieState[1].targetFace = f2;
      dieState[0].targetQuat = getQuaternionForTopFace(f1, (Math.random() - 0.5) * 0.65);
      dieState[1].targetQuat = getQuaternionForTopFace(f2, (Math.random() - 0.5) * 0.65);
      dieState[0].targetPos.set(-0.9 - Math.random() * 0.25, half, (Math.random() - 0.5) * 0.5);
      dieState[1].targetPos.set(0.9 + Math.random() * 0.25, half, (Math.random() - 0.5) * 0.5);
      dieState[0].startPos.copy(dieA.mesh.position);
      dieState[1].startPos.copy(dieB.mesh.position);
      dieState[0].bouncesPlayed = 0;
      dieState[1].bouncesPlayed = 0;
      dieState[0].slerpCaptured = false;
      dieState[1].slerpCaptured = false;
      settleElapsed = 0;
      state = 'settling';
    },
    update: (dt: number, elapsed: number) => {
      if (state === 'idle') {
        dieA.mesh.position.y = half + Math.sin(elapsed * 2.1) * 0.02;
        dieB.mesh.position.y = half + Math.sin(elapsed * 2.1 + 1.2) * 0.02;
      } else if (state === 'spinning') {
        for (let idx = 0; idx < 2; idx++) {
          const d = diceMeshes[idx];
          const st = dieState[idx];
          const tx = d.restX + Math.sin(elapsed * 7.5 + idx * 2) * 0.28;
          const ty = 1.75 + Math.sin(elapsed * 9.5 + idx) * 0.32;
          const tz = Math.cos(elapsed * 6.8 + idx) * 0.25;
          // Smooth damp launch instead of instantaneous teleport
          d.mesh.position.x = THREE.MathUtils.damp(d.mesh.position.x, tx, 10, dt);
          d.mesh.position.y = THREE.MathUtils.damp(d.mesh.position.y, ty, 10, dt);
          d.mesh.position.z = THREE.MathUtils.damp(d.mesh.position.z, tz, 10, dt);
          d.mesh.rotateOnAxis(st.spinAxis, dt * 14.5);
          d.shadow.position.set(d.mesh.position.x, 0.015, d.mesh.position.z);
          const scale = Math.max(0.55, 1.1 - d.mesh.position.y * 0.22);
          d.shadow.scale.setScalar(scale);
          (d.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(
            0.28,
            0.74 - (d.mesh.position.y - half) * 0.24,
          );
        }
      } else if (state === 'settling') {
        settleElapsed += dt;
        const t = Math.min(1, settleElapsed / settleDuration);

        for (let idx = 0; idx < 2; idx++) {
          const d = diceMeshes[idx];
          const st = dieState[idx];
          const phase = Math.min(1, t * (idx === 0 ? 1.0 : 0.95));

          let h = 0;
          let bounceIdx = 3;
          const launchH = Math.max(0.4, st.startPos.y - half);
          if (phase < 0.45) {
            const u = phase / 0.45;
            h = Math.sin(u * Math.PI) * 1.15 + (1 - u) * launchH;
            bounceIdx = 0;
          } else if (phase < 0.74) {
            const u = (phase - 0.45) / 0.29;
            h = Math.sin(u * Math.PI) * 0.58;
            bounceIdx = 1;
          } else if (phase < 0.92) {
            const u = (phase - 0.74) / 0.18;
            h = Math.sin(u * Math.PI) * 0.18;
            bounceIdx = 2;
          }

          if (bounceIdx > st.bouncesPlayed && bounceIdx <= 3) {
            st.bouncesPlayed = bounceIdx;
            casinoAudio.playDiceBounce(1 / bounceIdx);
          }

          const posAlpha = Math.min(1, 1 - Math.pow(1 - phase, 2.2));
          d.mesh.position.x = THREE.MathUtils.lerp(st.startPos.x, st.targetPos.x, posAlpha);
          d.mesh.position.z = THREE.MathUtils.lerp(st.startPos.z, st.targetPos.z, posAlpha);
          d.mesh.position.y = half + h;

          if (phase < 0.62) {
            d.mesh.rotateOnAxis(st.spinAxis, dt * (12 * (1 - phase * 0.7)));
          } else {
            if (!st.slerpCaptured) {
              st.slerpStartQuat.copy(d.mesh.quaternion);
              st.slerpCaptured = true;
            }
            const u = Math.min(1, (phase - 0.62) / 0.34);
            const smoothU = u * u * (3 - 2 * u);
            d.mesh.quaternion.slerpQuaternions(st.slerpStartQuat, st.targetQuat, smoothU);
          }

          d.shadow.position.set(d.mesh.position.x, 0.015, d.mesh.position.z);
          const s = Math.max(0.55, 1.05 - h * 0.24);
          d.shadow.scale.setScalar(s);
          (d.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.28, 0.74 - h * 0.25);
        }

        if (t >= 1) {
          dieA.mesh.quaternion.copy(dieState[0].targetQuat);
          dieB.mesh.quaternion.copy(dieState[1].targetQuat);
          dieA.mesh.position.y = half;
          dieB.mesh.position.y = half;
          state = 'done';
        }
      }
    },
    getVisualDetail: () => visualDetail,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}

// ---------------------------------------------------------------------------
// 3. COIN FLIP ROYALE (3D Embossed Medallion Coin, Smooth Arc Flip & Wobble)
// ---------------------------------------------------------------------------
export function buildCoinScene(
  scene: THREE.Scene,
  anisotropy: number,
  isSoftwareGl: boolean,
): CasinoSceneController {
  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  track(addCasinoTableBase(scene, anisotropy, 6.0));

  const root = new THREE.Group();
  scene.add(root);

  const podiumGold = track(
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 }),
  );
  const podiumVelvet = track(
    new THREE.MeshPhysicalMaterial({ color: 0x0f172a, roughness: 0.88, sheen: 0.7 }),
  );
  const podiumRim = new THREE.Mesh(track(new THREE.CylinderGeometry(1.45, 1.62, 0.18, 48)), podiumGold);
  podiumRim.position.y = 0.09;
  podiumRim.receiveShadow = true;
  root.add(podiumRim);

  const podiumPad = new THREE.Mesh(track(new THREE.CylinderGeometry(1.3, 1.3, 0.2, 48)), podiumVelvet);
  podiumPad.position.y = 0.1;
  podiumPad.receiveShadow = true;
  root.add(podiumPad);

  const shadowTex = track(createContactShadowTexture());
  const shadow = new THREE.Mesh(
    track(new THREE.PlaneGeometry(2.4, 2.4)),
    track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.7, depthWrite: false })),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.21;
  root.add(shadow);

  const coinGroup = new THREE.Group();
  const coinRestY = 0.3;
  coinGroup.position.set(0, coinRestY, 0);
  root.add(coinGroup);

  const coinR = 1.02;
  const coinThick = 0.14;
  const edgeMesh = new THREE.Mesh(
    track(new THREE.CylinderGeometry(coinR, coinR, coinThick, 64)),
    podiumGold,
  );
  edgeMesh.castShadow = !isSoftwareGl;
  coinGroup.add(edgeMesh);

  for (const dir of [-1, 1]) {
    const rim = new THREE.Mesh(track(new THREE.TorusGeometry(coinR - 0.02, 0.045, 12, 64)), podiumGold);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = dir * (coinThick / 2);
    coinGroup.add(rim);
  }

  const headsTex = track(createCoinFaceTexture('HEADS', anisotropy));
  const tailsTex = track(createCoinFaceTexture('TAILS', anisotropy));

  const headsFace = new THREE.Mesh(
    track(new THREE.CircleGeometry(coinR - 0.04, 48)),
    track(new THREE.MeshStandardMaterial({ map: headsTex, metalness: 0.65, roughness: 0.25 })),
  );
  headsFace.rotation.x = -Math.PI / 2;
  headsFace.position.y = coinThick / 2 + 0.005;
  coinGroup.add(headsFace);

  const tailsFace = new THREE.Mesh(
    track(new THREE.CircleGeometry(coinR - 0.04, 48)),
    track(new THREE.MeshStandardMaterial({ map: tailsTex, metalness: 0.6, roughness: 0.28 })),
  );
  tailsFace.rotation.x = Math.PI / 2;
  tailsFace.position.y = -(coinThick / 2 + 0.005);
  coinGroup.add(tailsFace);

  let state: 'idle' | 'spinning' | 'settling' | 'done' = 'idle';
  let rotX = 0;
  let startRotX = 0;
  let targetRotX = 0;
  let settleStartH = 1.85;
  let settleElapsed = 0;
  const settleDuration = 1.75;
  let landedSide: 'Heads' | 'Tails' = 'Heads';
  let ringPlayed = false;

  return {
    cameraPos: new THREE.Vector3(0, 3.25, 3.85),
    cameraLookAt: new THREE.Vector3(0, 0.45, 0),
    startSpin: () => {
      rotX = ((rotX % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      state = 'spinning';
      ringPlayed = false;
      casinoAudio.playCoinLaunch();
    },
    settleOutcome: (isWin: boolean, choice: string) => {
      const wantHeads = isWin ? choice === 'Heads' : choice !== 'Heads';
      landedSide = wantHeads ? 'Heads' : 'Tails';
      startRotX = rotX;
      settleStartH = Math.max(1.2, coinGroup.position.y - coinRestY);
      const baseTurns = Math.ceil(rotX / (Math.PI * 2)) * (Math.PI * 2) + Math.PI * 2 * 4;
      targetRotX = wantHeads ? baseTurns : baseTurns + Math.PI;
      settleElapsed = 0;
      state = 'settling';
    },
    update: (dt: number, elapsed: number) => {
      if (state === 'idle') {
        coinGroup.position.y = coinRestY + Math.sin(elapsed * 2.2) * 0.03;
        coinGroup.rotation.y = Math.sin(elapsed * 0.9) * 0.25;
        coinGroup.rotation.z = THREE.MathUtils.damp(coinGroup.rotation.z, 0, 8, dt);
      } else if (state === 'spinning') {
        rotX += dt * 19.5;
        coinGroup.rotation.x = rotX;
        coinGroup.rotation.y = Math.sin(elapsed * 6) * 0.18;
        coinGroup.rotation.z = THREE.MathUtils.damp(coinGroup.rotation.z, 0, 10, dt);
        const targetY = 2.05 + Math.sin(elapsed * 11) * 0.22;
        coinGroup.position.y = THREE.MathUtils.damp(coinGroup.position.y, targetY, 9, dt);
        const h = Math.max(0, coinGroup.position.y - coinRestY);
        shadow.scale.setScalar(Math.max(0.5, 1.0 - h * 0.2));
        (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 0.72 - h * 0.2);
      } else if (state === 'settling') {
        settleElapsed += dt;
        const t = Math.min(1, settleElapsed / settleDuration);
        const eased = 1 - Math.pow(1 - t, 3.2);
        rotX = THREE.MathUtils.lerp(startRotX, targetRotX, eased);
        coinGroup.rotation.x = rotX;
        coinGroup.rotation.y = THREE.MathUtils.damp(coinGroup.rotation.y, 0, 8, dt);

        // Seamless descent from current hover height + crisp metallic bounce + micro wobble
        let heightOffset = 0;
        if (t < 0.76) {
          const u = t / 0.76;
          heightOffset = (1 - u * u) * settleStartH + Math.sin(u * Math.PI) * 0.35;
          coinGroup.rotation.z = THREE.MathUtils.damp(coinGroup.rotation.z, 0, 10, dt);
        } else {
          if (!ringPlayed) {
            ringPlayed = true;
            casinoAudio.playCoinRing();
          }
          const u = (t - 0.76) / 0.24;
          heightOffset = Math.sin(u * Math.PI) * 0.22 * (1 - u * 0.45);
          coinGroup.rotation.z = Math.sin(u * Math.PI * 3) * 0.12 * (1 - u);
        }
        coinGroup.position.y = coinRestY + heightOffset;
        shadow.scale.setScalar(Math.max(0.5, 1.0 - heightOffset * 0.2));
        (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.25, 0.72 - heightOffset * 0.2);

        if (t >= 1) {
          coinGroup.position.y = coinRestY;
          coinGroup.rotation.x = targetRotX;
          coinGroup.rotation.z = 0;
          state = 'done';
        }
      }
    },
    getVisualDetail: () => `Coin landed on ${landedSide}!`,
    dispose: () => {
      disposables.forEach((d) => d.dispose());
    },
  };
}
