// Móveis do shopping (lojas de roupas e de games, praça de alimentação, academia, átrio). Coordenadas de desenho =
// footprint (base em y = h*TILE), no mesmo estilo dos demais móveis.
import { ramp } from '../core/color';
import { floorSheet, type BufFurniture } from '../core/sprite';
import { ACCENTS, contact, frontFace, glass, M, pick, rngOf, topFace } from './kit';

const CLOTHES = ['#e05a5a', '#3f7fd8', '#f2c14e', '#4cae6a', '#8d66cf', '#ec8a3c', '#e47aa8', '#36b0b0', '#f4f1e6'] as const;

/** Arara de roupas: duas hastes com a barra e peças penduradas em cores variadas. */
export function clothesRack(): BufFurniture {
  const s = floorSheet(1, 1, 22);
  const b = s.buf;
  const r = rngOf(31, 5);
  const post = '#7d8594';
  // pé da arara e hastes
  b.hline(2, 13, 14, '#4a4f5a');
  b.hline(3, 12, 15, '#3a3f4b');
  b.vline(3, -12, 14, post);
  b.vline(12, -12, 14, post);
  b.hline(2, 13, -12, '#b9c0ca');
  b.hline(3, 12, -13, '#e2e6ec');
  // peças penduradas (de trás para a frente: duas fileiras)
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 4; i++) {
      const x = 4 + i * 2 + (row ? 1 : 0);
      const c = pick(r, CLOTHES);
      const len = 9 + Math.floor(r() * 5);
      b.rect(x, -10 + row * 2, 2, len, c);
      b.vline(x, -10 + row * 2, -10 + row * 2 + len - 1, ramp(c, 0.12).lt);
      b.set(x, -11 + row * 2, '#c9ced6');
    }
  }
  b.outline();
  contact(b, 1, 14, 14, 3, 0.24);
  return { base: s };
}

/** Estante de loja encostada na parede: pilhas de roupas dobradas ('clothes') ou caixas de jogos ('games'). */
export function shopShelf(variant: string | undefined): BufFurniture {
  const games = variant === 'games';
  const s = floorSheet(2, 1, 28);
  const b = s.buf;
  const m = ramp(games ? '#2c3358' : '#ece7dc', 0.05);
  frontFace(b, 0, -26, 32, 40, m);
  b.vline(0, -26, 13, m.lt);
  const r = rngOf(games ? 71 : 41, 9);
  for (let row = 0; row < 4; row++) {
    const y = -22 + row * 10;
    b.hline(1, 30, y + 8, games ? '#171b33' : '#b9ae98');
    b.hline(1, 30, y + 9, games ? '#0f1226' : '#9c917c');
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 6;
      if (games) {
        // caixas de jogos em pé, com a capa colorida e a faixa de cima
        const c = pick(r, ACCENTS);
        b.rect(x, y + 1, 5, 7, c);
        b.hline(x, x + 4, y + 1, ramp(c, 0.2).hi);
        b.rect(x + 1, y + 3, 3, 2, '#f4f1e6');
        b.vline(x + 4, y + 1, y + 7, ramp(c, 0.15).dk);
      } else {
        // pilha de roupas dobradas
        const c = pick(r, CLOTHES);
        const h = 3 + Math.floor(r() * 3);
        for (let k = 0; k < h; k++) {
          b.rect(x, y + 8 - (k + 1) * 2, 5, 2, k % 2 ? c : ramp(c, 0.1).lt);
          b.hline(x, x + 4, y + 8 - (k + 1) * 2, ramp(c, 0.2).hi);
        }
      }
    }
  }
  b.outline();
  contact(b, 0, 13, 32, 4, 0.24);
  return { base: s };
}

