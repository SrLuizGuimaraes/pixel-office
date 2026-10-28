import { describe, expect, it } from 'vitest';
import { BUILDING_H, COL_W, ROOM_H } from '../world/constants';
import { MALL_BOTTOM, MALL_Y } from '../world/layout/mall';
import { colWeight, footToWorld3, mapX, mapZ, rowWeight, toWorld3 } from './mapping';

describe('mapeamento grade -> 3D (a planta do escritório)', () => {
  it('mapX e mapZ são contínuos e crescentes', () => {
    let px = mapX(0.01);
    for (let x = 0.06; x <= COL_W * 8; x += 0.05) {
      const v = mapX(x);
      expect(v, `x=${x.toFixed(2)}`).toBeGreaterThan(px);
      expect(v - px).toBeLessThan(0.06);
      px = v;
    }
    let pz = mapZ(0.01);
    for (let z = 0.06; z <= MALL_BOTTOM + 5; z += 0.05) {
      const v = mapZ(z);
      expect(v, `z=${z.toFixed(2)}`).toBeGreaterThan(pz);
      expect(v - pz).toBeLessThan(0.06);
      pz = v;
    }
  });

  it('o piso dos cômodos fica em escala 1:1 e as paredes viram faixas finas', () => {
    // uma sala do prédio: piso de 14 colunas (1 a 14) e de 9 linhas (2 a 10)
    expect(mapX(15) - mapX(1)).toBeCloseTo(14, 6);
    expect(mapZ(11) - mapZ(2)).toBeCloseTo(9, 6);
    // a parede entre dois cômodos (colunas 15 e 16) e a face norte (linhas 0-1) pesam menos de meio tile
    expect(mapX(17) - mapX(15)).toBeLessThan(0.5);
    expect(mapZ(2) - mapZ(0)).toBeLessThan(0.5);
    // as salas do sul: face (17-18) e piso (19 a 27)
    expect(mapZ(19) - mapZ(17)).toBeLessThan(0.5);
    expect(mapZ(28) - mapZ(19)).toBeCloseTo(9, 6);
    // o corredor (12 a 16) é largo
    expect(mapZ(17) - mapZ(12)).toBeCloseTo(5, 6);
    // o período das colunas se repete (cada coluna de salas tem a mesma largura)
    expect(mapX(COL_W * 3 + 1) - mapX(COL_W * 2 + 1)).toBeCloseTo(mapX(COL_W + 1) - mapX(1), 6);
  });

  it('o shopping segue o mesmo padrão de faixas de 12 linhas', () => {
    expect(rowWeight(MALL_Y)).toBeLessThan(1);
    expect(rowWeight(MALL_Y + 1)).toBeLessThan(1);
    expect(rowWeight(MALL_Y + 2)).toBe(1);
    expect(rowWeight(MALL_Y + ROOM_H - 1)).toBeLessThan(1);
    expect(rowWeight(MALL_Y + ROOM_H)).toBeLessThan(1);
    expect(mapZ(MALL_Y + 11) - mapZ(MALL_Y + 2)).toBeCloseTo(9, 6);
    // entre o prédio e o shopping (calçada, rua) as linhas pesam 1
    expect(mapZ(MALL_Y) - mapZ(BUILDING_H)).toBeCloseTo(MALL_Y - BUILDING_H, 6);
    expect(colWeight(0)).toBeLessThan(1);
    expect(colWeight(COL_W - 1)).toBeLessThan(1);
    expect(colWeight(5)).toBe(1);
  });

  it('pés de personagem: o centro do tile é onde ele fica de pé', () => {
    const p = footToWorld3(5 * 16 + 8, 10 * 16 + 11);
    expect(p.x).toBeCloseTo((mapX(5) + mapX(6)) / 2, 6);
    expect(p.z).toBeCloseTo((mapZ(10) + mapZ(11)) / 2, 6);
    expect(p.y).toBe(0);
    expect(toWorld3(0, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });
});
