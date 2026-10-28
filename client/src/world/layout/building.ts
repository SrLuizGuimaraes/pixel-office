// Montagem do prédio: núcleo + corredor + salas de projeto -> grade de caminhabilidade e spots.
import { FURNITURE } from '../../art/api';
import { BUILDING_H, COL_W } from '../constants';
import { BLOCKED, FREE, SEAT, WalkGrid } from '../path/grid';
import { furnitureBlocks, furnitureIsSeat } from './builder';
import { layoutCafe, layoutLounge, layoutReading, layoutReception, layoutRestRoom, layoutRestroom } from './core';
import { layoutCorridor } from './corridor';
import { buildingRect } from './geometry';
import { HOUSE_COLS, houseCoreAreas, houseCorridor } from './house';
import { kartAreas, kartRight } from './kart';
import { MALL_BOTTOM, MALL_EXT_W, mallAreas } from './mall';
import { TOWER_COLS, TOWER_H, towerCorridor, towerFixedAreas, towerVacantAreas } from './tower';
import type { AreaLayout, SpotDef, TileRect } from './types';

export interface BuildingLayout {
  cols: number;
  rect: TileRect;
  core: AreaLayout[];
  corridor: AreaLayout;
  rooms: AreaLayout[];
  grid: WalkGrid;
  spots: SpotDef[];
  /** Planta livre no lugar de prédio, corredor e núcleo: a casa (layout/house.ts) e o prédio em andares (layout/tower.ts). */
  house?: boolean;
  /** O shopping do outro lado da rua está montado (layout/mall.ts): a grade e o terreno vão até ele. */
  mall?: boolean;
  /** Prédio em andares (layout/tower.ts, vista Prédio): também é `house` (planta livre), mas com andares e escadas. */
  tower?: boolean;
}

let coreCache: AreaLayout[] | null = null;

/** Áreas fixas do núcleo (calculadas uma vez). */
export function coreAreas(): AreaLayout[] {
  return (coreCache ??= [layoutReception(), layoutRestroom(), layoutCafe(), layoutLounge(), layoutRestRoom(), layoutReading()]);
}

/** Marca na grade as células caminháveis de uma área, os bloqueios e os assentos. */
export function paintArea(grid: WalkGrid, area: AreaLayout): void {
  for (const r of area.walkable) grid.fill(r.x, r.y, r.w, r.h, FREE);
  for (const r of area.blocked ?? []) grid.fill(r.x, r.y, r.w, r.h, BLOCKED);
  for (const f of area.furniture) {
    const def = FURNITURE[f.kind];
    if (def.mount !== 'floor') continue;
    const { w, h } = def.footprint;
    if (furnitureBlocks(f.kind)) grid.fill(f.tx, f.ty, w, h, BLOCKED);
    else if (furnitureIsSeat(f.kind)) {
      for (let y = f.ty; y < f.ty + h; y++) for (let x = f.tx; x < f.tx + w; x++) if (grid.get(x, y) === FREE) grid.set(x, y, SEAT);
    }
  }
}

export function buildWalkGrid(cols: number, areas: readonly AreaLayout[], version = 0, rows = BUILDING_H, width = cols * COL_W): WalkGrid {
  const grid = new WalkGrid(width, rows, version);
  for (const a of areas) paintArea(grid, a);
  return grid;
}

let houseCoreCache: AreaLayout[] | null = null;

/** A casa: banheiro e hall fixos + os cômodos dela, na caixa de HOUSE_COLS colunas (sem corredor). */
export function assembleHouse(rooms: readonly AreaLayout[], version = 0): BuildingLayout {
  const core = (houseCoreCache ??= houseCoreAreas());
  const corridor = houseCorridor();
  const all = [...core, ...rooms];
  const grid = buildWalkGrid(HOUSE_COLS, all, version);
  const spots: SpotDef[] = [];
  for (const a of all) spots.push(...a.spots);
  return { cols: HOUSE_COLS, rect: buildingRect(HOUSE_COLS), core, corridor, rooms: [...rooms], grid, spots, house: true };
}

export function assembleBuilding(cols: number, rooms: readonly AreaLayout[], version = 0, mall = true): BuildingLayout {
  const core = mall ? [...coreAreas(), ...mallAreas(), ...kartAreas(cols)] : coreAreas();
  const corridor = layoutCorridor(cols);
  const all = [...core, corridor, ...rooms];
  const grid = buildWalkGrid(cols, all, version, mall ? MALL_BOTTOM : BUILDING_H, mall ? Math.max(cols * COL_W, MALL_EXT_W, kartRight(cols)) : cols * COL_W);
  const spots: SpotDef[] = [];
  for (const a of all) spots.push(...a.spots);
  return { cols, rect: buildingRect(cols), core, corridor, rooms: [...rooms], grid, spots, ...(mall ? { mall: true } : {}) };
}

/** O prédio em andares: térreo e halls fixos + as salas de projeto presentes + as vagas ainda sem sala (nuas). */
export function assembleTower(rooms: readonly AreaLayout[], version = 0): BuildingLayout {
  const core = [...towerFixedAreas(), ...towerVacantAreas(rooms)];
  const corridor = towerCorridor();
  const all = [...core, ...rooms];
  const grid = buildWalkGrid(TOWER_COLS, all, version, TOWER_H);
  const spots: SpotDef[] = [];
  for (const a of all) spots.push(...a.spots);
  const rect: TileRect = { x: 0, y: 0, w: TOWER_COLS * COL_W, h: TOWER_H };
  return { cols: TOWER_COLS, rect, core, corridor, rooms: [...rooms], grid, spots, house: true, tower: true };
}
