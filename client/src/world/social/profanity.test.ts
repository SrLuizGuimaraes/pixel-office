// Pacote de palavrões: as pools existem, só entram quando ligado, estão traduzidas e não ofendem grupos.
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../../shared/hash';
import { EN } from '../../../../shared/locales/en';
import { ES } from '../../../../shared/locales/es';
import { FR } from '../../../../shared/locales/fr';
import { DEFAULT_PREFS, sanitizePrefs, worldOptionsFrom } from '../../ui/prefs';
import { CHAT, pick, pickMix, RPS } from './lines';
import { SWEAR } from './profanity';

const all = Object.entries(SWEAR).flatMap(([k, pool]) => pool.map((line) => ({ k, line })));

describe('pacote de palavrões', () => {
  it('todas as pools têm falas e ninguém repete a mesma fala numa pool', () => {
    for (const [k, pool] of Object.entries(SWEAR)) {
      expect(pool.length, k).toBeGreaterThan(0);
      expect(new Set(pool).size, k).toBe(pool.length);
    }
  });

  it('todas as falas estão traduzidas (en, es, fr) e mantêm as lacunas', () => {
    for (const { line } of all) {
      for (const [name, dict] of [['en', EN], ['es', ES], ['fr', FR]] as const) {
        const t = dict[line];
        expect(t, `${name}: ${line}`).toBeTruthy();
        for (const m of line.match(/\{\w+\}/g) ?? []) expect(t, `${name}: ${line}`).toContain(m);
      }
    }
  });

  it('só palavrões genéricos: nada de insulto a grupos nem ameaça', () => {
    const banned = /neg[ra]o|preto|macaco|judeu|nazi|viado|bicha|sapat|traveco|retardad|mongol|aleijad|cadeirante|gordo|puta (velha|gorda)|vagabunda|matar|mato (voc|vc)|morr[ae]|estupr|arregao/i;
    for (const { k, line } of all) expect(line, k).not.toMatch(banned);
  });

  it('desligado, nunca usa o pacote e não consome o sorteio', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const line = pickMix(false, RPS.lose, SWEAR.lose, a);
      expect(RPS.lose).toContain(line);
      expect(line).toBe(pick(RPS.lose, b));
    }
  });

  it('ligado, mistura o pacote com as falas normais (variedade, sem repetir sempre a mesma)', () => {
    const rng = mulberry32(11);
    const seen = new Set<string>();
    let swear = 0;
    for (let i = 0; i < 400; i++) {
      const line = pickMix(true, CHAT.react, SWEAR.react, rng);
      seen.add(line);
      if (SWEAR.react.includes(line)) swear++;
    }
    expect(swear).toBeGreaterThan(100);
    expect(swear).toBeLessThan(300);
    expect(seen.size).toBeGreaterThan(CHAT.react.length);
  });

  it('é uma preferência persistida: ligada por padrão, desligável, e vai ao mundo como opção', () => {
    expect(DEFAULT_PREFS.profanity).toBe(true);
    expect(sanitizePrefs(null).profanity).toBe(true);
    expect(sanitizePrefs({ profanity: false }).profanity).toBe(false);
    expect(sanitizePrefs({ profanity: 'sim' }).profanity).toBe(true);
    expect(worldOptionsFrom({ ...DEFAULT_PREFS, profanity: false }).profanity).toBe(false);
    expect(worldOptionsFrom(DEFAULT_PREFS).profanity).toBe(true);
  });
});
