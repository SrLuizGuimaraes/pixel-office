import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../shared/hash';
import { SHOP_ITEMS, MIN_SPEND, affordable, cleanOutfit, minPrice, newOutfit, pickItem, purchaseText, wealthFactor, itemsOf } from './shopping';
import { START_COINS, TASK_REWARD, Wallets, type StorageLike } from './wallet';

const agent = (id = 'a', tasks: { id: string; title: string; status: string }[] = []) => ({ id, name: id, kind: 'main' as const, tasks });
const memory = (): StorageLike & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};

describe('cardápio do shopping', () => {
  it('cada lugar do shopping vende alguma coisa, com preço inteiro positivo', () => {
    for (const d of ['roupas', 'games', 'academia', 'comida', 'jogos', 'cinema'] as const) expect(itemsOf(d).length, d).toBeGreaterThan(0);
    for (const i of SHOP_ITEMS) {
      expect(Number.isInteger(i.price) && i.price > 0, i.id).toBe(true);
      expect(i.name.length, i.id).toBeGreaterThan(0);
    }
    expect(new Set(SHOP_ITEMS.map((i) => i.id)).size).toBe(SHOP_ITEMS.length);
    expect(MIN_SPEND).toBe(Math.min(...SHOP_ITEMS.map((i) => i.price)));
  });

  it('só se escolhe o que o saldo paga; sem saldo, nada', () => {
    expect(affordable('roupas', 14)).toEqual([]);
    expect(affordable('roupas', 20).map((i) => i.id)).toEqual(['cap', 'tee']);
    expect(pickItem('roupas', 14, () => 0.5)).toBeNull();
    const rng = mulberry32(7);
    for (let n = 0; n < 200; n++) {
      const coins = 5 + Math.floor(rng() * 120);
      for (const d of ['roupas', 'games', 'academia', 'comida', 'jogos', 'cinema'] as const) {
        const it = pickItem(d, coins, rng);
        if (it) expect(it.price).toBeLessThanOrEqual(coins);
        else expect(coins).toBeLessThan(minPrice(d));
      }
    }
  });

  it('quem está folgado tende a comprar mais caro', () => {
    const avg = (coins: number) => {
      const rng = mulberry32(coins);
      let s = 0;
      for (let i = 0; i < 400; i++) s += pickItem('roupas', coins, rng)!.price;
      return s / 400;
    };
    expect(avg(200)).toBeGreaterThan(avg(25));
  });

  it('a vontade de ir ao shopping cresce com o saldo e some sem dinheiro', () => {
    expect(wealthFactor(0)).toBe(0);
    expect(wealthFactor(MIN_SPEND - 1)).toBe(0);
    expect(wealthFactor(MIN_SPEND)).toBeGreaterThan(0);
    expect(wealthFactor(300)).toBeGreaterThan(wealthFactor(40));
    expect(wealthFactor(10_000)).toBeLessThanOrEqual(2.5);
  });

  it('a linha do feed nomeia o item, o lugar e o preço', () => {
    const tee = SHOP_ITEMS.find((i) => i.id === 'tee')!;
    expect(purchaseText(tee, 'Moda Urbana')).toContain('Moda Urbana');
    expect(purchaseText(tee, 'Moda Urbana')).toContain('20');
    expect(purchaseText(SHOP_ITEMS.find((i) => i.id === 'pizza')!, '')).toContain('12');
  });
});