/** Manequim vestido sobre um pedestal. */
export function mannequin(variant: string | undefined): BufFurniture {
  const pink = variant === 'pink';
  const s = floorSheet(1, 1, 26);
  const b = s.buf;
  const cloth = ramp(pink ? '#e47aa8' : '#3f7fd8', 0.08);
  const skin = '#e6d6bd';
  // pedestal e haste
  b.ellipse(8, 13, 6, 2, '#4a4f5a');
  b.ellipse(8, 12, 5, 1, '#6d7583');
  b.vline(8, -2, 12, '#8d97a6');
  // saia/calça, tronco, ombros e pescoço
  if (pink) {
    b.rect(4, -3, 9, 6, cloth.base);
    b.rect(3, 2, 11, 4, cloth.dk);
    b.hline(3, 13, 2, cloth.lt);
  } else {
    b.rect(5, -3, 3, 12, '#3a3f58');
    b.rect(9, -3, 3, 12, '#2f3248');
  }
  b.rect(4, -14, 9, 12, cloth.base);
  b.vline(4, -14, -3, cloth.lt);
  b.vline(12, -14, -3, cloth.dk);
  b.rect(2, -15, 13, 3, cloth.lt);
  b.rect(7, -18, 3, 3, skin);
  b.ellipse(8, -22, 3, 4, skin);
  b.set(7, -23, '#b8a88c');
  b.outline();
  contact(b, 2, 13, 12, 3, 0.2);
  return { base: s };
}

/** Esteira de academia (1x2): console ao norte e correia escura de lado a lado. */
export function treadmill(): BufFurniture {
  const s = floorSheet(1, 2, 22);
  const b = s.buf;
  const frame = ramp('#3a3f4b', 0.07);
  // correia e laterais
  b.rect(1, -2, 14, 32, '#2a2e38');
  b.rect(1, -2, 2, 32, frame.hi);
  b.rect(13, -2, 2, 32, frame.dk);
  for (let y = 0; y < 30; y += 4) b.hline(3, 12, y, '#3a3f4b');
  b.rect(1, 28, 14, 3, frame.dd);
  // hastes e console com a tela
  b.vline(2, -20, 0, '#b9c0ca');
  b.vline(13, -20, 0, '#b9c0ca');
  frontFace(b, 1, -23, 14, 8, frame);
  b.hline(1, 14, -23, frame.hi);
  b.rect(4, -22, 8, 4, '#14213d');
  b.rect(5, -21, 6, 2, '#4aa3f0');
  b.set(5, -21, '#7be08a');
  b.set(12, -16, '#e05a5a');
  b.outline();
  contact(b, 0, 29, 16, 4, 0.24);
  return { base: s };
}

/** Banco de supino com a barra e os anilhas sobre o suporte. */
export function weightBench(): BufFurniture {
  const s = floorSheet(2, 1, 16);
  const b = s.buf;
  const pad = ramp('#2f333d', 0.08);
  // suporte da barra e a barra com anilhas
  b.vline(6, -10, 12, '#6d7583');
  b.vline(25, -10, 12, '#6d7583');
  b.hline(1, 30, -9, '#d9dde3');
  b.rect(1, -14, 3, 11, '#2a2e38');
  b.rect(28, -14, 3, 11, '#2a2e38');
  b.hline(1, 3, -14, pad.hi);
  b.hline(28, 30, -14, pad.hi);
  // banco acolchoado
  b.rect(5, 2, 22, 5, pad.lt);
  b.hline(5, 26, 2, pad.hi);
  b.hline(5, 26, 6, pad.dk);
  b.rect(5, 7, 22, 1, '#171b24');
  for (const x of [7, 23]) b.rect(x, 8, 2, 5, '#6d7583');
  b.rect(3, 12, 26, 1, '#4a4f5a');
  b.outline();
  contact(b, 1, 13, 30, 3, 0.24);
  return { base: s };
}

