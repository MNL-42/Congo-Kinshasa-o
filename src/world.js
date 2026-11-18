// Construit le monde 3D à partir d'un jeu de données (OSM ou fictif) :
// sol, routes, bâtiments, eau, parcs, + collisions et graphe routier pour les PNJ.
import * as THREE from 'three';

const ROAD_Y = 0.12, WATER_Y = 0.08, PARK_Y = 0.06;
const CELL = 40, PAD = 1.6;                        // grille de collision (m) et marge d'enregistrement
const PALETTE = [0xd8c9a8, 0xc96f4a, 0x8fb8c9, 0xe8e0d0, 0xb5a58a, 0x7aa37a, 0xe2b35c, 0xa9b7c0];

// ---------- géométrie 2D ----------
function signedArea(p) {
  let s = 0; const n = p.length / 2;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; s += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; }
  return s / 2;
}
function reversed(p) { const r = []; for (let i = p.length - 2; i >= 0; i -= 2) r.push(p[i], p[i + 1]); return r; }
function cleanRing(p) {                            // retire doublons consécutifs et point de fermeture
  const r = [];
  for (let i = 0; i < p.length; i += 2) {
    const n = r.length;
    if (n >= 2 && r[n - 2] === p[i] && r[n - 1] === p[i + 1]) continue;
    r.push(p[i], p[i + 1]);
  }
  if (r.length >= 4 && r[0] === r[r.length - 2] && r[1] === r[r.length - 1]) r.length -= 2;
  return r;
}
function inPoly(x, z, p) {
  let inside = false; const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
function edgeDist2(x, z, p) {
  let best = Infinity; const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * j], bz = p[2 * j + 1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
    const ex = ax + t * dx - x, ez = az + t * dz - z, d2 = ex * ex + ez * ez;
    if (d2 < best) best = d2;
  }
  return best;
}

// ---------- maillages ----------
// Remplit un polygone à plat (face visible vers le haut).
function fill(p, y, pos, nor, col, c) {
  const contour = []; for (let i = 0; i < p.length; i += 2) contour.push(new THREE.Vector2(p[i], p[i + 1]));
  for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    let B = b, C = d;
    const ax = p[2 * a], az = p[2 * a + 1];
    if ((p[2 * b + 1] - az) * (p[2 * d] - ax) - (p[2 * b] - ax) * (p[2 * d + 1] - az) < 0) { B = d; C = b; }
    for (const k of [a, B, C]) {
      pos.push(p[2 * k], y, p[2 * k + 1]); nor.push(0, 1, 0);
      if (col) col.push(c.r, c.g, c.b);
    }
  }
}
function toGeometry(pos, nor, col) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

function buildRoadGeometry(roads) {
  const pos = [], nor = [];
  const put = (v) => { pos.push(v[0], ROAD_Y, v[1]); nor.push(0, 1, 0); };
  for (const [w, p] of roads) {
    const n = p.length / 2; if (n < 2) continue;
    const seg = [];                                // direction normalisée de chaque segment
    for (let i = 0; i < n - 1; i++) {
      const dx = p[2 * i + 2] - p[2 * i], dz = p[2 * i + 3] - p[2 * i + 1], l = Math.hypot(dx, dz) || 1;
      seg.push([dx / l, dz / l]);
    }
    const L = [], R = [];
    for (let i = 0; i < n; i++) {                  // joint "mitre" borné aux angles vifs
      const d0 = seg[Math.max(i - 1, 0)], d1 = seg[Math.min(i, n - 2)];
      const n0 = [-d0[1], d0[0]], n1 = [-d1[1], d1[0]];
      let mx = n0[0] + n1[0], mz = n0[1] + n1[1]; const ml = Math.hypot(mx, mz);
      if (ml < 1e-6) { mx = n1[0]; mz = n1[1]; } else { mx /= ml; mz /= ml; }
      const k = (w / 2) / Math.max(mx * n1[0] + mz * n1[1], 0.5);
      const x = p[2 * i], z = p[2 * i + 1];
      L.push([x + mx * k, z + mz * k]); R.push([x - mx * k, z - mz * k]);
    }
    for (let i = 0; i < n - 1; i++) {
      put(L[i]); put(L[i + 1]); put(R[i]);
      put(L[i + 1]); put(R[i + 1]); put(R[i]);
    }
  }
  return toGeometry(pos, nor);
}

function buildBuildingGeometry(buildings) {
  const pos = [], nor = [], col = [], c = new THREE.Color(), roof = new THREE.Color();
  buildings.forEach(([h, raw], idx) => {
    let p = cleanRing(raw); if (p.length < 6) return;
    if (signedArea(p) < 0) p = reversed(p);        // orientation fixe => normales sortantes (dz, -dx)
    c.set(PALETTE[(idx * 7 + Math.floor(h)) % PALETTE.length]);
    roof.copy(c).multiplyScalar(1.12);
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ax = p[2 * i], az = p[2 * i + 1], bx = p[2 * j], bz = p[2 * j + 1];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz); if (l < 0.01) continue;
      const nx = dz / l, nz = -dx / l;
      for (const [x, y, z] of [[ax, 0, az], [ax, h, az], [bx, h, bz], [ax, 0, az], [bx, h, bz], [bx, 0, bz]]) {
        pos.push(x, y, z); nor.push(nx, 0, nz); col.push(c.r, c.g, c.b);
      }
    }
    try { fill(p, h, pos, nor, col, roof); } catch (e) { /* polygone invalide : pas de toit */ }
  });
  return toGeometry(pos, nor, col);
}

