import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface StudioContext {
  isSoftwareGl: boolean;
  maxAnisotropy: number;
  envMap: THREE.Texture;
  disposeEnv: () => void;
}

export function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (!dbg) return false;
    const gpu = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '');
    return /SwiftShader|llvmpipe|Software|Mesa Offscreen/i.test(gpu);
  } catch {
    return false;
  }
}

export function setupStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): StudioContext {
  const isSoftwareGl = detectSoftwareWebGL(renderer);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  if (!isSoftwareGl) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const room = new RoomEnvironment();
  const envTarget = pmrem.fromScene(room, 0.04);
  const envMap = envTarget.texture;
  scene.environment = envMap;

  room.dispose();
  pmrem.dispose();

  return {
    isSoftwareGl,
    maxAnisotropy: isSoftwareGl ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    envMap,
    disposeEnv: () => {
      envTarget.dispose();
    },
  };
}

export function addCasinoStudioLights(scene: THREE.Scene, isSoftwareGl: boolean) {
  const hemi = new THREE.HemisphereLight(0xdbeafe, 0x071126, 0.72);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfff5e4, 2.2);
  keyLight.position.set(4.5, 8.5, 5.5);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 24;
    const d = 5.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
  }
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.95);
  fillLight.position.set(-5.5, 4.0, 4.0);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(0xfbbf24, 3.6, 18, 1.5);
  rimLight.position.set(0.0, 4.8, -4.5);
  scene.add(rimLight);

  return { keyLight, fillLight, rimLight, hemi };
}