/** Suporte de halteres em duas fileiras. */
export function dumbbellRack(): BufFurniture {
  const s = floorSheet(2, 1, 12);
  const b = s.buf;
  const frame = ramp('#474d5c', 0.07);
  frontFace(b, 0, -2, 32, 16, frame);
  b.hline(1, 30, 5, '#171b24');
  const r = rngOf(53, 3);
  for (let row = 0; row < 2; row++) {
    const y = -8 + row * 8;
    b.rect(0, y + 6, 32, 2, frame.lt);
    for (let i = 0; i < 6; i++) {
      const x = 2 + i * 5;
      const c = pick(r, ['#2a2e38', '#e05a5a', '#3f7fd8', '#2a2e38']);
      b.rect(x, y + 1, 4, 5, c);
      b.rect(x + 1, y, 2, 1, '#b9c0ca');
      b.hline(x, x + 3, y + 1, ramp(c, 0.2).hi);
    }
  }
  b.outline();
  contact(b, 0, 13, 32, 4, 0.24);
  return { base: s };
}

/** Balcão da praça de alimentação (3x1) com toldo e vitrine; variantes: pizza, burger, sushi, sorvete. */
export function foodCounter(variant: string | undefined): BufFurniture {
  const theme: Record<string, [string, string]> = {
    pizza: ['#d94a4a', '#fff1d0'],
    burger: ['#e8a33d', '#6b3f22'],
    sushi: ['#2f3a66', '#f4f1e6'],
    sorvete: ['#e47aa8', '#9fe3f0'],
  };
  const [awning, accent] = theme[variant ?? 'pizza'] ?? theme.pizza;
  const s = floorSheet(3, 1, 30);
  const b = s.buf;
  const body = ramp('#8a6a45', 0.06);
  const aw = ramp(awning, 0.08);
  // painel do fundo com o cardápio e o toldo listrado
  b.rect(1, -22, 46, 26, '#ece7dc');
  b.rect(4, -18, 14, 9, '#1c2230');
  for (let i = 0; i < 4; i++) b.hline(6, 15, -16 + i * 2, accent);
  b.rect(1, -29, 46, 7, aw.base);
  for (let x = 1; x < 47; x += 6) b.rect(x, -29, 3, 7, aw.lt);
  b.hline(1, 46, -29, aw.hi);
  b.hline(1, 46, -23, aw.dk);
  // balcão e vitrine de vidro com a comida
  topFace(b, 0, 0, 48, 4, ramp('#e9e5dc', 0.04));
  frontFace(b, 0, 4, 48, 10, body);
  b.vline(0, 4, 13, body.lt);
  glass(b, 20, -8, 26, 9, { alpha: 0.28 });
  const r = rngOf(67, 7);
  for (let i = 0; i < 7; i++) {
    const c = pick(r, [accent, awning, '#f2c14e', '#7bbf6a', '#f4f1e6']);
    b.rect(21 + i * 3, -2, 3, 3, c);
    b.set(21 + i * 3, -2, ramp(c, 0.2).hi);
  }
  b.rect(3, 6, 8, 5, aw.dk);
  b.outline();
  contact(b, 0, 13, 48, 4, 0.26);
  return { base: s };
}

/** Fonte do átrio (2x2): bacia de pedra, água e um esguicho no centro. */
export function fountain(): BufFurniture {
  const s = floorSheet(2, 2, 14);
  const b = s.buf;
  const stone = ramp('#b9b4a8', 0.06);
  b.ellipse(16, 22, 15, 9, stone.dk);
  b.ellipse(16, 21, 15, 8, stone.lt);
  b.ellipse(16, 21, 12, 6, '#4a9fd8');
  b.ellipse(16, 20, 9, 4, '#7cc4f0');
  // pedestal e esguicho
  b.rect(14, 6, 5, 14, stone.base);
  b.vline(14, 6, 19, stone.lt);
  b.ellipse(16, 5, 5, 2, stone.lt);
  for (const [x, y] of [[16, -3], [15, -1], [17, -1], [14, 1], [18, 1], [13, 3], [19, 3]] as const) b.set(x, y, '#cfeefc');
  b.vline(16, -2, 4, '#9fd8f5');
  b.outline();
  contact(b, 1, 27, 30, 4, 0.2);
  return { base: s };
}

