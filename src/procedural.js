// Ville fictive en grille, au même format que les données OSM.
// Sert de secours quand data/kinshasa.json est absent.
import { makeRng } from './util.js';

export function generateCity(seed = 1337) {
  const BLOCK = 48, N = 5, rnd = makeRng(seed), r1 = v => Math.round(v * 10) / 10;
  const roads = [], buildings = [];
  for (let k = -N; k <= N; k++) {
    const h = [], v = [];
    for (let i = -N; i <= N; i++) { h.push(i * BLOCK, k * BLOCK); v.push(k * BLOCK, i * BLOCK); }
    roads.push([8, h], [8, v]);
  }
  for (let i = -N; i < N; i++) for (let j = -N; j < N; j++)
    for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
      if (rnd() <= 0.15) continue;
      const cx = i * BLOCK + BLOCK / 2 + dx, cz = j * BLOCK + BLOCK / 2 + dz;
      const w = 10 + rnd() * 4, d = 10 + rnd() * 4, h = 6 + rnd() * 24;
      buildings.push([r1(h), [cx - w / 2, cz - d / 2, cx + w / 2, cz - d / 2, cx + w / 2, cz + d / 2, cx - w / 2, cz + d / 2].map(r1)]);
    }
  const e = N * BLOCK + 40;
  return { version: 1, name: 'Ville fictive', source: 'procedural', origin: null,
    bounds: [-e, -e, e, e], roads, buildings, water: [], parks: [] };
}
