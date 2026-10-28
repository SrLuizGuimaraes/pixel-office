// Área externa: grama, árvores, calçada e rua; pátio/jardim nos slots sem sala.
import type { WallStyle } from '../../art/api';
import { mulberry32 } from '../../../../shared/hash';
import { BUILDING_H, COL_W, CORE_COLS, CORRIDOR_Y, EXT_EAST, EXT_NORTH, EXT_SOUTH, EXT_WEST, SOUTH_Y, TILE } from '../constants';
import { cellRect, slotAt, slotColumn, slotSide } from './geometry';
import { CLUB_DOOR_X } from './club';
import { DOJO_DOOR_X } from './dojo';
import { kartRect, kartRight } from './kart';
import { MALL_BOTTOM, MALL_DOOR_X, MALL_EXT_W, MALL_RECT, MALL_Y } from './mall';
import type { ExteriorProp, FloorPatch, TileRect, WallItemPlacement, WallSegment } from './types';

export const EXTERIOR_WALL: WallStyle = { base: '#cfc8bd', trim: '#8a8174', pattern: 'brick', exterior: true };

export interface ExteriorLayout {
  /** Limites da área desenhada (tiles). */
  bounds: TileRect;
  floors: FloorPatch[];
  props: ExteriorProp[];
  /** Faixas da rua (y em px) e sentido (+1 = leste, -1 = oeste). */
  lanes: { y: number; dir: 1 | -1 }[];
  /** Linha central da rua (px), para as faixas tracejadas. */
  streetY: number;
  streetH: number;
  /** Faixas das ruas norte-sul (px; dir +1 = para o sul): `y0` e `y1` são por onde o carro roda. Só no terreno com shopping. */
  vlanes: VLane[];
  /** As ruas norte-sul (px), para as faixas tracejadas do meio. */
  vstreets: { x: number; w: number; y0: number; y1: number }[];
}

export interface VLane {
  x: number;
  dir: 1 | -1;
  y0: number;
  y1: number;
}

/** Fechamento do corredor e pátio de um slot sem sala. */
export interface SlotShell {
  slot: number;
  rect: TileRect;
  walls: WallSegment[];
  windows: WallItemPlacement[];
  floors: FloorPatch[];
  props: ExteriorProp[];
}