// ------------------------------------------------------------------ dojo (ao lado do shopping)

/** Saco de pancada pendurado numa corrente (1x1). */
export function punchingBag(): BufFurniture {
  const s = floorSheet(1, 1, 28);
  const b = s.buf;
  const leather = ramp('#c0392b', 0.08);
  // suporte no teto, corrente e o saco
  b.rect(3, -27, 10, 2, '#6d7583');
  b.hline(3, 12, -27, '#b9c0ca');
  b.vline(8, -25, -16, '#9aa3b2');
  b.set(7, -21, '#9aa3b2');
  b.set(9, -19, '#9aa3b2');
  b.rect(4, -16, 8, 21, leather.base);
  b.vline(4, -16, 4, leather.lt);
  b.vline(11, -16, 4, leather.dk);
  b.hline(4, 11, -16, leather.hi);
  for (const y of [-12, -4]) b.hline(4, 11, y, leather.dd);
  b.rect(3, -17, 10, 2, '#2a2e38');
  b.rect(3, 4, 10, 2, '#2a2e38');
  // tapetinho no chão sob o saco
  b.ellipse(8, 13, 6, 2, '#2f3a66');
  b.outline();
  contact(b, 3, 13, 10, 3, 0.2);
  return { base: s };
}

/** Rack de armas de treino (2x1): bokkens, bastões e faixas coloridas pendurados num painel de madeira. */
export function weaponRack(): BufFurniture {
  const s = floorSheet(2, 1, 28);
  const b = s.buf;
  const wood = ramp('#7a5a45', 0.07);
  frontFace(b, 0, -26, 32, 40, wood);
  b.vline(0, -26, 13, wood.lt);
  // armas de madeira em pé, em prateleiras
  const pale = ramp('#d9b88e', 0.07);
  for (const [x, len] of [[4, 24], [8, 20], [12, 24], [18, 22], [22, 24]] as const) {
    b.rect(x, -22, 2, len, pale.base);
    b.vline(x, -22, -22 + len - 1, pale.lt);
    b.rect(x - 1, -22 + len - 8, 4, 2, '#3a3f4b');
  }
  b.hline(1, 30, -4, wood.dd);
  b.hline(1, 30, 6, wood.dd);
  // faixas de graduação penduradas
  for (const [x, c] of [[25, '#f4f4f0'], [27, '#f2c14e'], [29, '#4cae6a']] as const) {
    b.rect(x, -23, 1, 14, c);
    b.set(x, -24, '#3a3f4b');
  }
  b.outline();
  contact(b, 0, 13, 32, 4, 0.24);
  return { base: s };
}

/** Vitrine de troféus (2x1): vidro com copas douradas, medalhas e uma faixa preta. */
export function trophyCase(): BufFurniture {
  const s = floorSheet(2, 1, 28);
  const b = s.buf;
  const frame = ramp('#5a4a3c', 0.07);
  frontFace(b, 0, -26, 32, 40, frame);
  b.rect(2, -23, 28, 32, '#1c2230');
  const gold = '#f2c14e';
  // copas em duas prateleiras
  for (const [x, y, h] of [[4, -8, 9], [12, -8, 7], [21, -8, 9], [7, 7, 6], [16, 7, 8], [24, 7, 6]] as const) {
    b.rect(x, y - h, 6, 2, gold);
    b.rect(x + 1, y - h + 2, 4, h - 4, gold);
    b.rect(x + 2, y - 2, 2, 2, '#c99a2e');
    b.rect(x, y, 6, 1, '#8a6a2a');
    b.set(x + 1, y - h + 3, '#fff2b0');
  }
  b.hline(2, 29, -7, frame.lt);
  b.hline(2, 29, 8, frame.lt);
  // medalhas penduradas no alto
  for (const [x, c] of [[6, '#d9a42e'], [12, '#c9ced6'], [18, '#c9713f'], [24, '#d9a42e']] as const) {
    b.vline(x, -22, -17, '#7d8594');
    b.rect(x - 1, -16, 3, 3, c);
  }
  glass(b, 2, -23, 28, 32, { alpha: 0.16 });
  b.outline();
  contact(b, 0, 13, 32, 4, 0.24);
  return { base: s };
}

