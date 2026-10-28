import { describe, expect, it } from 'vitest';
import { FURNITURE, type FurnitureKind } from '../art/api';
import { MODELED_KINDS } from './furniture3d';

describe('móveis em 3D', () => {
  it('todo móvel de chão do catálogo tem modelo 3D', () => {
    const missing = (Object.keys(FURNITURE) as FurnitureKind[]).filter((k) => FURNITURE[k].mount === 'floor' && !MODELED_KINDS.includes(k));
    expect(missing).toEqual([]);
  });
});
