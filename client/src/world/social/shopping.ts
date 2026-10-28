// Lazer pago: o que se compra no shopping com as moedinhas 🪙 ganhas trabalhando (carteiras em social/wallet.ts).
// Puro (sem DOM), para testar. O passeio "shopping" (sim/sim.ts) só escolhe o que o saldo paga, e a compra acontece no
// caixa/balcão do lugar (Social.purchase tira as moedas, mostra o "-🪙" e põe uma linha no feed).
import { tr } from '../../../../shared/i18n';
import type { AppearanceParts } from '../../../../shared/appearance';
import { ACC_COLORS, BOTTOMS, JACKET_COLORS, LIGHT_ACCENTS, SHOES, TOP_COLORS } from '../../../../shared/world/appearance-flat';

export type MallDest = 'roupas' | 'games' | 'academia' | 'comida' | 'jogos' | 'cinema' | 'dojo' | 'quadra' | 'tiro' | 'kart';

export interface ShopItem {
  id: string;
  dest: MallDest;
  /** Nome do que se leva (já traduzido). */
  name: string;
  price: number;
  icon: string;
}

/** Cardápio e vitrines do shopping, do mais barato ao mais caro de cada lugar. */
export const SHOP_ITEMS: readonly ShopItem[] = [
  { id: 'cap', dest: 'roupas', name: tr('um boné'), price: 15, icon: '🧢' },
  { id: 'tee', dest: 'roupas', name: tr('uma camiseta'), price: 20, icon: '👕' },
  { id: 'dress', dest: 'roupas', name: tr('um vestido'), price: 50, icon: '👗' },
  { id: 'sneakers', dest: 'roupas', name: tr('um tênis novo'), price: 45, icon: '👟' },
  { id: 'jacket', dest: 'roupas', name: tr('uma jaqueta'), price: 60, icon: '🧥' },
  { id: 'plush', dest: 'games', name: tr('um boneco colecionável'), price: 25, icon: '🧸' },
  { id: 'game', dest: 'games', name: tr('um jogo novo'), price: 40, icon: '🎮' },
  { id: 'controller', dest: 'games', name: tr('um controle'), price: 55, icon: '🕹️' },
  { id: 'daypass', dest: 'academia', name: tr('a diária'), price: 12, icon: '🏋️' },
  { id: 'icecream', dest: 'comida', name: tr('um sorvete'), price: 6, icon: '🍦' },
  { id: 'burger', dest: 'comida', name: tr('um hambúrguer'), price: 10, icon: '🍔' },
  { id: 'pizza', dest: 'comida', name: tr('uma pizza'), price: 12, icon: '🍕' },
  { id: 'sushi', dest: 'comida', name: tr('um combinado de sushi'), price: 18, icon: '🍣' },
  { id: 'tokens', dest: 'jogos', name: tr('fichas de fliperama'), price: 5, icon: '🕹️' },
  { id: 'ticket', dest: 'cinema', name: tr('um ingresso de cinema'), price: 15, icon: '🎬' },
  { id: 'class', dest: 'dojo', name: tr('uma aula de artes marciais'), price: 18, icon: '🥋' },
  { id: 'court', dest: 'quadra', name: tr('o aluguel da quadra'), price: 8, icon: '⚽' },
  { id: 'range', dest: 'tiro', name: tr('uma sessão no clube de tiro'), price: 20, icon: '🎯' },
  { id: 'kart', dest: 'kart', name: tr('uma bateria de kart'), price: 15, icon: '🏎️' },
];

/** Saldo mínimo que algum lugar do shopping aceita (abaixo disso ninguém sai para gastar). */
export const MIN_SPEND = Math.min(...SHOP_ITEMS.map((i) => i.price));

export function itemsOf(dest: MallDest): readonly ShopItem[] {
  return SHOP_ITEMS.filter((i) => i.dest === dest);
}

/** Menor preço do lugar. */
export function minPrice(dest: MallDest): number {
  return Math.min(...itemsOf(dest).map((i) => i.price));
}

/** O que o saldo paga em um lugar, do mais barato ao mais caro. */
export function affordable(dest: MallDest, coins: number): ShopItem[] {
  return itemsOf(dest)
    .filter((i) => i.price <= coins)
    .sort((a, b) => a.price - b.price);
}

/**
 * Sorteia o que comprar: entre o que o saldo paga, quem está mais folgado tende a escolher coisas mais caras
 * (peso proporcional ao preço), e quem está no limite leva o mais em conta. null se nada cabe no saldo.
 */
export function pickItem(dest: MallDest, coins: number, rng: () => number): ShopItem | null {
  const list = affordable(dest, coins);
  if (!list.length) return null;
  // folga = fração do saldo que o item custaria; quem tem muito sobrando se permite o caro
  const weights = list.map((i) => 1 + (coins >= i.price * 2 ? i.price / 10 : 0));
  let total = 0;
  for (const w of weights) total += w;
  let r = rng() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r < 0) return list[i];
  }
  return list[list.length - 1];
}

/** Quanto o saldo pesa na vontade de ir ao shopping: pouco dinheiro = quase nunca, muito = com mais frequência. */
export function wealthFactor(coins: number): number {
  if (coins < MIN_SPEND) return 0;
  return Math.max(0.3, Math.min(2.5, coins / 60));
}