export function createFeltTexture(anisotropy = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(256, 256, 40, 256, 256, 360);
  grad.addColorStop(0, '#0f2d5e');
  grad.addColorStop(0.65, '#0b2147');
  grad.addColorStop(1, '#061229');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Fine woven felt grain
  for (let i = 0; i < 6000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(147, 197, 253, 0.035)' : 'rgba(2, 6, 23, 0.08)';
    ctx.fillRect(x, y, 2, 1);
  }

  // Gold filigree table arc lines
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.22)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(256, 256, 210, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(251, 191, 36, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(256, 256, 188, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(2, 6, 18, 0.72)');
  grad.addColorStop(0.5, 'rgba(2, 6, 18, 0.34)');
  grad.addColorStop(1, 'rgba(2, 6, 18, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function addCasinoTableBase(
  scene: THREE.Scene,
  anisotropy: number,
  radius = 6.2,
): { group: THREE.Group; dispose: () => void } {
  const group = new THREE.Group();
  const feltTex = createFeltTexture(anisotropy);

  const feltMat = new THREE.MeshPhysicalMaterial({
    map: feltTex,
    roughness: 0.9,
    metalness: 0.02,
    sheen: 0.55,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color(0x3b82f6),
  });

  const feltGeo = new THREE.CylinderGeometry(radius, radius, 0.24, 64);
  const feltMesh = new THREE.Mesh(feltGeo, feltMat);
  feltMesh.position.y = -0.12;
  feltMesh.receiveShadow = true;
  group.add(feltMesh);

  // Brass inner inlay ring
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.88,
    roughness: 0.22,
  });
  const brassGeo = new THREE.TorusGeometry(radius - 0.08, 0.055, 16, 72);
  const brassRing = new THREE.Mesh(brassGeo, brassMat);
  brassRing.rotation.x = Math.PI / 2;
  brassRing.position.y = 0.02;
  group.add(brassRing);

  // Outer padded mahogany leather rail
  const railMat = new THREE.MeshPhysicalMaterial({
    color: 0x2b130c,
    roughness: 0.36,
    metalness: 0.08,
    clearcoat: 0.5,
    clearcoatRoughness: 0.28,
  });
  const railGeo = new THREE.TorusGeometry(radius + 0.18, 0.22, 20, 72);
  const outerRail = new THREE.Mesh(railGeo, railMat);
  outerRail.rotation.x = Math.PI / 2;
  outerRail.position.y = 0.05;
  outerRail.receiveShadow = true;
  group.add(outerRail);

  scene.add(group);
  return {
    group,
    dispose: () => {
      feltTex.dispose();
      feltMat.dispose();
      feltGeo.dispose();
      brassMat.dispose();
      brassGeo.dispose();
      railMat.dispose();
      railGeo.dispose();
    },
  };
}

export function createWheelTexture(anisotropy = 4): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.48;
  const innerR = size * 0.14;
  const wedges = 12;
  const step = (Math.PI * 2) / wedges;

  ctx.fillStyle = '#091530';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < wedges; i++) {
    // Wedge 0 starts centered at -PI/2 (12 o'clock)
    const startAngle = -Math.PI / 2 - step / 2 + i * step;
    const endAngle = startAngle + step;
    const isSapphire = i % 2 === 0;

    const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
    if (isSapphire) {
      grad.addColorStop(0, '#1e3a8a');
      grad.addColorStop(0.55, '#2563eb');
      grad.addColorStop(1, '#1d4ed8');
    } else {
      grad.addColorStop(0, '#92400e');
      grad.addColorStop(0.55, '#f59e0b');
      grad.addColorStop(1, '#d97706');
    }

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Crisp gold divider
    ctx.strokeStyle = '#fde68a';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Label rotated radially
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 2 + i * step);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isSapphire ? '#ffffff' : '#0f172a';
    ctx.font = '800 32px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(isSapphire ? 'SAPPHIRE' : 'GOLD', 0, -outerR * 0.67);
    ctx.font = '700 22px "JetBrains Mono", monospace';
    ctx.fillStyle = isSapphire ? '#bae6fd' : '#451a03';
    ctx.fillText(`#${i + 1}`, 0, -outerR * 0.44);
    ctx.restore();
  }

  // Outer trim ring
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 14;
  ctx.stroke();

  // Inner hub ring
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 8;
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export function createDiceFaceTexture(
  value: 1 | 2 | 3 | 4 | 5 | 6,
  accent: 'sapphire' | 'gold',
  anisotropy = 4,
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Glossy ivory/dark casino die background
  const bg = ctx.createRadialGradient(128, 128, 20, 128, 128, 180);
  if (accent === 'sapphire') {
    bg.addColorStop(0, '#f8fafc');
    bg.addColorStop(1, '#dbeafe');
  } else {
    bg.addColorStop(0, '#fffbeb');
    bg.addColorStop(1, '#fde68a');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);

  // Subtle recessed border frame
  ctx.strokeStyle = accent === 'sapphire' ? 'rgba(37, 99, 235, 0.25)' : 'rgba(180, 83, 9, 0.28)';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, size - 20, size - 20);

  const pipCoords: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [
      [0.28, 0.28],
      [0.72, 0.72],
    ],
    3: [
      [0.26, 0.26],
      [0.5, 0.5],
      [0.74, 0.74],
    ],
    4: [
      [0.28, 0.28],
      [0.72, 0.28],
      [0.28, 0.72],
      [0.72, 0.72],
    ],
    5: [
      [0.26, 0.26],
      [0.74, 0.26],
      [0.5, 0.5],
      [0.26, 0.74],
      [0.74, 0.74],
    ],
    6: [
      [0.28, 0.24],
      [0.72, 0.24],
      [0.28, 0.5],
      [0.72, 0.5],
      [0.28, 0.76],
      [0.72, 0.76],
    ],
  };

  const pipColor = value === 1 ? '#dc2626' : accent === 'sapphire' ? '#1e3a8a' : '#451a03';
  const radius = value === 1 ? 28 : 20;

  for (const [px, py] of pipCoords[value]) {
    const cx = px * size;
    const cy = py * size;
    // Shadow rim inside pip
    ctx.beginPath();
    ctx.arc(cx, cy + 2, radius + 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = pipColor;
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export function createCoinFaceTexture(
  side: 'HEADS' | 'TAILS',
  anisotropy = 4,
): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  const grad = ctx.createRadialGradient(cx - 40, cy - 40, 20, cx, cy, 250);
  if (side === 'HEADS') {
    grad.addColorStop(0, '#fef3c7');
    grad.addColorStop(0.55, '#f59e0b');
    grad.addColorStop(1, '#92400e');
  } else {
    grad.addColorStop(0, '#dbeafe');
    grad.addColorStop(0.55, '#2563eb');
    grad.addColorStop(1, '#1e3a8a');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Concentric milled rings
  ctx.strokeStyle = side === 'HEADS' ? '#78350f' : '#fbbf24';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, 224, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([10, 8]);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, 198, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center emblem
  ctx.fillStyle = side === 'HEADS' ? '#451a03' : '#fef3c7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 132px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(side === 'HEADS' ? '♛' : '★', cx, cy - 28);

  ctx.font = '800 54px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(side, cx, cy + 106);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export function createCardBackTexture(anisotropy = 4): THREE.CanvasTexture {
  const w = 512;
  const h = 716;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = '#0f2757';
  ctx.fillRect(24, 24, w - 48, h - 48);

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 8;
  ctx.strokeRect(36, 36, w - 72, h - 72);

  // Diamond lattice pattern
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.25)';
  ctx.lineWidth = 2;
  for (let y = 56; y < h - 56; y += 36) {
    for (let x = 56; x < w - 56; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x + 12, y);
      ctx.lineTo(x, y + 12);
      ctx.lineTo(x - 12, y);
      ctx.closePath();
      ctx.stroke();
    }
  }

  // Center medallion
  ctx.fillStyle = '#071126';
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 76, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.fillStyle = '#fbbf24';
  ctx.font = '900 62px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GR', w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export function createCardFrontTexture(
  rank: string,
  suit: '♠' | '♥' | '♦' | '♣',
  anisotropy = 4,
): THREE.CanvasTexture {
  const w = 512;
  const h = 716;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const isRed = suit === '♥' || suit === '♦';
  const ink = isRed ? '#dc2626' : '#0f172a';

  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#ffffff');
  bg.addColorStop(1, '#eef2ff');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 8;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  ctx.strokeStyle = isRed ? 'rgba(220, 38, 38, 0.18)' : 'rgba(30, 58, 138, 0.18)';
  ctx.lineWidth = 4;
  ctx.strokeRect(42, 42, w - 84, h - 84);

  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Top-left corner
  ctx.font = '800 68px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(rank, 86, 100);
  ctx.font = '700 54px system-ui, sans-serif';
  ctx.fillText(suit, 86, 162);

  // Bottom-right corner inverted
  ctx.save();
  ctx.translate(w - 86, h - 100);
  ctx.rotate(Math.PI);
  ctx.font = '800 68px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(rank, 0, 0);
  ctx.font = '700 54px system-ui, sans-serif';
  ctx.fillText(suit, 0, 62);
  ctx.restore();

  // Hero center emblem
  ctx.font = '900 200px system-ui, sans-serif';
  ctx.fillText(suit, w / 2, h / 2 - 20);
  ctx.font = '800 64px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillStyle = '#b45309';
  ctx.fillText(rank, w / 2, h / 2 + 125);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export const SLOT_SYMBOLS = [
  { label: '7', color: '#ef4444', bg: '#fffbeb', sub: 'JACKPOT' },
  { label: '◆', color: '#38bdf8', bg: '#0f172a', sub: 'DIAMOND' },
  { label: '★', color: '#fbbf24', bg: '#1e1b4b', sub: 'STAR' },
  { label: '♛', color: '#f59e0b', bg: '#172554', sub: 'CROWN' },
  { label: '♣', color: '#34d399', bg: '#064e3b', sub: 'CLOVER' },
  { label: '₹', color: '#fde047', bg: '#312e81', sub: 'RUPEE' },
] as const;

export function createSlotReelTexture(anisotropy = 4): THREE.CanvasTexture {
  const count = SLOT_SYMBOLS.length;
  const w = 256;
  const cellH = 256;
  const h = cellH * count;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  SLOT_SYMBOLS.forEach((sym, i) => {
    const y = i * cellH;
    ctx.fillStyle = sym.bg;
    ctx.fillRect(0, y, w, cellH);

    // Gold horizontal separator bars
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, y, w, 8);
    ctx.fillRect(0, y + cellH - 8, w, 8);

    // Inner bevel frame
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 4;
    ctx.strokeRect(12, y + 16, w - 24, cellH - 32);

    ctx.fillStyle = sym.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 132px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(sym.label, w / 2, y + cellH * 0.45);

    ctx.fillStyle = sym.label === '7' ? '#92400e' : '#cbd5e1';
    ctx.font = '800 22px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(sym.sub, w / 2, y + cellH * 0.82);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = anisotropy;
  return tex;
}
