// Funcionários fixos das lojas e áreas pagas do shopping (caixas, cozinheiros, instrutores...): personagens "residentes" que só
// existem no cliente, ligados a `building.mall`. Não são agentes: ficam fora de `Sim.chars` (então nada de sidebar, contagem,
// rodas sociais, permissões nem snapshot) e são desenhados pelas vistas a partir de `Sim.staff`.
import { hash32 } from '../../../../shared/hash';
import { tr } from '../../../../shared/i18n';
import type { AgentInfo } from '../../../../shared/types';
import type { Appearance, ArtModule, Dir, HeldItem, Pose } from '../../art/api';
import type { SpotDef } from '../layout/types';

export const STAFF_PREFIX = 'staff:';

export const isStaffId = (id: string): boolean => id.startsWith(STAFF_PREFIX);

/** Um trecho da rotina de trabalho: a pose (e o que tem na mão) e quanto tempo dura. */
export interface Beat {
  pose: Pose;
  held?: HeldItem;
  ms: number;
}

type Talk = 'loja' | 'comida' | 'esporte';

interface Role {
  /** Cargo mostrado no crachá/balão. */
  title: string;
  /** Uniforme: camisa, detalhe e cor do crachá. */
  top: string;
  accent: string;
  badge: string;
  talk: Talk;
  cycle: Beat[];
  /** Áreas atendidas além da própria (o sensei cuida das três salas do dojo). */
  serves?: string[];
}

const SHOP: Beat[] = [
  { pose: 'use', ms: 6000 },
  { pose: 'stand', ms: 4000 },
  { pose: 'read', held: 'papers', ms: 5000 },
  { pose: 'stand', ms: 3500 },
];

const ROLES: Record<string, Role> = {
  'caixa-roupas': { title: tr('Caixa'), top: '#d4577a', accent: '#ffffff', badge: '#ffe08a', talk: 'loja', cycle: SHOP },
  'caixa-games': { title: tr('Caixa'), top: '#3f5fd0', accent: '#ffffff', badge: '#7be08a', talk: 'loja', cycle: SHOP },
  'atendente-jogos': { title: tr('Atendente'), top: '#7a66c8', accent: '#ffffff', badge: '#ffe08a', talk: 'loja', cycle: SHOP },
  cinema: {
    title: tr('Atendente do cinema'),
    top: '#8a3a52',
    accent: '#f2c14e',
    badge: '#f2c14e',
    talk: 'loja',
    cycle: [{ pose: 'stand', held: 'popcorn', ms: 5000 }, { pose: 'use', ms: 5000 }, { pose: 'stand', ms: 3500 }],
  },
  cozinha: {
    title: tr('Cozinheiro'),
    top: '#f1eee6',
    accent: '#d9473d',
    badge: '#d9473d',
    talk: 'comida',
    cycle: [{ pose: 'use', ms: 7000 }, { pose: 'stand', ms: 3000 }, { pose: 'drink', held: 'water', ms: 2500 }, { pose: 'use', ms: 6000 }],
    serves: ['mall:praca'],
  },
  'atendente-praca': {
    title: tr('Atendente'),
    top: '#f2a33d',
    accent: '#ffffff',
    badge: '#ffffff',
    talk: 'comida',
    cycle: [{ pose: 'use', ms: 5000 }, { pose: 'stand', ms: 3500 }, { pose: 'read', held: 'papers', ms: 4000 }],
    serves: ['mall:praca'],
  },
  instrutor: {
    title: tr('Instrutor'),
    top: '#2c8f6a',
    accent: '#ffffff',
    badge: '#ffffff',
    talk: 'esporte',
    cycle: [{ pose: 'stretch', ms: 4000 }, { pose: 'stand', ms: 4000 }, { pose: 'talk', ms: 3000 }, { pose: 'stand', ms: 3000 }],
  },
  sensei: {
    title: tr('Sensei'),
    top: '#f4f4f0',
    accent: '#2a2e38',
    badge: '#2a2e38',
    talk: 'esporte',
    cycle: [{ pose: 'stand', ms: 6000 }, { pose: 'wait', ms: 4500 }, { pose: 'stretch', ms: 3000 }, { pose: 'stand', ms: 4000 }],
    serves: ['dojo:salao', 'dojo:treino', 'dojo:arena'],
  },
  tiro: {
    title: tr('Recepcionista'),
    top: '#4a5a80',
    accent: '#ffffff',
    badge: '#f2c14e',
    talk: 'esporte',
    cycle: [{ pose: 'stand', ms: 5000 }, { pose: 'read', held: 'papers', ms: 5000 }, { pose: 'wait', ms: 3500 }],
  },
  quadra: {
    title: tr('Árbitro'),
    top: '#2a2e38',
    accent: '#f4f4f0',
    badge: '#f4f4f0',
    talk: 'esporte',
    cycle: [{ pose: 'stand', ms: 5000 }, { pose: 'wait', ms: 4000 }, { pose: 'raise_hand', ms: 2000 }, { pose: 'stand', ms: 3000 }],
  },
  kart: {
    title: tr('Fiscal da pista'),
    top: '#f2c14e',
    accent: '#2a2e38',
    badge: '#2a2e38',
    talk: 'esporte',
    cycle: [{ pose: 'stand', ms: 4500 }, { pose: 'raise_hand', ms: 2200 }, { pose: 'wait', ms: 4000 }, { pose: 'read', held: 'papers', ms: 3500 }],
  },
};