// ------------------------------------------------------------------ clube de tiro e quadra de futebol

/** Cabine de tiro (1x1): balcão de madeira com divisórias dos lados, abafadores de ouvido e o painel da raia. */
export function shootingBooth(): BufFurniture {
  const s = floorSheet(1, 1, 22);
  const b = s.buf;
  const wood = ramp('#8a6a45', 0.07);
  const panel = ramp('#4a5a80', 0.07);
  // divisórias laterais
  for (const x of [0, 13]) {
    b.rect(x, -16, 3, 29, panel.base);
    b.vline(x, -16, 12, panel.lt);
    b.vline(x + 2, -16, 12, panel.dk);
    b.hline(x, x + 2, -16, panel.hi);
  }
  // balcão com tampo claro
  frontFace(b, 2, -2, 12, 14, wood);
  b.hline(2, 13, -3, ramp('#c9a273', 0.06).lt);
  b.rect(2, -4, 12, 2, ramp('#c9a273', 0.06).base);
  // abafadores de ouvido e o painel da raia
  b.rect(4, -7, 5, 3, '#2a2e38');
  b.hline(5, 7, -8, '#3a3f4b');
  b.rect(4, -6, 1, 2, '#e05a5a');
  b.rect(8, -6, 1, 2, '#e05a5a');
  b.rect(10, -8, 3, 4, '#1c2230');
  b.set(11, -7, '#7be08a');
  b.set(12, -6, '#f2c14e');
  b.outline();
  contact(b, 0, 13, 16, 3, 0.22);
  return { base: s };
}

/** Alvo de papel num suporte (1x1): anéis vermelhos e brancos, com alguns furos. */
export function targetStand(): BufFurniture {
  const s = floorSheet(1, 1, 28);
  const b = s.buf;
  // pé de madeira
  b.vline(8, -4, 12, '#6e5236');
  b.vline(9, -4, 12, '#8a6a45');
  b.rect(4, 12, 8, 2, '#4a4f5a');
  // o alvo: anéis concêntricos
  b.ellipse(8, -14, 7, 9, '#f4f4f0');
  b.ellipse(8, -14, 6, 8, '#c0392b');
  b.ellipse(8, -14, 4, 6, '#f4f4f0');
  b.ellipse(8, -14, 3, 4, '#c0392b');
  b.ellipse(8, -14, 1, 2, '#2a2e38');
  b.rect(7, -26, 2, 3, '#8a6a45');
  // furos
  for (const [x, y] of [[9, -13], [7, -16], [10, -11]] as const) b.set(x, y, '#1c2230');
  b.outline();
  contact(b, 3, 13, 10, 3, 0.2);
  return { base: s };
}

/** Trave de futebol (1x3, aberta para o campo): 'west' tem a rede a oeste (o gol da esquerda), 'east' o espelho. */
export function goal(variant: string | undefined): BufFurniture {
  const east = variant === 'east';
  const s = floorSheet(1, 3, 14);
  const b = s.buf;
  const X = (x: number) => (east ? 15 - x : x);
  const post = '#f4f4f0';
  const net = 'rgba(235,240,245,0.55)';
  // rede ao fundo: painel com malha
  for (let y = 2; y < 44; y++) for (let x = 2; x < 9; x++) b.set(X(x), y, (x + y) % 3 === 0 ? net : 'rgba(210,220,230,0.18)');
  // laterais da rede (de cima para o chão)
  for (const y of [2, 44]) {
    for (let x = 2; x < 10; x++) b.set(X(x), y - Math.round((9 - x) * 0.7), net);
  }
  // traves: duas hastes na boca do gol e o travessão
  for (const y of [2, 44]) b.vline(X(10), y - 12, y, post);
  b.vline(X(10), -10, 32, post);
  b.vline(X(11), -10, 32, '#cfd6de');
  b.vline(X(9), 2, 44, 'rgba(235,240,245,0.5)');
  b.hline(Math.min(X(10), X(2)), Math.max(X(10), X(2)), -10, '#cfd6de');
  b.outline();
  contact(b, east ? 2 : 6, 44, 8, 3, 0.18);
  return { base: s };
}

