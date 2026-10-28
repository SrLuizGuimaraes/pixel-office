import { afterEach, describe, expect, it } from 'vitest';
import { assembleHouse } from '../layout/building';
import { gx, gz, useHouseMapping, useOfficeMapping } from './mapping';

describe('mapeamento isométrico da casa', () => {
  afterEach(() => useOfficeMapping());

  it('o mapeamento da casa é contínuo e crescente, com as linhas de parede finas', () => {
    const house = assembleHouse([], 0);
    useHouseMapping([...house.core, house.corridor, ...house.rooms]);
    let px = gx(0);
    let pz = gz(0);
    for (let i = 1; i <= 64; i++) {
      expect(gx(i)).toBeGreaterThan(px);
      px = gx(i);
    }
    for (let i = 1; i <= 29; i++) {
      expect(gz(i)).toBeGreaterThan(pz);
      pz = gz(i);
    }
    expect(gz(29)).toBeLessThan(29);
  });
});
