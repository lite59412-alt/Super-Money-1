import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { casinoAudio } from '../../lib/casinoAudio';
import {
  addCasinoTableBase,
  createCardBackTexture,
  createCardFrontTexture,
  createContactShadowTexture,
  createSlotReelTexture,
  SLOT_SYMBOLS,
} from './casinoMaterials';
import type { CasinoSceneController } from './scenesWheelDiceCoin';

// ---------------------------------------------------------------------------
// 4. LUCKY 7 CARDS (3D Mahogany Dealing Shoe, Seamless Arc Glide & 180° Flip)
// ---------------------------------------------------------------------------
export function buildCardsScene(
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

  const shoeMat = track(
    new THREE.MeshPhysicalMaterial({ color: 0x3b180e, roughness: 0.32, clearcoat: 0.65 }),
  );
  const brassMat = track(
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.88, roughness: 0.22 }),
  );
  const shoeGroup = new THREE.Group();
  shoeGroup.position.set(-2.15, 0.34, -0.35);
  shoeGroup.rotation.y = 0.35;
  root.add(shoeGroup);

  const shoeBody = new THREE.Mesh(track(new RoundedBoxGeometry(1.1, 0.68, 1.55, 3, 0.05)), shoeMat);
  shoeBody.castShadow = !isSoftwareGl;
  shoeGroup.add(shoeBody);

  const deckBlock = new THREE.Mesh(
    track(new RoundedBoxGeometry(0.88, 0.42, 1.25, 2, 0.02)),
    track(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 })),
  );
  deckBlock.position.set(0, 0.22, 0.08);
  shoeGroup.add(deckBlock);

  const shoeLip = new THREE.Mesh(track(new RoundedBoxGeometry(1.14, 0.08, 0.16, 2, 0.02)), brassMat);
  shoeLip.position.set(0, -0.24, 0.78);
  shoeGroup.add(shoeLip);

  const padMat = track(
    new THREE.MeshStandardMaterial({ color: 0x172554, roughness: 0.85, metalness: 0.05 }),
  );
  const padBorder = new THREE.Mesh(track(new RoundedBoxGeometry(2.25, 0.04, 2.95, 2, 0.02)), brassMat);
  padBorder.position.set(0.25, 0.02, 0.15);
  root.add(padBorder);

  const padInner = new THREE.Mesh(track(new RoundedBoxGeometry(2.12, 0.045, 2.82, 2, 0.02)), padMat);
  padInner.position.set(0.25, 0.024, 0.15);
  padInner.receiveShadow = true;
  root.add(padInner);

  const shadowTex = track(createContactShadowTexture());
  const cardShadow = new THREE.Mesh(
    track(new THREE.PlaneGeometry(2.1, 2.8)),
    track(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.65, depthWrite: false })),
  );
  cardShadow.rotation.x = -Math.PI / 2;
  cardShadow.position.set(0.25, 0.052, 0.15);
  root.add(cardShadow);

  const cardGroup = new THREE.Group();
  const restPos = new THREE.Vector3(0.25, 0.12, 0.15);
  cardGroup.position.copy(restPos);
  cardGroup.rotation.set(0, 0, Math.PI);
  root.add(cardGroup);

  const cardW = 1.65;
  const cardH = 2.3;
  const cardCore = new THREE.Mesh(
    track(new RoundedBoxGeometry(cardW, 0.036, cardH, 2, 0.015)),
    track(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 })),
  );
  cardCore.castShadow = !isSoftwareGl;
  cardGroup.add(cardCore);

  const backTex = track(createCardBackTexture(anisotropy));
  let activeFrontTex: THREE.CanvasTexture | null = createCardFrontTexture('A', '♠', anisotropy);
  const frontMat = track(
    new THREE.MeshStandardMaterial({
      map: activeFrontTex,
      roughness: 0.25,
      metalness: 0.05,
    }),
  );
  const backMat = track(
    new THREE.MeshStandardMaterial({
      map: backTex,
      roughness: 0.3,
      metalness: 0.08,
    }),
  );

  const frontPlane = new THREE.Mesh(track(new THREE.PlaneGeometry(cardW - 0.02, cardH - 0.02)), frontMat);
  frontPlane.rotation.x = -Math.PI / 2;
  frontPlane.position.y = 0.021;
  cardGroup.add(frontPlane);

  const backPlane = new THREE.Mesh(track(new THREE.PlaneGeometry(cardW - 0.02, cardH - 0.02)), backMat);
  backPlane.rotation.x = Math.PI / 2;
  backPlane.position.y = -0.021;
  cardGroup.add(backPlane);

  let state: 'idle' | 'spinning' | 'settling' | 'done' = 'idle';
  let settleElapsed = 0;
  const settleDuration = 1.45;
  const settleStartPos = new THREE.Vector3();
  let settleStartRotZ = Math.PI;
  let settleStartRotX = 0.2;
  let drawnCardText = 'A♠';
  let snapPlayed = false;

  return {
    cameraPos: new THREE.Vector3(0.15, 3.65, 3.4),
    cameraLookAt: new THREE.Vector3(0.05, 0.25, 0.1),
    startSpin: () => {
      state = 'spinning';
      snapPlayed = false;
      casinoAudio.playCardWhoosh();
    },
    settleOutcome: (isWin: boolean, choice: string) => {
      const targetHigh = choice.includes('High');
      const wantHigh = isWin ? targetHigh : !targetHigh;
      const highRanks = ['8', '9', '10', 'J', 'Q', 'K', 'A'];
      const lowRanks = ['2', '3', '4', '5', '6', '7'];
      const suits: ('♠' | '♥' | '♦' | '♣')[] = ['♠', '♥', '♦', '♣'];
      const rank = wantHigh
        ? highRanks[Math.floor(Math.random() * highRanks.length)]
        : lowRanks[Math.floor(Math.random() * lowRanks.length)];
      const suit = suits[Math.floor(Math.random() * suits.length)];
      drawnCardText = `${rank}${suit}`;

      // Dispose previous card texture immediately to prevent GPU VRAM leak
      const nextTex = createCardFrontTexture(rank, suit, anisotropy);
      if (activeFrontTex) activeFrontTex.dispose();
      activeFrontTex = nextTex;
      frontMat.map = nextTex;
      frontMat.needsUpdate = true;

      // Capture exact current transform so there is zero teleport jump
      settleStartPos.copy(cardGroup.position);
      settleStartRotZ = cardGroup.rotation.z;
      settleStartRotX = cardGroup.rotation.x;
      settleElapsed = 0;
      state = 'settling';
    },
    update: (dt: number, elapsed: number) => {
      if (state === 'idle') {
        cardGroup.position.y = restPos.y + Math.sin(elapsed * 2) * 0.02;
        cardGroup.rotation.z = THREE.MathUtils.damp(cardGroup.rotation.z, Math.PI, 8, dt);
        cardGroup.rotation.x = THREE.MathUtils.damp(cardGroup.rotation.x, 0, 8, dt);
      } else if (state === 'spinning') {
        // Smooth frame-rate-independent glide toward dealing hover point
        cardGroup.position.x = THREE.MathUtils.damp(cardGroup.position.x, -0.75, 8, dt);
        cardGroup.position.y = THREE.MathUtils.damp(
          cardGroup.position.y,
          1.05 + Math.sin(elapsed * 7.5) * 0.08,
          8,
          dt,
        );
        cardGroup.position.z = THREE.MathUtils.damp(cardGroup.position.z, 0.15, 8, dt);
        cardGroup.rotation.z = THREE.MathUtils.damp(
          cardGroup.rotation.z,
          Math.PI + Math.sin(elapsed * 9) * 0.16,
          10,
          dt,
        );
        cardGroup.rotation.x = THREE.MathUtils.damp(cardGroup.rotation.x, 0.24, 9, dt);
        cardShadow.position.set(cardGroup.position.x, 0.052, cardGroup.position.z);
        cardShadow.scale.setScalar(Math.max(0.58, 1.0 - (cardGroup.position.y - restPos.y) * 0.22));
      } else if (state === 'settling') {
        settleElapsed += dt;
        const t = Math.min(1, settleElapsed / settleDuration);
        const eased = 1 - Math.pow(1 - t, 3.2);

        cardGroup.position.x = THREE.MathUtils.lerp(settleStartPos.x, restPos.x, eased);
        cardGroup.position.y =
          THREE.MathUtils.lerp(settleStartPos.y, restPos.y, eased) + Math.sin(t * Math.PI) * 1.15;
        cardGroup.position.z = THREE.MathUtils.lerp(settleStartPos.z, restPos.z, eased);
        cardGroup.rotation.z = THREE.MathUtils.lerp(settleStartRotZ, 0, eased);
        cardGroup.rotation.x =
          THREE.MathUtils.lerp(settleStartRotX, 0, eased) + Math.sin(t * Math.PI) * 0.32;

        cardShadow.position.set(cardGroup.position.x, 0.052, cardGroup.position.z);
        cardShadow.scale.setScalar(Math.max(0.58, 1.0 - (cardGroup.position.y - restPos.y) * 0.22));

        if (t > 0.86 && !snapPlayed) {
          snapPlayed = true;
          casinoAudio.playCardSnap();
        }
        if (t >= 1) {
          cardGroup.position.copy(restPos);
          cardGroup.rotation.set(0, 0, 0);
          state = 'done';
        }
      }
    },
    getVisualDetail: () => `Drawn Card: ${drawnCardText}`,
    dispose: () => {
      if (activeFrontTex) {
        activeFrontTex.dispose();
        activeFrontTex = null;
      }
      disposables.forEach((d) => d.dispose());
    },
  };
}