export function layoutExterior(cols: number, mall = false): ExteriorLayout {
  const w = cols * COL_W;
  const bottom = mall ? MALL_BOTTOM + 14 : BUILDING_H + EXT_SOUTH;
  const K = Math.max(MALL_EXT_W, kartRight(cols));
  // com o shopping o terreno vira quarteirões: a leste cabe a praça depois da última rua
  const bounds: TileRect = { x: -EXT_WEST, y: -EXT_NORTH, w: Math.max(w, mall ? K : 0) + EXT_WEST + EXT_EAST + (mall ? 20 : 0), h: bottom + EXT_NORTH };
  const px = (t: number) => t * TILE;
  const floors: FloorPatch[] = [];
  let props: ExteriorProp[] = [];
  const rng = mulberry32(0xc0de + cols);

  floors.push({ kind: 'grass', x: px(bounds.x), y: px(bounds.y), w: px(bounds.w), h: px(bounds.h), seed: 11 });
  // calçada em volta do prédio
  const south = BUILDING_H;
  // ruas norte-sul do terreno em quarteirões (só com o shopping): a oeste, entre o escritório e o kartódromo (começa na rua norte e
  // desemboca na rua sul) e a leste do último prédio; as duas de fora atravessam o mapa de ponta a ponta
  const WEST = { x0: -13, x1: -8 };
  const EAST1 = { x0: w + 1, x1: w + 5 };
  const EAST2 = { x0: K + 2, x1: K + 7 };
  const through = mall ? [WEST, EAST2] : [];
  const allCuts = mall ? [WEST, EAST2, EAST1] : [];
  /** Faixa horizontal de ponta a ponta do terreno, sem os trechos em que passa uma rua norte-sul. */
  const band = (kind: FloorPatch['kind'], y: number, h: number, seed: number, cuts: { x0: number; x1: number }[]) => {
    let segs: [number, number][] = [[bounds.x, bounds.x + bounds.w]];
    for (const c of cuts) {
      segs = segs.flatMap(([a, b]): [number, number][] => {
        if (c.x1 <= a || c.x0 >= b) return [[a, b]];
        const out: [number, number][] = [];
        if (c.x0 > a) out.push([a, c.x0]);
        if (c.x1 < b) out.push([c.x1, b]);
        return out;
      });
    }
    for (const [a, b] of segs) floors.push({ kind, x: px(a), y: px(y), w: px(b - a), h: px(h), seed });
  };
  band('sidewalk', south + 2, 2, 12, allCuts);
  band('street', south + 4, 5, 13, through);
  band('sidewalk', south + 9, 2, 14, through);
  // shopping do outro lado da rua: o caminho do lounge até a calçada, a faixa de pedestres e a calçada até a porta dele
  if (mall) {
    const x0 = MALL_DOOR_X - 1;
    floors.push({ kind: 'sidewalk', x: px(x0), y: px(south), w: px(4), h: px(4), seed: 17 });
    for (const r of [4, 6, 8]) floors.push({ kind: 'sidewalk', x: px(x0), y: px(south + r), w: px(4), h: px(1), seed: 18 + r });
    floors.push({ kind: 'sidewalk', x: px(x0), y: px(south + 9), w: px(4), h: px(MALL_Y - south - 9), seed: 30 });
    floors.push({ kind: 'sidewalk', x: px(DOJO_DOOR_X), y: px(south + 9), w: px(2), h: px(MALL_Y - south - 9), seed: 31 });
    floors.push({ kind: 'sidewalk', x: px(CLUB_DOOR_X), y: px(south + 9), w: px(2), h: px(MALL_Y - south - 9), seed: 32 });
  }
  const vstreets: ExteriorLayout['vstreets'] = [];
  const vlanes: VLane[] = [];
  if (mall) {
    const top = bounds.y;
    const bot = bounds.y + bounds.h;
    // rua norte, fechando o quarteirão do escritório por cima
    band('sidewalk', -10, 2, 40, through);
    band('street', -8, 5, 41, through);
    band('sidewalk', -3, 2, 42, [...through, EAST1]);
    const vertical = (c: { x0: number; x1: number }, y0: number, y1: number, sideW: number, sideSeed: number) => {
      floors.push({ kind: 'street', x: px(c.x0), y: px(y0), w: px(c.x1 - c.x0), h: px(y1 - y0), seed: 50 + sideSeed });
      // calçadas dos dois lados, entre as faixas horizontais (que fecham as esquinas)
      const sides: [number, number][] = y0 === top ? [[top, -10], [-1, south + 2], [south + 11, bot]] : [[-1, south + 2]];
      for (const [a, b] of sides) {
        floors.push({ kind: 'sidewalk', x: px(c.x0 - sideW), y: px(a), w: px(sideW), h: px(b - a), seed: 60 + sideSeed });
        floors.push({ kind: 'sidewalk', x: px(c.x1), y: px(a), w: px(sideW), h: px(b - a), seed: 70 + sideSeed });
      }
      vstreets.push({ x: px(c.x0), w: px(c.x1 - c.x0), y0: px(y0), y1: px(y1) });
      const W = px(c.x1 - c.x0);
      const lanesY0 = y0 === top ? px(top) : px(-4);
      const lanesY1 = y0 === top ? px(bot) : px(south + 6);
      vlanes.push({ x: px(c.x0) + Math.round(W * 0.64), dir: 1, y0: lanesY0, y1: lanesY1 }, { x: px(c.x0) + Math.round(W * 0.14), dir: -1, y0: lanesY0, y1: lanesY1 });
    };
    vertical(WEST, top, bot, 2, 1);
    vertical(EAST2, top, bot, 2, 2);
    vertical(EAST1, -3, south + 4, 1, 3);
    // faixa de pedestres do caminho do shopping ao kartódromo, em cima da rua entre o escritório e a pista
    for (let x = EAST1.x0; x < EAST1.x1; x++) floors.push({ kind: 'sidewalk', x: px(x), y: px(south + 2 + ((x - EAST1.x0) % 2)), w: px(1), h: px(1), seed: 80 + x });
    // caminho de pedra da recepção até a calçada da rua oeste
    floors.push({ kind: 'sidewalk', x: px(-8), y: px(CORRIDOR_Y), w: px(5), h: px(3), seed: 81 });
    // praça a leste da última rua: dois caminhos em cruz num gramado
    const pk0 = K + 9;
    const pk1 = bounds.x + bounds.w - 3;
    const xc = Math.round((pk0 + pk1) / 2) - 1;
    floors.push({ kind: 'sidewalk', x: px(xc), y: px(-1), w: px(2), h: px(south + 2 + 1), seed: 82 });
    floors.push({ kind: 'sidewalk', x: px(pk0), y: px(13), w: px(pk1 - pk0), h: px(2), seed: 83 });
  }
  // caminho de pedra até a calçada, na frente da recepção
  floors.push({ kind: 'sidewalk', x: px(-3), y: px(CORRIDOR_Y), w: px(3), h: px(5), seed: 15 });
  floors.push({ kind: 'sidewalk', x: px(-3), y: px(CORRIDOR_Y + 5), w: px(2), h: px(south + 2 - CORRIDOR_Y - 5), seed: 16 });

  // árvores ao norte (fileira com variação) e a oeste/leste
  for (let x = bounds.x + 1; x < bounds.x + bounds.w - 1; x += 4 + Math.floor(rng() * 3)) {
    props.push({ kind: rng() < 0.25 ? 'pine' : 'tree', x: px(x) + Math.floor(rng() * 8), y: px(-3) - Math.floor(rng() * 20), seed: Math.floor(rng() * 1e9) });
    if (rng() < 0.6) props.push({ kind: 'bush', x: px(x + 2), y: px(-1) - 2, seed: Math.floor(rng() * 1e9) });
  }
  // bosque ao norte: fileiras irregulares cada vez mais esparsas
  for (const [row, gap] of [
    [-6, 5],
    [-10, 6],
    [-14, 8],
  ] as const) {
    for (let x = bounds.x + 2; x < bounds.x + bounds.w - 1; x += gap + Math.floor(rng() * 4)) {
      props.push({ kind: rng() < 0.3 ? 'pine' : 'tree', x: px(x) + Math.floor(rng() * 8), y: px(row) - Math.floor(rng() * 12), seed: Math.floor(rng() * 1e9) });
    }
  }
  for (const side of [-1, 1]) {
    for (const band of [0, 7, 13]) {
      const baseX = side < 0 ? -6 - band : w + 4 + band;
      for (let y = 1; y < BUILDING_H; y += 3 + Math.floor(rng() * 3)) {
        if (side < 0 && band === 0 && y >= CORRIDOR_Y - 1 && y <= south + 1) continue;
        props.push({ kind: rng() < 0.3 ? 'pine' : 'tree', x: px(baseX + Math.floor(rng() * 5)), y: px(y + 1), seed: Math.floor(rng() * 1e9) });
        if (band === 0 && rng() < 0.5) props.push({ kind: 'bush', x: px(side < 0 ? -2 : w + 1), y: px(y + 2), seed: Math.floor(rng() * 1e9) });
      }
    }
  }
  // cerca viva + flores ao longo da fachada sul e postes na calçada; diante de cada slot de
  // projeto, o trecho do caminho do jardim só tem cerca quando há sala ali
  for (let x = 0; x < w; x += 2) {
    // o caminho do shopping abre um portão na cerca viva
    if (mall && x >= MALL_DOOR_X - 1 && x <= MALL_DOOR_X + 2) continue;
    const col = Math.floor(x / COL_W);
    const lx = x - col * COL_W;
    const gate = col >= CORE_COLS && (lx === 6 || lx === 8) ? slotAt(col, 'south') : undefined;
    props.push({ kind: (x / 2) % 3 === 1 ? 'flowers' : 'hedge', x: px(x) + TILE, y: px(south + 1) + 10, seed: x * 7 + 3, whenRoom: gate });
  }
  for (let x = bounds.x + 4; x < bounds.x + bounds.w; x += 10) {
    props.push({ kind: 'lamp', x: px(x), y: px(south + 3) + 6, seed: x });
  }
  for (const row of [13, 17, 21]) {
    for (let x = bounds.x + 3; x < bounds.x + bounds.w - 2; x += 6 + Math.floor(rng() * 5)) {
      props.push({ kind: rng() < 0.2 ? 'pine' : 'tree', x: px(x) + Math.floor(rng() * 10), y: px(south + row) + Math.floor(rng() * 10), seed: Math.floor(rng() * 1e9) });
      if (rng() < 0.3) props.push({ kind: 'bush', x: px(x + 3), y: px(south + row + 1), seed: Math.floor(rng() * 1e9) });
    }
  }
  if (mall) {
    // nada de árvore dentro do shopping; atrás dele, fileira de árvores; postes na calçada da frente dele
    const m = MALL_RECT;
    props = props.filter((p) => !(p.x >= px(m.x - 2) && p.x <= px(MALL_EXT_W + 2) && p.y >= px(m.y - 2) && p.y <= px(m.y + m.h + 2)));
    for (let x = bounds.x + 2; x < bounds.x + bounds.w - 1; x += 6 + Math.floor(rng() * 5)) {
      props.push({ kind: rng() < 0.25 ? 'pine' : 'tree', x: px(x) + Math.floor(rng() * 8), y: px(MALL_BOTTOM + 3) + Math.floor(rng() * 20), seed: Math.floor(rng() * 1e9) });
    }
    for (let x = bounds.x + 4; x < bounds.x + bounds.w; x += 10) props.push({ kind: 'lamp', x: px(x), y: px(south + 10) + 6, seed: x + 5 });
    // nada de árvore dentro do kartódromo, na lateral do prédio
    const k = kartRect(cols);
    props = props.filter((p) => !(p.x >= px(k.x - 3) && p.x <= px(k.x + k.w + 2) && p.y >= px(-2) && p.y <= px(k.y + k.h + 1)));
    // e nada nas ruas e calçadas dos quarteirões
    const inBand = (p: ExteriorProp): boolean => {
      const tx = p.x / TILE;
      const ty = p.y / TILE;
      return (ty >= -12 && ty < -1) || (tx >= WEST.x0 - 3 && tx < WEST.x1 + 1) || (tx >= EAST2.x0 - 3 && tx < EAST2.x1 + 3) || (ty < south + 3 && tx >= EAST1.x0 - 1 && tx < EAST1.x1 + 2);
    };
    props = props.filter((p) => !inBand(p));
    // postes nas calçadas da rua norte e das ruas norte-sul, e a praça: bancos, flores, árvores
    for (let x = bounds.x + 4; x < bounds.x + bounds.w; x += 10) {
      if (!allCuts.some((c) => x >= c.x0 - 1 && x < c.x1 + 1)) props.push({ kind: 'lamp', x: px(x), y: px(-2) + 6, seed: x + 9 });
    }
    for (const c of [WEST, EAST2]) for (let y = 4; y < MALL_BOTTOM + 12; y += 10) if (y < south + 2 || y > south + 10) props.push({ kind: 'lamp', x: px(c.x1) + 2, y: px(y), seed: y + c.x0 });
    for (let y = 4; y < south; y += 12) props.push({ kind: 'lamp', x: px(EAST1.x1), y: px(y), seed: y + 31 });
    const pk0 = K + 9;
    const pk1 = bounds.x + bounds.w - 3;
    const xc = Math.round((pk0 + pk1) / 2);
    props.push({ kind: 'rock', x: px(xc), y: px(14), seed: 5 });
    for (const [dx, dy] of [[-2, -1], [2, -1], [-2, 2], [2, 2]] as const) props.push({ kind: 'flowers', x: px(xc + dx), y: px(14 + dy), seed: xc + dx * 3 + dy });
    for (const dx of [-8, 8]) props.push({ kind: 'bench', x: px(xc + dx), y: px(13) + 2, seed: xc + dx });
    for (const [tx, ty] of [[pk0 + 2, 2], [pk1 - 2, 2], [pk0 + 2, 24], [pk1 - 2, 24], [xc - 6, 6], [xc + 6, 6], [xc - 6, 22], [xc + 6, 22], [xc, 4], [xc, 25]] as const) {
      props.push({ kind: rng() < 0.3 ? 'pine' : 'tree', x: px(tx), y: px(ty), seed: Math.floor(rng() * 1e9) });
    }
  }
  props.push({ kind: 'bench', x: px(-4), y: px(CORRIDOR_Y + 3) + 6, seed: 1 });
  // totem com a marca na entrada principal (oeste)
  props.push({ kind: 'totem', x: px(-3) + 6, y: px(CORRIDOR_Y + 1), seed: 2 });

  const streetY = px(south + 4);
  const streetH = px(5);
  return {
    bounds,
    floors,
    props,
    lanes: [
      { y: streetY + Math.round(streetH * 0.36), dir: 1 },
      { y: streetY + Math.round(streetH * 0.86), dir: -1 },
    ],
    streetY,
    streetH,
    vlanes,
    vstreets,
  };
}

