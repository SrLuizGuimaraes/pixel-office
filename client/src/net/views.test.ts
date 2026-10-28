import { describe, expect, it, vi } from 'vitest';
import { isIsoView, isoHref, isTowerView, isView3d, towerHref, view3dHref } from './views';

vi.stubGlobal('location', { pathname: '/' });

describe('vistas do escritório', () => {
  it('reconhece cada vista pela query string', () => {
    expect(isIsoView('?escritorio=iso')).toBe(true);
    expect(isView3d('?escritorio=3d')).toBe(true);
    expect(isTowerView('?escritorio=predio')).toBe(true);
    expect(isIsoView('?mock=1')).toBe(false);
    expect(isView3d('?escritorio=iso')).toBe(false);
  });

  it('o link alterna a vista e preserva o resto da query string', () => {
    expect(isoHref('?mock=1')).toBe('/?mock=1&escritorio=iso');
    expect(isoHref('?mock=1&escritorio=iso')).toBe('/?mock=1');
    expect(view3dHref('')).toBe('/?escritorio=3d');
    expect(view3dHref('?escritorio=3d')).toBe('/');
    expect(towerHref('?escritorio=predio&mock=1')).toBe('/?mock=1');
  });
});
