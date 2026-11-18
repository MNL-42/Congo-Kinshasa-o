// PNJ piétons et voitures : ils suivent le réseau routier réel (graphe) et restent
// à droite de leur direction. Ils sont maintenus près du joueur (apparition/replacement).
import { CONFIG } from './config.js';
import { makePerson, makeTaxi } from './models.js';

const PED_COLORS = [0xcc3333, 0xe8c030, 0x2f9e44, 0xf5f5f5, 0x8844aa, 0xee7722, 0x22aacc, 0x444444];

export function createAgents({ scene, world, player, rnd }) {
  const { nodes, randomNear } = world.graph, agents = [];

  // Point latéral à droite de la direction (dx, dz), au nœud donné ; évite les bâtiments.
  function lanePoint(a, node, dx, dz) {
    const w = node.w, offs = a.car ? [w * 0.25, 0] : [w * 0.5 + 1.2, w * 0.5, 0];
    for (const o of offs) {
      const x = node.x - dz * o, z = node.z + dx * o;
      if (!world.blocked(x, z, 0.3, 0)) return [x, z];
    }
    return [node.x, node.z];
  }

  function pickNext(a) {                          // choisit le prochain nœud (sans demi-tour si possible)
    const cur = nodes[a.cur];
    let opts = cur.nb.filter(i => i !== a.prev);
    if (!opts.length) opts = cur.nb;
    if (!opts.length) return false;
    a.nxt = opts[Math.floor(rnd() * opts.length)];
    const n = nodes[a.nxt], dx = n.x - cur.x, dz = n.z - cur.z, l = Math.hypot(dx, dz) || 1;
    a.dx = dx / l; a.dz = dz / l;
    [a.tx, a.tz] = lanePoint(a, n, a.dx, a.dz);
    return true;
  }

  function respawn(a) {
    for (let tries = 0; tries < 5; tries++) {
      const i = randomNear(player.mesh.position.x, player.mesh.position.z, CONFIG.SPAWN_MIN, CONFIG.SPAWN_MAX, rnd);
      if (i < 0) return;
      a.cur = i; a.prev = -1;
      if (!pickNext(a)) continue;
      const [x, z] = lanePoint(a, nodes[i], a.dx, a.dz);
      a.mesh.position.set(x, 0, z);
      a.mesh.rotation.y = Math.atan2(a.dx, a.dz);
      return;
    }
  }

  function add(mesh, speed, car) {
    const a = { mesh, speed, car, cur: 0, prev: -1, nxt: 0, dx: 0, dz: 1, tx: 0, tz: 0 };
    mesh.position.set(0, -50, 0);                 // caché jusqu'au premier placement
    scene.add(mesh); agents.push(a); respawn(a);
  }
  for (let i = 0; i < CONFIG.PEDESTRIANS; i++) add(makePerson(PED_COLORS[i % PED_COLORS.length]), CONFIG.PED_SPEED, false);
  for (let i = 0; i < CONFIG.CARS; i++) add(makeTaxi(i), CONFIG.CAR_SPEED, true);
  for (const a of agents) if (a.mesh.position.y < 0) a.mesh.visible = false;   // aucun nœud trouvé

  function update(dt) {
    const px = player.mesh.position.x, pz = player.mesh.position.z, far2 = CONFIG.DESPAWN ** 2;
    for (const a of agents) {
      const p = a.mesh.position;
      if (!a.mesh.visible || (p.x - px) ** 2 + (p.z - pz) ** 2 > far2) {
        respawn(a); if (p.y === 0) a.mesh.visible = true; continue;
      }
      let budget = a.speed * dt;
      for (let it = 0; it < 6 && budget > 0; it++) {
        const dx = a.tx - p.x, dz = a.tz - p.z, d = Math.hypot(dx, dz);
        if (d <= budget) {                        // nœud atteint : on enchaîne sur le suivant
          p.x = a.tx; p.z = a.tz; budget -= d;
          a.prev = a.cur; a.cur = a.nxt;
          if (!pickNext(a)) { respawn(a); break; }
        } else { p.x += dx / d * budget; p.z += dz / d * budget; budget = 0; }
      }
      const want = Math.atan2(a.dx, a.dz);         // rotation progressive par le plus court chemin
      const diff = ((want - a.mesh.rotation.y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      a.mesh.rotation.y += diff * Math.min(1, dt * 8);
    }
  }
  return { agents, update };
}