/** Parede externa + jardim de um slot vazio: deck de madeira com mesas e guarda-sóis, canteiros e caminho. */
export function slotShell(slot: number, lastColumn: boolean): SlotShell {
  const col = slotColumn(slot);
  const side = slotSide(slot);
  const rect = cellRect(col, side);
  const x0 = rect.x * TILE;
  const rng = mulberry32(0x9a7d + slot * 31);
  const walls: WallSegment[] = [];
  const windows: WallItemPlacement[] = [];
  const floors: FloorPatch[] = [];
  const props: ExteriorProp[] = [];
  const W = COL_W * TILE;
  const T = (n: number) => n * TILE;
  const seed = () => Math.floor(rng() * 1e9);
  /** Deck de madeira com borda de pedra (tiles locais). */
  const deck = (lx: number, ly: number, w: number, h: number) => {
    floors.push({ kind: 'sidewalk', x: x0 + T(lx), y: T(rect.y + ly), w: T(w), h: T(h), seed: slot + 7 });
    floors.push({ kind: 'wood', x: x0 + T(lx) + 4, y: T(rect.y + ly) + 4, w: T(w) - 8, h: T(h) - 8, seed: slot + 8 });
  };

  if (side === 'north') {
    // fachada com janelas fechando o corredor (linhas 10–11)
    const fy = (CORRIDOR_Y - 2) * TILE;
    walls.push({ kind: 'face', x: x0, y: fy, w: W, style: EXTERIOR_WALL });
    [3, 8, 13].forEach((cx, i) =>
      windows.push({ id: `shell:${slot}:janela${i}`, kind: 'window', cx: x0 + cx * TILE, baseY: CORRIDOR_Y * TILE, on: 'face', order: 0 }),
    );
    if (lastColumn) walls.push({ kind: 'cap', x: x0 + W - TILE / 2, y: fy, w: TILE / 2, h: 2 * TILE, style: EXTERIOR_WALL });
    // caminho do gramado até o deck, deck no meio e canteiros sob as janelas
    floors.push({ kind: 'sidewalk', x: x0 + T(7), y: T(rect.y), w: T(2), h: T(3), seed: slot });
    deck(3, 3, 10, 5);
    props.push({ kind: 'parasol', x: x0 + T(5.5), y: T(rect.y + 6) + 4, seed: seed(), slot });
    props.push({ kind: 'parasol', x: x0 + T(10.5), y: T(rect.y + 6) + 4, seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(3.5), y: T(rect.y + 3) + 6, seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(12.5), y: T(rect.y + 3) + 6, seed: seed(), slot });
    for (const cx of [3, 8, 13]) props.push({ kind: 'flowers', x: x0 + T(cx), y: T(rect.y + 9) + 12, seed: slot * 3 + cx, slot });
    props.push({ kind: 'tree', x: x0 + T(1) + 4, y: T(rect.y + 3), seed: seed(), slot });
    props.push({ kind: rng() < 0.5 ? 'pine' : 'tree', x: x0 + T(15) - 4, y: T(rect.y + 3) + 6, seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(1) + 8, y: T(rect.y + 8), seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(15) - 8, y: T(rect.y + 8), seed: seed(), slot });
  } else {
    // mureta externa fechando o corredor (linha 17) e jardim abaixo, ligado à calçada da rua
    walls.push({ kind: 'south', x: x0, y: SOUTH_Y * TILE, w: W, style: EXTERIOR_WALL });
    if (lastColumn) walls.push({ kind: 'cap', x: x0 + W - TILE / 2, y: SOUTH_Y * TILE, w: TILE / 2, h: TILE, style: EXTERIOR_WALL });
    floors.push({ kind: 'sidewalk', x: x0 + T(7), y: T(rect.y + 1), w: T(2), h: T(rect.h - 1), seed: slot });
    // trecho entre a fachada e a calçada: só existe enquanto o slot está vazio (a cerca viva fecha)
    props.push({ kind: 'paving', x: x0 + T(7), y: T(BUILDING_H), seed: slot, slot });
    deck(3, 3.5, 10, 5);
    props.push({ kind: 'parasol', x: x0 + T(5.5), y: T(rect.y + 6.5) + 4, seed: seed(), slot });
    props.push({ kind: 'parasol', x: x0 + T(10.5), y: T(rect.y + 6.5) + 4, seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(3.5), y: T(rect.y + 4) + 4, seed: seed(), slot });
    props.push({ kind: 'bush', x: x0 + T(12.5), y: T(rect.y + 4) + 4, seed: seed(), slot });
    for (const cx of [3, 13]) props.push({ kind: 'flowers', x: x0 + T(cx), y: T(rect.y + 2), seed: slot * 3 + cx, slot });
    props.push({ kind: 'bench', x: x0 + T(4), y: T(rect.y + 10) + 6, seed: slot, slot });
    props.push({ kind: 'bench', x: x0 + T(12), y: T(rect.y + 10) + 6, seed: slot + 1, slot });
    props.push({ kind: 'tree', x: x0 + T(1) + 6, y: T(rect.y + 11), seed: seed(), slot });
    props.push({ kind: rng() < 0.5 ? 'pine' : 'tree', x: x0 + T(15) - 6, y: T(rect.y + 11) + 4, seed: seed(), slot });
    props.push({ kind: 'rock', x: x0 + T(14), y: T(rect.y + 2) + 4, seed: slot + 3, slot });
  }
  return { slot, rect, walls, windows, floors, props };
}
