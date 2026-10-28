// Texturas procedurais (canvas) dos pisos e das paredes da vista 3D: em pixel art, para combinar com o resto do Pixel Office.
import * as THREE from 'three';
import type { FloorKind, WallPattern } from '../art/api';

const cache = new Map<string, THREE.CanvasTexture>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

/** Ruído determinístico simples (para pontilhados). */
function rnd(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

let pixelArt = true;

/** Liga ou desliga o visual pixel art das texturas (pixels nítidos x suavizadas), inclusive as já criadas. */
export function setPixelArtTextures(on: boolean): void {
  if (on === pixelArt) return;
  pixelArt = on;
  for (const t of cache.values()) {
    t.magFilter = on ? THREE.NearestFilter : THREE.LinearFilter;
    t.needsUpdate = true;
  }
}

function finish(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = pixelArt ? THREE.NearestFilter : THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Textura de piso (cobre 2x2 tiles por repetição). Cores claras: o material multiplica pelo tom do cômodo. */
export function floorTexture(kind: FloorKind): THREE.CanvasTexture {
  const key = `floor:${kind}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 64;
  const [c, g] = canvas(S);
  const r = rnd(kind.length * 977);
  switch (kind) {
    case 'wood': {
      for (let i = 0; i < 8; i++) {
        const y = i * 8;
        g.fillStyle = i % 2 ? '#d2a876' : '#c99e6c';
        g.fillRect(0, y, S, 8);
        g.fillStyle = 'rgba(80,50,20,0.35)';
        g.fillRect(0, y, S, 1);
        const off = (i * 23) % S;
        g.fillRect(off, y, 1, 8);
        for (let k = 0; k < 6; k++) {
          g.fillStyle = 'rgba(110,70,30,0.18)';
          g.fillRect(Math.floor(r() * S), y + 2 + Math.floor(r() * 4), 6 + Math.floor(r() * 8), 1);
        }
      }
      break;
    }
    case 'tile_check': {
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = (x + y) % 2 ? '#dfe3e6' : '#f4f6f7';
        g.fillRect(x * 16, y * 16, 16, 16);
      }
      g.fillStyle = 'rgba(120,130,140,0.35)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 16, 0, 1, S);
        g.fillRect(0, i * 16, S, 1);
      }
      break;
    }
    case 'tile_white': {
      g.fillStyle = '#f3f6f8';
      g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(130,150,165,0.5)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 16, 0, 1, S);
        g.fillRect(0, i * 16, S, 1);
      }
      break;
    }
    case 'marble': {
      g.fillStyle = '#eceae6';
      g.fillRect(0, 0, S, S);
      g.strokeStyle = 'rgba(150,150,160,0.22)';
      g.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.moveTo(r() * S, 0);
        g.bezierCurveTo(r() * S, 20, r() * S, 40, r() * S, S);
        g.stroke();
      }
      g.fillStyle = 'rgba(120,125,135,0.35)';
      g.fillRect(0, 0, S, 1);
      g.fillRect(0, 0, 1, S);
      g.fillRect(S / 2, 0, 1, S);
      g.fillRect(0, S / 2, S, 1);
      break;
    }
    case 'concrete':
    case 'sidewalk': {
      g.fillStyle = kind === 'sidewalk' ? '#cfcac0' : '#bfc1c4';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(90,90,95,0.18)' : 'rgba(255,255,255,0.14)';
        g.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1 + Math.floor(r() * 2), 1);
      }
      if (kind === 'sidewalk') {
        g.fillStyle = 'rgba(90,85,75,0.4)';
        g.fillRect(0, 0, S, 1);
        g.fillRect(0, 0, 1, S);
      }
      break;
    }
    case 'street': {
      g.fillStyle = '#4b4f58';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 120; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(20,20,25,0.25)' : 'rgba(255,255,255,0.08)';
        g.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1 + Math.floor(r() * 2), 1);
      }
      break;
    }
    case 'grass': {
      g.fillStyle = '#5da255';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 220; i++) {
        g.fillStyle = ['#4f9248', '#6bb263', '#58a050'][Math.floor(r() * 3)];
        g.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1 + Math.floor(r() * 2));
      }
      break;
    }
    case 'carpet':
    default: {
      g.fillStyle = '#f0f0f0';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 260; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.35)';
        g.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1, 1);
      }
      break;
    }
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Textura de parede (cobre 2x2 tiles). Clara: o material multiplica pela cor da parede. */
export function wallTexture(pattern: WallPattern | undefined): THREE.CanvasTexture | null {
  if (!pattern || pattern === 'plain' || pattern === 'glass') return null;
  const key = `wall:${pattern}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 64;
  const [c, g] = canvas(S);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  switch (pattern) {
    case 'stripes':
      for (let x = 0; x < S; x += 16) {
        g.fillStyle = 'rgba(0,0,0,0.07)';
        g.fillRect(x, 0, 8, S);
      }
      break;
    case 'tiles':
      g.fillStyle = 'rgba(0,0,0,0.13)';
      for (let i = 0; i < 4; i++) {
        g.fillRect(i * 16, 0, 1, S);
        g.fillRect(0, i * 16, S, 1);
      }
      break;
    case 'wood_panel':
      for (let x = 0; x < S; x += 10) {
        g.fillStyle = 'rgba(70,40,10,0.18)';
        g.fillRect(x, 0, 1, S);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x + 1, 0, 2, S);
      }
      break;
    case 'brick':
      g.fillStyle = 'rgba(70,40,30,0.25)';
      for (let y = 0; y < S; y += 8) {
        g.fillRect(0, y, S, 1);
        for (let x = (y / 8) % 2 ? 0 : 8; x < S; x += 16) g.fillRect(x, y, 1, 8);
      }
      break;
    case 'marble':
      g.strokeStyle = 'rgba(120,120,130,0.18)';
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(i * 14, 0);
        g.bezierCurveTo(i * 14 + 10, 20, i * 14 - 8, 40, i * 14 + 6, S);
        g.stroke();
      }
      break;
  }
  const t = finish(c);
  cache.set(key, t);
  return t;
}

/** Textura de texto numa placa (nome da sala), com cache por texto e cor. */
export function signTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const key = `sign:${text}:${bg}:${fg}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 192;
  const H = 32;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = fg;
  g.globalAlpha = 0.5;
  g.strokeRect(1.5, 1.5, W - 3, H - 3);
  g.globalAlpha = 1;
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 20;
  g.font = `bold ${size}px "Pixelify Sans", ui-monospace, monospace`;
  while (g.measureText(text).width > W - 14 && size > 9) {
    size -= 1;
    g.font = `bold ${size}px "Pixelify Sans", ui-monospace, monospace`;
  }
  g.fillText(text, W / 2, H / 2 + 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}