/** A linha do feed (sem o nome de quem comprou): "comprou um tênis novo na Moda Urbana (🪙45)". */
export function purchaseText(item: ShopItem, place: string): string {
  switch (item.dest) {
    case 'comida':
      return tr('comeu {0} na praça de alimentação (🪙{1})', [item.name, item.price]);
    case 'academia':
      return tr('pagou {0} e foi malhar na academia (🪙{1})', [item.name, item.price]);
    case 'jogos':
      return tr('gastou 🪙{0} em fichas na área de jogos', [item.price]);
    case 'cinema':
      return tr('comprou {0} e foi ver um filme (🪙{1})', [item.name, item.price]);
    case 'dojo':
      return tr('pagou {0} no dojo (🪙{1})', [item.name, item.price]);
    case 'quadra':
      return tr('pagou {0} e foi jogar bola (🪙{1})', [item.name, item.price]);
    case 'tiro':
      return tr('pagou {0} e foi mirar nos alvos (🪙{1})', [item.name, item.price]);
    case 'kart':
      return tr('pagou {0} e foi acelerar na pista (🪙{1})', [item.name, item.price]);
    default:
      return tr('comprou {0} na {1} (🪙{2})', [item.name, place, item.price]);
  }
}

/** O que o agente comenta ao comprar. */
export function purchaseSay(item: ShopItem): string {
  switch (item.dest) {
    case 'comida':
      return `${item.icon} ${tr('Hmm, que cheiro bom!')}`;
    case 'academia':
      return `${item.icon} ${tr('Bora treinar!')}`;
    case 'jogos':
      return `${item.icon} ${tr('Só mais uma partida!')}`;
    case 'cinema':
      return `${item.icon} ${tr('Pipoca e filme, perfeito!')}`;
    case 'dojo':
      return `${item.icon} ${tr('Osu! Vamos treinar!')}`;
    case 'quadra':
      return `${item.icon} ${tr('Quem chuta melhor?')}`;
    case 'tiro':
      return `${item.icon} ${tr('Foco no alvo...')}`;
    case 'kart':
      return `${item.icon} ${tr('Pé na tábua!')}`;
    case 'games':
      return `${item.icon} ${tr('Esse eu queria!')}`;
    default:
      return `${item.icon} ${tr('Ficou ótimo em mim!')}`;
  }
}

// ---------------------------------------------------------------- guarda-roupa

/** As peças de roupa de uma aparência (o que as lojas de roupas trocam): o resto do visual não muda. */
export type OutfitParts = Pick<AppearanceParts, 'top' | 'topAccent' | 'topStyle' | 'bottom' | 'bottomStyle' | 'shoes' | 'accessory' | 'accessoryColor'>;
export const OUTFIT_KEYS = ['top', 'topAccent', 'topStyle', 'bottom', 'bottomStyle', 'shoes', 'accessory', 'accessoryColor'] as const;

/** O que a roupa atual tem (o mínimo de Appearance que a escolha olha). */
export interface CurrentLook {
  top: string;
  bottom: string;
  shoes: string;
  accessoryColor: string;
}

/** Uma cor da lista diferente da atual (a peça nova tem que ser visivelmente outra). */
function another(list: readonly string[], current: string | undefined, rng: () => number): string {
  const options = list.filter((c) => c.toLowerCase() !== (current ?? '').toLowerCase());
  const pool = options.length ? options : list;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

const colorsOf = (pairs: readonly (readonly [string, number])[]): string[] => pairs.map(([c]) => c);

/**
 * Como o agente vai ficar com a peça escolhida: troca só as peças dela, em uma cor diferente da que ele já usa.
 * boné -> boné; camiseta -> camiseta (às vezes com calça nova); vestido -> blusa e saia; tênis -> tênis; jaqueta -> jaqueta.
 * null quando o item não é roupa.
 */
export function newOutfit(item: ShopItem, now: CurrentLook, rng: () => number): OutfitParts | null {
  switch (item.id) {
    case 'cap':
      return { accessory: 'cap', accessoryColor: another(ACC_COLORS.cap ?? TOP_COLORS, now.accessoryColor, rng) };
    case 'tee': {
      const out: OutfitParts = { topStyle: 'tshirt', top: another(TOP_COLORS, now.top, rng), topAccent: another(LIGHT_ACCENTS, undefined, rng) };
      if (rng() < 0.3) out.bottom = another(colorsOf(BOTTOMS), now.bottom, rng);
      return out;
    }
    case 'dress':
      return { topStyle: 'blouse', top: another(TOP_COLORS, now.top, rng), topAccent: another(LIGHT_ACCENTS, undefined, rng), bottomStyle: 'skirt', bottom: another(colorsOf(BOTTOMS), now.bottom, rng) };
    case 'sneakers':
      return { shoes: another(colorsOf(SHOES), now.shoes, rng) };
    case 'jacket':
      return { topStyle: 'jacket', top: another(JACKET_COLORS, now.top, rng), topAccent: another(LIGHT_ACCENTS, undefined, rng) };
    default:
      return null;
  }
}

/** Mantém só as peças de roupa (e só valores de texto): o que vem do navegador não é de confiança. */
export function cleanOutfit(raw: unknown): OutfitParts | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const k of OUTFIT_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.length > 0 && v.length < 40) out[k] = v;
  }
  return Object.keys(out).length ? (out as OutfitParts) : undefined;
}
