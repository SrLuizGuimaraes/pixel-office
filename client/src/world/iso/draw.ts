// Desenho em canvas 2D da vista isométrica: pisos e faces de parede como paralelogramas com textura (transformação afim),
// quadros de parede e sprites. Tudo recebe a câmera (IsoView) e projeta pelo mesmo caminho de projection.ts.
import type { FloorKind, WallPattern } from '../../art/api';
import { signTexture, wallTexture, floorTexture } from '../../world3d/textures';
import { toScreen, type IsoView, type Px } from './projection';
import type { Sprite } from './bake';
import type { WallItemDraw } from './scene';

const P0: Px = { x: 0, y: 0 };
const P1: Px = { x: 0, y: 0 };
const P2: Px = { x: 0, y: 0 };

/** Aplica ao contexto uma transformação onde (s, t) são tiles ao longo dos vetores `a` e `b` (do mundo) a partir de `o`. */
export function setPlane(ctx: CanvasRenderingContext2D, view: IsoView, o: readonly [number, number, number], a: readonly [number, number, number], b: readonly [number, number, number], dpr: number): void {
  toScreen(view, o[0], o[1], o[2], P0);
  toScreen(view, o[0] + a[0], o[1] + a[1], o[2] + a[2], P1);
  toScreen(view, o[0] + b[0], o[1] + b[1], o[2] + b[2], P2);
  ctx.setTransform(dpr * (P1.x - P0.x), dpr * (P1.y - P0.y), dpr * (P2.x - P0.x), dpr * (P2.y - P0.y), dpr * P0.x, dpr * P0.y);
}

const patterns = new Map<string, CanvasPattern | null>();

function patternFor(ctx: CanvasRenderingContext2D, key: string, src: () => HTMLCanvasElement | null): CanvasPattern | null {
  if (patterns.has(key)) return patterns.get(key)!;
  const img = src();
  let p: CanvasPattern | null = null;
  if (img) {
    p = ctx.createPattern(img, 'repeat');
    // a textura cobre 2x2 tiles por repetição
    p?.setTransform(new DOMMatrix().scale(2 / img.width, 2 / img.height));
  }
  patterns.set(key, p);
  return p;
}

export function floorPattern(ctx: CanvasRenderingContext2D, kind: FloorKind): CanvasPattern | null {
  return patternFor(ctx, `f:${kind}`, () => floorTexture(kind).image as HTMLCanvasElement);
}

export function wallPattern(ctx: CanvasRenderingContext2D, pattern: WallPattern | undefined): CanvasPattern | null {
  if (!pattern) return null;
  return patternFor(ctx, `w:${pattern}`, () => (wallTexture(pattern)?.image as HTMLCanvasElement | undefined) ?? null);
}

const shadeCache = new Map<string, string>();
/** Escurece (k < 1) ou clareia (k > 1) uma cor hex. */
export function shade(hex: string, k: number): string {
  const key = hex + k.toFixed(3);
  let v = shadeCache.get(key);
  if (!v) {
    const n = parseInt(hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.slice(1) : hex.slice(1), 16);
    const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * k)));
    v = `rgb(${c(16)},${c(8)},${c(0)})`;
    shadeCache.set(key, v);
  }
  return v;
}

