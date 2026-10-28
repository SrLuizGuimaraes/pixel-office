import { describe, expect, it } from 'vitest';
import type { Activity } from '../../../../shared/types';
import { marqueeX, monitorColors, monitorText } from './monitor-text';

const act = (kind: Activity['kind'], detail?: string): Activity => ({ id: 'a', kind, icon: '', text: '', at: 0, ...(detail === undefined ? {} : { detail }) }) as Activity;

describe('texto do monitor', () => {
  it('terminal: o comando de verdade, com o prompt', () => {
    expect(monitorText(act('run', 'npm run build'))).toBe('$ npm run build');
    expect(monitorText(act('git', 'git status'))).toBe('$ git status');
    expect(monitorText(act('test', 'vitest run'))).toBe('$ vitest run');
  });

  it('editor e leitura: só o nome do arquivo, de caminho Windows ou Unix', () => {
    expect(monitorText(act('edit', 'C:\\Users\\fulano\\app\\store.ts'))).toBe('store.ts');
    expect(monitorText(act('read', '/home/fulano/pixel-office/README.md'))).toBe('README.md');
  });

  it('navegador: o endereço sem o protocolo; busca: a consulta como veio', () => {
    expect(monitorText(act('web', 'https://www.example.com/a/b'))).toBe('example.com/a/b');
    expect(monitorText(act('search', 'tendências de e-commerce'))).toBe('tendências de e-commerce');
  });

  it('só a primeira linha com conteúdo, sem espaços sobrando, e limita o tamanho', () => {
    expect(monitorText(act('run', '\n\n  ls   -la \nsegunda linha'))).toBe('$ ls -la');
    const long = monitorText(act('run', 'x'.repeat(500)));
    expect(long.length).toBe(160);
    expect(long.endsWith('…')).toBe(true);
  });

  it('sem texto quando não há o que mostrar (pensando, sem detalhe, sem atividade)', () => {
    expect(monitorText(undefined)).toBe('');
    expect(monitorText(act('think', 'pensando muito'))).toBe('');
    expect(monitorText(act('run'))).toBe('');
    expect(monitorText(act('run', '   '))).toBe('');
  });

  it('cores seguem o programa da tela, com um padrão para os demais', () => {
    expect(monitorColors('terminal').fg).toBe('#8cf5a8');
    expect(monitorColors('off')).toEqual(monitorColors('idle'));
  });

  it('a faixa rola da direita para a esquerda e recomeça', () => {
    const at = (t: number) => marqueeX(100, 16, 40, t, 0);
    expect(at(0)).toBe(116);
    expect(at(1000)).toBeLessThan(at(0));
    // uma volta completa: (40 + 16) px a 22 px/s
    expect(at((56 / 22) * 1000)).toBeCloseTo(116, 5);
    // monitores diferentes não andam juntos
    expect(marqueeX(100, 16, 40, 0, 1)).not.toBe(marqueeX(100, 16, 40, 0, 2));
  });
});