function buildFlat(polys, y) {
  const pos = [], nor = [];
  for (const raw of polys) {
    const p = cleanRing(raw); if (p.length < 6) continue;
    try { fill(p, y, pos, nor, null, null); } catch (e) { /* ignoré */ }
  }
  return toGeometry(pos, nor);
}

// ---------- collisions ----------
function buildColliders(buildings, bounds) {
  const [minX, minZ, maxX, maxZ] = bounds, grid = new Map();
  for (const [h, raw] of buildings) {
    const p = cleanRing(raw); if (p.length < 6) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
    const col = { p, h, minX: x0, maxX: x1, minZ: z0, maxZ: z1 };
    for (let cx = Math.floor((x0 - PAD) / CELL); cx <= Math.floor((x1 + PAD) / CELL); cx++)
      for (let cz = Math.floor((z0 - PAD) / CELL); cz <= Math.floor((z1 + PAD) / CELL); cz++) {
        const k = cx + ',' + cz; let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(col);
      }
  }
  // y = hauteur du point testé : un bâtiment plus bas que y ne bloque pas (utile pour la caméra)
  return function blocked(x, z, r = 0.5, y = 0) {
    if (x < minX + 4 || x > maxX - 4 || z < minZ + 4 || z > maxZ - 4) return true;
    const a = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)); if (!a) return false;
    for (const c of a) {
      if (c.h <= y) continue;
      if (x < c.minX - r || x > c.maxX + r || z < c.minZ - r || z > c.maxZ + r) continue;
      if (inPoly(x, z, c.p) || edgeDist2(x, z, c.p) < r * r) return true;
    }
    return false;
  };
}

// ---------- graphe routier ----------
function buildGraph(roads) {
  const map = new Map(), nodes = [];
  const get = (x, z, w) => {
    const k = Math.round(x * 10) + ',' + Math.round(z * 10);
    let i = map.get(k);
    if (i === undefined) { i = nodes.length; nodes.push({ x, z, w, nb: [] }); map.set(k, i); }
    else if (w > nodes[i].w) nodes[i].w = w;
    return i;
  };
  for (const [w, p] of roads) {
    let prev = -1;
    for (let i = 0; i < p.length; i += 2) {
      const n = get(p[i], p[i + 1], w);
      if (prev >= 0 && prev !== n) {
        if (!nodes[prev].nb.includes(n)) nodes[prev].nb.push(n);
        if (!nodes[n].nb.includes(prev)) nodes[n].nb.push(prev);
      }
      prev = n;
    }
  }
  const GC = 50, cells = new Map();
  nodes.forEach((n, i) => {
    const k = Math.floor(n.x / GC) + ',' + Math.floor(n.z / GC);
    let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i);
  });
  // Indice d'un nœud (avec voisins) tiré au hasard entre rmin et rmax de (x, z) ; -1 si aucun.
  function randomNear(x, z, rmin, rmax, rnd) {
    for (let t = 0; t < 3; t++) {
      const r = rmax * (1 + t), cand = [];
      for (let cx = Math.floor((x - r) / GC); cx <= Math.floor((x + r) / GC); cx++)
        for (let cz = Math.floor((z - r) / GC); cz <= Math.floor((z + r) / GC); cz++)
          for (const i of cells.get(cx + ',' + cz) || []) {
            const n = nodes[i]; if (!n.nb.length) continue;
            const d2 = (n.x - x) ** 2 + (n.z - z) ** 2;
            if (d2 >= rmin * rmin && d2 <= r * r) cand.push(i);
          }
      if (cand.length) return cand[Math.floor(rnd() * cand.length)];
    }
    return -1;
  }
  return { nodes, randomNear };
}

// ---------- assemblage ----------
export function buildWorld(scene, data) {
  const [minX, minZ, maxX, maxZ] = data.bounds;
  const size = Math.max(maxX - minX, maxZ - minZ) + 800;

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ color: 0x9c7a4d }));
  ground.rotation.x = -Math.PI / 2; ground.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  scene.add(ground);

  if (data.parks.length) scene.add(new THREE.Mesh(buildFlat(data.parks, PARK_Y), new THREE.MeshLambertMaterial({ color: 0x5f8f4a })));
  if (data.water.length) scene.add(new THREE.Mesh(buildFlat(data.water, WATER_Y), new THREE.MeshLambertMaterial({ color: 0x3f7fbf })));
  scene.add(new THREE.Mesh(buildRoadGeometry(data.roads), new THREE.MeshLambertMaterial({ color: 0x3a3a3a })));
  scene.add(new THREE.Mesh(buildBuildingGeometry(data.buildings), new THREE.MeshLambertMaterial({ vertexColors: true })));

  const blocked = buildColliders(data.buildings, data.bounds);
  const graph = buildGraph(data.roads);

  // Point d'apparition : intersection libre la plus proche du centre
  let spawn = { x: 0, z: 0 }, best = Infinity;
  for (const n of graph.nodes) {
    const d = n.x * n.x + n.z * n.z;
    if (n.nb.length >= 2 && d < best && !blocked(n.x, n.z, 0.8, 0)) { best = d; spawn = { x: n.x, z: n.z }; }
  }
  return { bounds: data.bounds, blocked, graph, spawn,
    stats: { buildings: data.buildings.length, roads: data.roads.length, nodes: graph.nodes.length } };
}