// ---------------------------------------------------------------------------
// 5. TREASURE MINES (Interactive 3x3 3D Hinged Chests, Raycasting, Gems/Mines)
// ---------------------------------------------------------------------------
export function buildMinesScene(
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
  scene.add(root);

  const baseWoodMat = track(
    new THREE.MeshPhysicalMaterial({ color: 0x1e3a8a, roughness: 0.35, metalness: 0.15, clearcoat: 0.5 }),
  );
  const goldMat = track(
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.9, roughness: 0.2 }),
  );
  const gemMat = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.65,
      roughness: 0.08,
      metalness: 0.1,
      clearcoat: 1.0,
    }),
  );
  const mineMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      emissive: 0xe11d48,
      emissiveIntensity: 0.6,
      metalness: 0.85,
      roughness: 0.3,
    }),
  );

  interface ChestItem {
    index: number;
    label: string;
    group: THREE.Group;
    lidPivot: THREE.Group;
    gemMesh: THREE.Mesh;
    mineGroup: THREE.Group;
    hitbox: THREE.Mesh;
    padRing: THREE.Mesh;
    targetOpen: number;
    openAmt: number;
    hovered: boolean;
    revealType: 'none' | 'gem' | 'mine';
  }

  const chests: ChestItem[] = [];
  const raycastTargets: THREE.Object3D[] = [];

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const idx = row * 3 + col;
      const label = `Chest #${idx + 1}`;
      const cx = (col - 1) * 1.65;
      const cz = (row - 1) * 1.45;

      const chestGroup = new THREE.Group();
      chestGroup.position.set(cx, 0, cz);
      root.add(chestGroup);

      const padRing = new THREE.Mesh(
        track(new THREE.RingGeometry(0.45, 0.56, 32)),
        track(
          new THREE.MeshBasicMaterial({
            color: 0x3b82f6,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.45,
          }),
        ),
      );
      padRing.rotation.x = -Math.PI / 2;
      padRing.position.y = 0.02;
      chestGroup.add(padRing);

      const body = new THREE.Mesh(track(new RoundedBoxGeometry(0.9, 0.44, 0.68, 2, 0.04)), baseWoodMat);
      body.position.y = 0.24;
      body.castShadow = !isSoftwareGl;
      chestGroup.add(body);

      const clasp = new THREE.Mesh(track(new RoundedBoxGeometry(0.16, 0.18, 0.08, 2, 0.02)), goldMat);
      clasp.position.set(0, 0.38, 0.35);
      chestGroup.add(clasp);

      const lidPivot = new THREE.Group();
      lidPivot.position.set(0, 0.46, -0.32);
      chestGroup.add(lidPivot);

      const lidMesh = new THREE.Mesh(track(new RoundedBoxGeometry(0.92, 0.24, 0.68, 2, 0.06)), baseWoodMat);
      lidMesh.position.set(0, 0.1, 0.32);
      lidMesh.castShadow = !isSoftwareGl;
      lidPivot.add(lidMesh);

      const lidTrim = new THREE.Mesh(track(new RoundedBoxGeometry(0.95, 0.08, 0.14, 2, 0.02)), goldMat);
      lidTrim.position.set(0, 0.18, 0.32);
      lidPivot.add(lidTrim);

      const gemMesh = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.26, 0)), gemMat);
      gemMesh.position.set(0, 0.35, 0);
      gemMesh.visible = false;
      chestGroup.add(gemMesh);

      const mineGroup = new THREE.Group();
      mineGroup.position.set(0, 0.35, 0);
      mineGroup.visible = false;
      const mineCore = new THREE.Mesh(track(new THREE.IcosahedronGeometry(0.22, 1)), mineMat);
      mineGroup.add(mineCore);
      for (const dir of [
        [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
      ]) {
        const spike = new THREE.Mesh(track(new THREE.ConeGeometry(0.06, 0.16, 8)), goldMat);
        spike.position.set(dir[0] * 0.23, dir[1] * 0.23, dir[2] * 0.23);
        spike.lookAt(dir[0] * 1, dir[1] * 1, dir[2] * 1);
        spike.rotateX(Math.PI / 2);
        mineGroup.add(spike);
      }
      chestGroup.add(mineGroup);

      const hitbox = new THREE.Mesh(
        track(new THREE.BoxGeometry(1.15, 0.95, 0.95)),
        track(new THREE.MeshBasicMaterial({ visible: false })),
      );
      hitbox.position.y = 0.45;
      hitbox.userData.chestIdx = idx;
      chestGroup.add(hitbox);
      raycastTargets.push(hitbox);

      chests.push({
        index: idx,
        label,
        group: chestGroup,
        lidPivot,
        gemMesh,
        mineGroup,
        hitbox,
        padRing,
        targetOpen: 0,
        openAmt: 0,
        hovered: false,
        revealType: 'none',
      });
    }
  }

  let activeChestIdx = 3;
  let visualDetail = 'Select any 3D chest to open';
  let state: 'idle' | 'spinning' | 'settling' | 'done' = 'idle';
  let settleTimer = 0;

  return {
    cameraPos: new THREE.Vector3(0, 4.4, 4.8),
    cameraLookAt: new THREE.Vector3(0, 0.25, 0.1),
    getRaycastTargets: () => raycastTargets,
    onHoverObject: (obj) => {
      const hoveredIdx = obj ? (obj.userData.chestIdx as number) : -1;
      for (let i = 0; i < chests.length; i++) {
        chests[i].hovered = chests[i].index === hoveredIdx;
      }
    },
    onSelectObject: (obj) => {
      // Block clicks during BOTH spinning and settling phases
      if (state === 'spinning' || state === 'settling') return null;
      const idx = obj.userData.chestIdx as number;
      if (typeof idx !== 'number') return null;
      activeChestIdx = idx;
      return `Chest #${idx + 1}`;
    },
    startSpin: () => {
      state = 'spinning';
      settleTimer = 0;
      for (let i = 0; i < chests.length; i++) {
        const c = chests[i];
        c.targetOpen = 0;
        c.revealType = 'none';
        c.gemMesh.visible = false;
        c.mineGroup.visible = false;
      }
      casinoAudio.playChestOpen();
    },
    settleOutcome: (isWin: boolean, choice: string) => {
      const parsed = parseInt(choice.replace(/\D/g, ''), 10);
      if (!Number.isNaN(parsed) && parsed >= 1 && parsed <= 9) {
        activeChestIdx = parsed - 1;
      }
      const chosen = chests[activeChestIdx];
      chosen.targetOpen = 1;
      chosen.revealType = isWin ? 'gem' : 'mine';
      chosen.gemMesh.visible = isWin;
      chosen.mineGroup.visible = !isWin;
      chosen.gemMesh.scale.setScalar(0.1);
      chosen.mineGroup.scale.setScalar(0.1);

      // Peek 2 randomly chosen other chests as safe gems
      const others = chests.filter((c) => c.index !== activeChestIdx);
      for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
      }
      for (let i = 0; i < 2; i++) {
        const o = others[i];
        o.targetOpen = 0.65;
        o.revealType = 'gem';
        o.gemMesh.visible = true;
        o.gemMesh.scale.setScalar(0.1);
      }

      visualDetail = isWin
        ? `${chosen.label} revealed a glowing Emerald Gem!`
        : `${chosen.label} triggered a hidden Brass Mine!`;
      settleTimer = 0;
      state = 'settling';
    },
    update: (dt: number, elapsed: number) => {
      if (state === 'settling') {
        settleTimer += dt;
        if (settleTimer > 0.95) {
          state = 'done';
        }
      }

      for (let i = 0; i < chests.length; i++) {
        const c = chests[i];
        c.openAmt = THREE.MathUtils.damp(c.openAmt, c.targetOpen, 9, dt);
        c.lidPivot.rotation.x = -c.openAmt * 1.85;

        const targetY =
          state === 'spinning' && c.index === activeChestIdx
            ? 0.22 + Math.sin(elapsed * 18) * 0.055
            : c.hovered && (state === 'idle' || state === 'done')
              ? 0.14
              : 0;
        c.group.position.y = THREE.MathUtils.damp(c.group.position.y, targetY, 12, dt);

        const ringMat = c.padRing.material as THREE.MeshBasicMaterial;
        if (c.revealType === 'gem') {
          ringMat.color.setHex(0x10b981);
          ringMat.opacity = 0.85;
          const nextScale = THREE.MathUtils.damp(c.gemMesh.scale.x, 1, 10, dt);
          c.gemMesh.scale.setScalar(nextScale);
          c.gemMesh.position.y = 0.66 + Math.sin(elapsed * 3.5 + c.index) * 0.06;
          c.gemMesh.rotation.y += dt * 2.2;
        } else if (c.revealType === 'mine') {
          ringMat.color.setHex(0xf43f5e);
          ringMat.opacity = 0.9;
          const nextScale = THREE.MathUtils.damp(c.mineGroup.scale.x, 1, 10, dt);
          c.mineGroup.scale.setScalar(nextScale);
          c.mineGroup.position.y = 0.62 + Math.sin(elapsed * 6) * 0.04;
          c.mineGroup.rotation.y += dt * 1.4;
        } else {
          ringMat.color.setHex(c.hovered ? 0xfbbf24 : 0x3b82f6);
          ringMat.opacity = c.hovered ? 0.9 : 0.4;
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
// 6. SLOT JACKPOT 777 (3D Slot Cabinet, Mechanical Lever & Overshoot Reels)
// ---------------------------------------------------------------------------
export function buildSlotsScene(
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
  root.position.set(-0.1, 0, 0);
  scene.add(root);

  const navyMat = track(
    new THREE.MeshPhysicalMaterial({ color: 0x0f2757, roughness: 0.28, metalness: 0.22, clearcoat: 0.7 }),
  );
  const goldMat = track(
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.92, roughness: 0.18 }),
  );
  const chromeMat = track(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.94, roughness: 0.14 }),
  );
  const redBallMat = track(
    new THREE.MeshPhysicalMaterial({ color: 0xef4444, roughness: 0.12, clearcoat: 1.0 }),
  );

  const cabinetBase = new THREE.Mesh(track(new RoundedBoxGeometry(3.4, 2.3, 1.55, 4, 0.12)), navyMat);
  cabinetBase.position.set(0, 1.15, -0.15);
  cabinetBase.castShadow = !isSoftwareGl;
  cabinetBase.receiveShadow = true;
  root.add(cabinetBase);

  const bezelFrame = new THREE.Mesh(track(new RoundedBoxGeometry(2.95, 1.45, 0.24, 3, 0.05)), goldMat);
  bezelFrame.position.set(0, 1.25, 0.56);
  root.add(bezelFrame);

  const windowBack = new THREE.Mesh(
    track(new THREE.BoxGeometry(2.68, 1.18, 0.3)),
    track(new THREE.MeshStandardMaterial({ color: 0x040914, roughness: 0.8 })),
  );
  windowBack.position.set(0, 1.25, 0.45);
  root.add(windowBack);

  const marquee = new THREE.Mesh(track(new RoundedBoxGeometry(2.6, 0.5, 1.0, 3, 0.08)), goldMat);
  marquee.position.set(0, 2.5, -0.1);
  root.add(marquee);

  const bulbMatTemplate = track(
    new THREE.MeshStandardMaterial({ color: 0xfef08a, emissive: 0xf59e0b, emissiveIntensity: 0.8 }),
  );
  const bulbs: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const mat = bulbMatTemplate.clone();
    track(mat);
    const b = new THREE.Mesh(track(new THREE.SphereGeometry(0.075, 12, 12)), mat);
    b.position.set(-0.96 + i * 0.32, 2.5, 0.42);
    root.add(b);
    bulbs.push(b);
  }

  const buildHorizontalReelTexture = (): THREE.CanvasTexture => {
    const count = SLOT_SYMBOLS.length;
    const cell = 256;
    const w = cell * count;
    const h = cell;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;

    SLOT_SYMBOLS.forEach((sym, i) => {
      const x = i * cell;
      ctx.fillStyle = sym.bg;
      ctx.fillRect(x, 0, cell, h);

      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x, 0, 8, h);
      ctx.fillRect(x + cell - 8, 0, 8, h);

      ctx.save();
      ctx.translate(x + cell / 2, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = sym.color;
      ctx.font = '900 132px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(sym.label, 0, -14);
      ctx.fillStyle = sym.label === '7' ? '#92400e' : '#cbd5e1';
      ctx.font = '800 22px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(sym.sub, 0, 74);
      ctx.restore();
    });

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.anisotropy = anisotropy;
    return tex;
  };

  void createSlotReelTexture;
  const reelTex = track(buildHorizontalReelTexture());
  const reelMat = track(
    new THREE.MeshStandardMaterial({ map: reelTex, roughness: 0.25, metalness: 0.08 }),
  );

  const reelRadius = 0.62;
  const reelWidth = 0.72;
  const reelPivots: THREE.Group[] = [];
  const stepAngle = (Math.PI * 2) / SLOT_SYMBOLS.length;

  for (let i = 0; i < 3; i++) {
    const pivot = new THREE.Group();
    pivot.position.set((i - 1) * 0.86, 1.25, 0.22);
    root.add(pivot);

    const drum = new THREE.Mesh(
      track(new THREE.CylinderGeometry(reelRadius, reelRadius, reelWidth, 48, 1, false)),
      [reelMat, goldMat, goldMat],
    );
    drum.rotation.z = -Math.PI / 2;
    pivot.add(drum);

    pivot.rotation.x = 0.5 * stepAngle;
    reelPivots.push(pivot);
  }

  const paylineMat = track(new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.55 }));
  const payline = new THREE.Mesh(track(new THREE.BoxGeometry(2.74, 0.025, 0.04)), paylineMat);
  payline.position.set(0, 1.25, 0.88);
  root.add(payline);

  const leverPivot = new THREE.Group();
  leverPivot.position.set(1.82, 1.15, 0.0);
  root.add(leverPivot);

  const leverHub = new THREE.Mesh(track(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 16)), chromeMat);
  leverHub.rotation.z = Math.PI / 2;
  leverPivot.add(leverHub);

  const leverArm = new THREE.Mesh(track(new THREE.CylinderGeometry(0.055, 0.065, 1.25, 16)), chromeMat);
  leverArm.position.set(0.14, 0.58, 0);
  leverPivot.add(leverArm);

  const leverKnob = new THREE.Mesh(track(new THREE.SphereGeometry(0.18, 20, 20)), redBallMat);
  leverKnob.position.set(0.14, 1.24, 0);
  leverPivot.add(leverKnob);

  let state: 'idle' | 'spinning' | 'settling' | 'done' = 'idle';
  let leverPullAnim = 0;
  let lastWasWin = false;
  const reelAngles = [0.5 * stepAngle, 0.5 * stepAngle, 0.5 * stepAngle];
  const reelStartAngles = [0, 0, 0];
  const reelTargetAngles = [0, 0, 0];
  const reelDurations = [1.0, 1.48, 1.98];
  const reelStopped = [true, true, true];
  let settleElapsed = 0;
  let visualDetail = 'Reels ready: 7 · 7 · 7';

  return {
    cameraPos: new THREE.Vector3(0.35, 2.35, 4.7),
    cameraLookAt: new THREE.Vector3(0.05, 1.35, 0.1),
    startSpin: () => {
      // Normalize drum angles cleanly
      for (let i = 0; i < 3; i++) {
        reelAngles[i] = ((reelAngles[i] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      }
      state = 'spinning';
      lastWasWin = false;
      leverPullAnim = 1.0;
      reelStopped[0] = false;
      reelStopped[1] = false;
      reelStopped[2] = false;
      casinoAudio.playLeverPull();
    },
    settleOutcome: (isWin: boolean) => {
      lastWasWin = isWin;
      let chosenIndices: [number, number, number];
      if (isWin) {
        chosenIndices = [0, 0, 0];
      } else {
        const a = Math.floor(Math.random() * SLOT_SYMBOLS.length);
        const b = (a + 1 + Math.floor(Math.random() * 2)) % SLOT_SYMBOLS.length;
        const c = (b + 1 + Math.floor(Math.random() * 2)) % SLOT_SYMBOLS.length;
        chosenIndices = [a, b, c];
      }

      chosenIndices.forEach((symIdx, rIdx) => {
        reelStartAngles[rIdx] = reelAngles[rIdx];
        const turns = Math.ceil(reelAngles[rIdx] / (Math.PI * 2)) + 3 + rIdx * 2;
        reelTargetAngles[rIdx] = turns * Math.PI * 2 + (symIdx + 0.5) * stepAngle;
        reelStopped[rIdx] = false;
      });

      const labels = chosenIndices.map((idx) => SLOT_SYMBOLS[idx].label);
      visualDetail = isWin
        ? `JACKPOT! Reels matched ${labels.join(' · ')}`
        : `Reels landed ${labels.join(' · ')} (No match)`;
      settleElapsed = 0;
      state = 'settling';
    },
    update: (dt: number, elapsed: number) => {
      // Smooth lever spring return
      if (leverPullAnim > 0) {
        leverPullAnim = Math.max(0, leverPullAnim - dt * 2.2);
        leverPivot.rotation.x = Math.sin(leverPullAnim * Math.PI) * 1.05;
      } else {
        leverPivot.rotation.x = THREE.MathUtils.damp(leverPivot.rotation.x, 0, 9, dt);
      }

      // Smooth cosine wave marquee chase lights
      const speed = state === 'spinning' || state === 'settling' ? 12 : lastWasWin && state === 'done' ? 9 : 3.2;
      for (let i = 0; i < bulbs.length; i++) {
        const m = bulbs[i].material as THREE.MeshStandardMaterial;
        const wave = 0.5 + 0.5 * Math.cos(elapsed * speed - i * 0.95);
        m.emissiveIntensity = 0.35 + wave * 2.15;
      }

      paylineMat.opacity =
        state === 'done' && lastWasWin ? 0.55 + 0.45 * Math.sin(elapsed * 10) : 0.55;

      if (state === 'spinning') {
        for (let i = 0; i < 3; i++) {
          reelAngles[i] += dt * (17 + i * 2.5);
          reelPivots[i].rotation.x = reelAngles[i];
        }
      } else if (state === 'settling') {
        settleElapsed += dt;
        let allDone = true;
        for (let i = 0; i < 3; i++) {
          const t = Math.min(1, settleElapsed / reelDurations[i]);
          if (t < 1) {
            allDone = false;
            // Smooth cubic deceleration + subtle authentic mechanical overshoot & snap-back
            const baseEase = 1 - Math.pow(1 - t, 3.2);
            const overshoot = t > 0.78 ? Math.sin(((t - 0.78) / 0.22) * Math.PI) * 0.085 : 0;
            reelAngles[i] =
              THREE.MathUtils.lerp(reelStartAngles[i], reelTargetAngles[i], baseEase) + overshoot;
          } else {
            reelAngles[i] = reelTargetAngles[i];
            if (!reelStopped[i]) {
              reelStopped[i] = true;
              casinoAudio.playReelStop(i);
            }
          }
          reelPivots[i].rotation.x = reelAngles[i];
        }
        if (allDone) {
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