describe('roupa nova', () => {
  const now = { top: '#e2604f', bottom: '#3f5f8c', shoes: '#2b2b33', accessoryColor: '#2b2b33' };
  const item = (id: string) => SHOP_ITEMS.find((i) => i.id === id)!;

  it('cada peça de roupa troca as peças dela, numa cor diferente da que ele já usa', () => {
    const rng = mulberry32(5);
    for (let n = 0; n < 60; n++) {
      expect(newOutfit(item('cap'), now, rng)).toMatchObject({ accessory: 'cap' });
      const tee = newOutfit(item('tee'), now, rng)!;
      expect(tee.topStyle).toBe('tshirt');
      expect(tee.top).not.toBe(now.top);
      const dress = newOutfit(item('dress'), now, rng)!;
      expect(dress).toMatchObject({ topStyle: 'blouse', bottomStyle: 'skirt' });
      expect(dress.top).not.toBe(now.top);
      expect(newOutfit(item('sneakers'), now, rng)!.shoes).not.toBe(now.shoes);
      const jacket = newOutfit(item('jacket'), now, rng)!;
      expect(jacket.topStyle).toBe('jacket');
      expect(jacket.top).not.toBe(now.top);
    }
  });

  it('o que não é roupa não muda o visual', () => {
    for (const id of ['game', 'controller', 'pizza', 'daypass', 'tokens', 'ticket', 'plush']) expect(newOutfit(item(id), now, () => 0.5), id).toBeNull();
  });

  it('o guarda-roupa fica na carteira (e só aceita peças de roupa em texto)', () => {
    const st = memory();
    const w = new Wallets(st);
    w.ensure(agent(), 1000);
    w.setOutfit('a', { top: '#112233', topStyle: 'jacket' });
    w.setOutfit('a', { shoes: '#445566' });
    expect(w.get('a')!.outfit).toEqual({ top: '#112233', topStyle: 'jacket', shoes: '#445566' });
    w.save(2000);
    expect(new Wallets(st).get('a')!.outfit).toEqual({ top: '#112233', topStyle: 'jacket', shoes: '#445566' });
    expect(cleanOutfit({ top: '#fff', skin: '#000', shoes: 5, accessory: '' })).toEqual({ top: '#fff' });
    expect(cleanOutfit(null)).toBeUndefined();
    expect(cleanOutfit({})).toBeUndefined();
  });
});

describe('carteira: gastar', () => {
  it('gasta exatamente o preço, registra no extrato e soma o total gasto', () => {
    const w = new Wallets(null);
    w.ensure(agent(), 1000);
    const before = w.coins('a');
    expect(before).toBe(START_COINS.main);
    expect(w.spend('a', 45, '👟', 'Comprou um tênis', 2000)).toBe(45);
    expect(w.coins('a')).toBe(before - 45);
    expect(w.get('a')!.spent).toBe(45);
    expect(w.get('a')!.ledger[0]).toMatchObject({ delta: -45, icon: '👟' });
    // ganho do trabalho não mexe no gasto
    w.credit('a', TASK_REWARD, '✅', 'x', 3000);
    expect(w.get('a')!.spent).toBe(45);
  });

  it('nunca deixa o saldo negativo: sem saldo, não paga nada', () => {
    const w = new Wallets(null);
    w.ensure(agent(), 1000);
    expect(w.spend('a', START_COINS.main + 1, '🎮', 'caro', 2000)).toBe(0);
    expect(w.coins('a')).toBe(START_COINS.main);
    expect(w.spend('a', START_COINS.main, '🎮', 'tudo', 2000)).toBe(START_COINS.main);
    expect(w.coins('a')).toBe(0);
    expect(w.spend('a', 1, '🎮', 'nada', 2000)).toBe(0);
    expect(w.spend('a', 0, '🎮', 'zero', 2000)).toBe(0);
    expect(w.spend('a', -5, '🎮', 'negativo', 2000)).toBe(0);
    expect(w.spend('desconhecido', 5, '🎮', 'x', 2000)).toBe(0);
  });

  it('o gasto fica gravado no navegador e volta ao reabrir', () => {
    const st = memory();
    const w = new Wallets(st);
    w.ensure(agent(), 1000);
    w.spend('a', 30, '🍕', 'Pizza', 2000);
    w.save(3000);
    const again = new Wallets(st);
    expect(again.coins('a')).toBe(START_COINS.main - 30);
    expect(again.get('a')!.spent).toBe(30);
  });

  it('carteiras antigas (sem o campo de gasto) abrem com zero gasto', () => {
    const st = memory();
    st.setItem('pixel-office.wallets.v1', JSON.stringify({ v: 1, wallets: { a: { name: 'a', coins: 50, earned: 100, wins: 0, losses: 0, vs: {}, paid: [], ledger: [], createdAt: 1, seenAt: 1 } } }));
    const w = new Wallets(st);
    expect(w.get('a')!.spent).toBe(0);
    expect(w.coins('a')).toBe(50);
  });
});
