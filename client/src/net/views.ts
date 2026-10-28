// As vistas do escritório, escolhidas por ?escritorio= na query string: Prédio em andares, Escritório 3D e vista
// isométrica. Cada helper também gera o link que alterna a vista e preserva o resto da query string (ex.: ?mock=1).

/** Valor de ?escritorio= da vista Prédio (em andares, layout/tower.ts). */
const TOWER_VIEW = 'predio';
/** Valor de ?escritorio= da vista 3D do escritório (world3d/). */
const VIEW3D = '3d';
/** Valor de ?escritorio= da vista isométrica do escritório (world/iso/). */
const VIEW_ISO = 'iso';

function toggled(search: string, view: string): string {
  const p = new URLSearchParams(search);
  if (p.get('escritorio') === view) p.delete('escritorio');
  else p.set('escritorio', view);
  const q = p.toString();
  return `${location.pathname}${q ? `?${q}` : ''}`;
}

export function isView3d(search: string): boolean {
  return new URLSearchParams(search).get('escritorio') === VIEW3D;
}

export function isIsoView(search: string): boolean {
  return new URLSearchParams(search).get('escritorio') === VIEW_ISO;
}

/** Link para a vista isométrica do escritório ou, estando nela, de volta ao escritório; preserva o resto da query string. */
export function isoHref(search: string): string {
  return toggled(search, VIEW_ISO);
}

/** Link para a vista 3D do escritório ou, estando nela, de volta ao escritório; preserva o resto da query string. */
export function view3dHref(search: string): string {
  return toggled(search, VIEW3D);
}

export function isTowerView(search: string): boolean {
  return new URLSearchParams(search).get('escritorio') === TOWER_VIEW;
}

/** Link para a vista Prédio (em andares) ou, estando nela, de volta ao escritório; preserva o resto da query string. */
export function towerHref(search: string): string {
  return toggled(search, TOWER_VIEW);
}