const GREET: Record<Talk, string[]> = {
  loja: [tr('Bem-vindo! Posso ajudar?'), tr('Qualquer coisa, é só chamar!'), tr('Dá uma olhada à vontade!')],
  comida: [tr('O que vai ser hoje?'), tr('Tá saindo quentinho!'), tr('Bom apetite!')],
  esporte: [tr('Bom treino!'), tr('Tudo pronto por aqui!'), tr('Boa sorte aí!')],
};

const THANKS: Record<Talk, string[]> = {
  loja: [tr('Obrigado pela compra!'), tr('Volte sempre!')],
  comida: [tr('Aqui está! Obrigado!'), tr('Volte sempre!')],
  esporte: [tr('Boa sessão!'), tr('Volte sempre!')],
};

const NAMES = ['Rita', 'Marcos', 'Bianca', 'Hugo', 'Lúcia', 'Tadeu', 'Cleo', 'Davi', 'Nina', 'Otávio', 'Sônia', 'Caio', 'Lara', 'Beto', 'Mara', 'Jonas'];

/** Estado de um funcionário (em `Character.staff`). */
export interface StaffState {
  roleKey: string;
  title: string;
  /** Área do posto e as áreas que ele atende. */
  areaId: string;
  serves: readonly string[];
  baseDir: Dir;
  cycle: Beat[];
  talk: Talk;
  beat: number;
  beatUntil: number;
  /** Atendendo alguém (balão/pose de conversa) até este instante. */
  reactUntil: number;
  /** Última vez que cumprimentou cada cliente (ms epoch). */
  greeted: Map<string, number>;
}

export function roleOf(spot: SpotDef): Role | undefined {
  return spot.group ? ROLES[spot.group] : undefined;
}

export function greetLine(st: StaffState, rng: () => number): string {
  const l = GREET[st.talk];
  return l[Math.floor(rng() * l.length)];
}

export function thanksLine(st: StaffState, rng: () => number): string {
  const l = THANKS[st.talk];
  return l[Math.floor(rng() * l.length)];
}

export interface StaffBuild {
  info: AgentInfo;
  appearance: Appearance;
  state: StaffState;
}

/** Monta o funcionário de um posto: nome, jeito, uniforme da loja e rotina. Determinístico pelo id do posto. */
export function buildStaff(spot: SpotDef, art: ArtModule, now: number): StaffBuild | null {
  const role = roleOf(spot);
  if (!role) return null;
  const seed = hash32(spot.id);
  const look: 'f' | 'm' = seed & 1 ? 'f' : 'm';
  let appearance: Appearance;
  try {
    const base = art.appearanceFromSeed(seed, { look, sub: false });
    appearance = { ...base, top: role.top, topAccent: role.accent, topStyle: 'polo', lanyard: role.badge, bottom: '#2f3340', shoes: '#1d1f27' };
  } catch {
    return null;
  }
  const info: AgentInfo = {
    id: STAFF_PREFIX + spot.id,
    kind: 'main',
    roomId: spot.areaId,
    name: NAMES[(seed >>> 4) % NAMES.length],
    look,
    role: role.title,
    sessionId: '',
    account: '',
    status: 'working',
    recent: [],
    tasks: [],
    startedAt: now,
    lastEventAt: now,
    statusSince: now,
    stats: { toolCalls: 0, tokensIn: 0, tokensOut: 0, subagents: 0 },
    seed,
  };
  const state: StaffState = {
    roleKey: spot.group ?? '',
    title: role.title,
    areaId: spot.areaId,
    serves: [spot.areaId, ...(role.serves ?? [])],
    baseDir: spot.dir,
    cycle: role.cycle,
    talk: role.talk,
    beat: seed % role.cycle.length,
    beatUntil: 0,
    reactUntil: 0,
    greeted: new Map(),
  };
  return { info, appearance, state };
}

/** Raio (px) em que um cliente é cumprimentado: 3 tiles. */
export const GREET_RADIUS = 48;
/** Tempo (ms) até cumprimentar o mesmo cliente de novo. */
export const GREET_COOLDOWN_MS = 25_000;