/** Preenche o retângulo (x, y, w, h) do plano atual com a cor e, por cima, a textura (multiplicada). */
export function fillTextured(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, pat: CanvasPattern | null, grow = 0): void {
  ctx.fillStyle = color;
  ctx.fillRect(x - grow, y - grow, w + 2 * grow, h + 2 * grow);
  if (pat) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = pat;
    ctx.fillRect(x - grow, y - grow, w + 2 * grow, h + 2 * grow);
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** Desenha um sprite com a âncora em (x, y) da tela, na escala do zoom. */
export function blit(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, zoom: number): void {
  ctx.drawImage(s.canvas, Math.round(x - s.ax * zoom), Math.round(y - s.ay * zoom), Math.round(s.w * zoom), Math.round(s.h * zoom));
}

// ------------------------------------------------------------------ quadros de parede

const ART = ['#e8a33d', '#4a8fd8', '#d65a5a', '#5aa86b', '#9a6fd0', '#e0c24a'];

export interface ItemEnv {
  night: number;
  /** Abertura 0..1 da porta do elevador deste item. */
  door: number;
  signText: string;
  signColor: string;
}

/** Desenha um item de parede no plano da parede (s ao longo de X, t para cima), centrado em x = 0. */
export function drawWallItem(ctx: CanvasRenderingContext2D, it: WallItemDraw, env: ItemEnv): void {
  const rect = (w: number, h: number, y: number, color: string, x = 0): void => {
    ctx.fillStyle = color;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
  };
  const frame = (w: number, h: number, y: number, color = '#5a4a3c'): void => rect(w + 0.1, h + 0.1, y, color);
  const seed = it.seed;
  switch (it.kind) {
    case 'window': {
      frame(1.85, 1.25, 1.7, '#e9e5dc');
      rect(1.8, 1.2, 1.7, env.night > 0.5 ? '#1c2a4d' : '#a9d8f5');
      if (env.night > 0.5) {
        rect(0.5, 0.35, 1.9, '#f2d77a', -0.5);
        rect(0.08, 0.08, 1.45, '#cfd8ff', 0.55);
      }
      for (const dx of [-0.45, 0.45]) rect(0.04, 1.2, 1.7, '#e9e5dc', dx);
      rect(1.8, 0.04, 1.7, '#e9e5dc');
      break;
    }
    case 'painting':
      frame(1.7, 1.0, 1.8);
      rect(1.7, 1.0, 1.8, ART[seed % ART.length]);
      rect(1.2, 0.5, 1.7, ART[(seed + 2) % ART.length]);
      break;
    case 'poster':
      frame(0.7, 1.0, 1.75, '#2b2f38');
      rect(0.7, 1.0, 1.75, ART[(seed + 1) % ART.length]);
      rect(0.4, 0.3, 1.9, '#ffffff');
      break;
    case 'tv':
      frame(1.8, 1.0, 1.7, '#14171f');
      rect(1.8, 1.0, 1.7, '#1d3b66');
      rect(1.2, 0.5, 1.7, '#2f6bd1');
      break;
    case 'clock':
      ctx.fillStyle = '#f4f1e6';
      ctx.beginPath();
      ctx.arc(0, 2.25, 0.27, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#2b2f38';
      ctx.lineWidth = 0.04;
      ctx.stroke();
      rect(0.03, 0.18, 2.3, '#2b2f38');
      break;
    case 'whiteboard':
      frame(2.8, 1.2, 1.7, '#8d97a6');
      rect(2.8, 1.2, 1.7, '#f7f8fa');
      for (let i = 0; i < 5; i++) rect(0.32, 0.22, 1.5 + (i % 2) * 0.4, ART[(i + seed) % ART.length], -1.0 + i * 0.5);
      break;
    case 'sign': {
      const img = signTexture(env.signText, env.signColor, '#ffffff').image as HTMLCanvasElement;
      if (env.signText) {
        // o plano tem o "para cima" no eixo t: vira a imagem para o texto ficar em pé
        ctx.save();
        ctx.translate(0, 2.45);
        ctx.scale(1, -1);
        ctx.drawImage(img, -1.45, -0.24, 2.9, 0.48);
        ctx.restore();
      }
      else rect(2.9, 0.48, 2.45, '#9aa3b2');
      break;
    }
    case 'mirror':
      frame(0.8, 1.1, 1.65, '#8d97a6');
      rect(0.8, 1.1, 1.65, '#cfe6f0');
      break;
    case 'light_switch':
      rect(0.12, 0.2, 1.25, '#f4f1e6');
      break;
    case 'shelf_wall':
      rect(1.9, 0.06, 1.75, '#8a6a45');
      for (let i = 0; i < 4; i++) {
        const h = 0.3 + (i % 2) * 0.12;
        rect(0.2, h, 1.78 + h / 2, ART[(i + seed) % ART.length], -0.7 + i * 0.45);
      }
      break;
    case 'elevator': {
      rect(2.1, 2.6, 1.3, '#8d97a6');
      rect(1.8, 2.4, 1.25, '#1b1f29');
      const open = env.door * 0.42;
      rect(0.9, 2.4, 1.25, '#c3cad4', -0.45 - open);
      rect(0.9, 2.4, 1.25, '#c3cad4', 0.45 + open);
      rect(0.3, 0.1, 2.75, '#7be0a0');
      break;
    }
    default:
      break;
  }
}