export { M };

/**
 * Kart (1x1) nas cores red/blue/green/yellow. A variante pode levar "-down" (de frente para a câmera) ou "-up" (de costas)
 * para o kart que anda pela pista; sem sufixo ele aparece de lado, virado para leste (o desenho espelha para oeste).
 * Estado 1: a vaga do grid vazia (o kart saiu para a pista).
 */
export function kart(variant?: string, state = 0): BufFurniture {
  const s = floorSheet(1, 1, 14);
  const b = s.buf;
  const [name, facing = 'side'] = (variant ?? 'red').split('-');
  const colors: Record<string, string> = { red: '#d9473d', blue: '#3f7fd8', green: '#3fae5a', yellow: '#f2c14e' };
  const body = ramp(colors[name] ?? colors.red, 0.08);
  const dark = ramp('#2a2e38', 0.08);
  if (state === 1) {
    // vaga vazia: retângulo escuro com os cantos marcados em branco
    b.rect(1, 8, 14, 6, '#454b57');
    for (const [x, y] of [[1, 8], [13, 8], [1, 12], [13, 12]] as const) b.rect(x, y, 2, 2, '#f4f4f0');
    return { base: s };
  }
  if (facing === 'down' || facing === 'up') {
    const front = facing === 'down';
    // rodas dos dois lados, chassi no meio e o aerofólio atrás
    for (const x of [3, 12]) {
      b.ellipse(x, 10, 2, 3, dark.base);
      b.set(x, 10, '#8a909c');
    }
    b.rect(4, 3, 8, 8, body.base);
    b.hline(4, 11, 3, body.hi);
    b.hline(4, 11, 10, body.dk);
    if (front) {
      b.rect(5, 9, 6, 3, body.base);
      b.rect(6, 1, 4, 4, dark.base);
      b.rect(7, 4, 2, 1, '#e8e8ee');
      b.rect(7, 7, 2, 1, '#f4f4f0');
    } else {
      b.rect(2, 0, 12, 2, dark.base);
      b.hline(2, 13, 0, dark.lt);
      b.rect(6, 2, 4, 3, dark.base);
      b.set(5, 11, '#6b7280');
      b.set(10, 11, '#6b7280');
    }
    b.outline();
    contact(b, 1, 14, 12, 3, 0.2);
    return { base: s };
  }
  // rodas de trás e da frente
  b.ellipse(3, 10, 3, 3, dark.base);
  b.ellipse(12, 10, 3, 3, dark.base);
  b.set(3, 10, '#8a909c');
  b.set(12, 10, '#8a909c');
  // chassi: nariz fino à frente, corpo e aerofólio atrás
  b.rect(2, 4, 12, 6, body.base);
  b.rect(11, 5, 4, 4, body.base);
  b.hline(2, 13, 4, body.hi);
  b.hline(2, 14, 9, body.dk);
  b.rect(0, 1, 2, 5, dark.base);
  b.hline(0, 2, 1, dark.lt);
  // banco e volante
  b.rect(4, 0, 4, 5, dark.base);
  b.hline(4, 7, 0, dark.lt);
  b.rect(9, 1, 1, 4, '#e8e8ee');
  b.set(9, 1, '#8a909c');
  // número no capô
  b.rect(11, 6, 3, 1, '#f4f4f0');
  b.outline();
  contact(b, 0, 14, 12, 3, 0.2);
  return { base: s };
}
