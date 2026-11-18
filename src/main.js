// Kinshasa Open World - v0.1.1
// Ville procédurale (grille fictive). Les données OpenStreetMap viendront à l'étape 3.
import * as THREE from 'three';

// ---------- Paramètres ----------
const BLOCK = 48;          // distance entre deux axes de route
const ROAD = 8;            // largeur de la chaussée (bord à ±4 m de l'axe)
const N = 5;               // intersections de -N à +N sur chaque axe
const WORLD = N * BLOCK;
const SIDEWALK = 6;        // décalage latéral des piétons (entre 4 et 8 m de l'axe)
const LANE = 2;            // décalage latéral des voitures (voie de droite)

// Aléatoire reproductible (même ville à chaque lancement)
let seed = 1337;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// ---------- Scène ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.touchAction = 'none';
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 600);
scene.fog = new THREE.Fog(0x87ceeb, 80, 300);
const hemi = new THREE.HemisphereLight(0xffffff, 0x998877, 1);
const sun = new THREE.DirectionalLight(0xffffff, 1);
scene.add(hemi, sun);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- Monde ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2 + 80, WORLD * 2 + 80),
  new THREE.MeshLambertMaterial({ color: 0x9c7a4d }));   // terre rouge/ocre
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Routes : y = 0.10 / 0.12 (assez haut pour éviter le scintillement avec le sol)
const roadMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
for (let k = -N; k <= N; k++) {
  const a = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, WORLD * 2 + 40), roadMat);
  a.rotation.x = -Math.PI / 2; a.position.set(k * BLOCK, 0.10, 0); scene.add(a);   // route le long de z
  const b = a.clone(); b.rotation.z = Math.PI / 2; b.position.set(0, 0.12, k * BLOCK); scene.add(b); // le long de x
}

// Bâtiments : 4 par îlot, retrait >= 8 m de l'axe des routes (4 m chaussée + 4 m trottoir)
const boxes = [];
const spots = [];
for (let i = -N; i < N; i++) for (let j = -N; j < N; j++)
  for (const [dx, dz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]])
    if (rnd() > 0.15) spots.push([i * BLOCK + BLOCK / 2 + dx, j * BLOCK + BLOCK / 2 + dz]);
const bld = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
bld.frustumCulled = false;   // la boîte englobante d'un InstancedMesh peut être fausse sur certains appareils
const palette = [0xd8c9a8, 0xc96f4a, 0x8fb8c9, 0xe8e0d0, 0xb5a58a, 0x7aa37a];
const m = new THREE.Matrix4(), c = new THREE.Color();
spots.forEach(([x, z], n) => {
  const w = 10 + rnd() * 4, d = 10 + rnd() * 4, h = 6 + rnd() * 24;   // demi-largeur max = 7 m
  m.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
  bld.setMatrixAt(n, m);
  bld.setColorAt(n, c.set(palette[Math.floor(rnd() * palette.length)]));
  boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
});
bld.instanceMatrix.needsUpdate = true;
if (bld.instanceColor) bld.instanceColor.needsUpdate = true;
scene.add(bld);

// ---------- Personnages (low-poly, géométries et matériaux partagés) ----------
const bodyGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.3, 8);
const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
const noseGeo = new THREE.BoxGeometry(0.12, 0.12, 0.2);
const skinMat = new THREE.MeshLambertMaterial({ color: 0x5a3825 });
const bodyMats = new Map();
const bodyMat = color => {
  if (!bodyMats.has(color)) bodyMats.set(color, new THREE.MeshLambertMaterial({ color }));
  return bodyMats.get(color);
};
function makePerson(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, bodyMat(color)); body.position.y = 0.65;
  const head = new THREE.Mesh(headGeo, skinMat);        head.position.y = 1.55;
  const nose = new THREE.Mesh(noseGeo, skinMat);        nose.position.set(0, 1.55, 0.25); // marque l'avant (+z)
  g.add(body, head, nose);
  return g;
}
const player = makePerson(0x2255cc);
scene.add(player);

// ---------- Agents autonomes (PNJ et voitures) ----------
// Chaque agent roule/marche d'intersection en intersection, en tournant au hasard (sans demi-tour).
// Il reste à droite de sa direction : voitures sur la voie (LANE), piétons sur le trottoir (SIDEWALK).
const agents = [];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function pickDir(a) {
  const opts = DIRS.filter(([x, z]) =>
    Math.abs(a.gx + x) <= N && Math.abs(a.gz + z) <= N && !(x === -a.dx && z === -a.dz));
  const [x, z] = opts.length ? opts[Math.floor(rnd() * opts.length)] : [-a.dx, -a.dz];
  a.dx = x; a.dz = z;
  a.tx = a.gx + x; a.tz = a.gz + z;
  // "droite" de la direction (x, z) = (-z, x)
  a.px = a.tx * BLOCK - z * a.lane;
  a.pz = a.tz * BLOCK + x * a.lane;
}
function addAgent(mesh, speed, lane) {
  const a = { mesh, speed, lane, dx: 0, dz: 0, tx: 0, tz: 0, px: 0, pz: 0,
    gx: Math.floor(rnd() * (2 * N + 1)) - N, gz: Math.floor(rnd() * (2 * N + 1)) - N };
  pickDir(a);
  mesh.position.set(a.gx * BLOCK - a.dz * lane, 0, a.gz * BLOCK + a.dx * lane);
  mesh.rotation.y = Math.atan2(a.dx, a.dz);
  scene.add(mesh); agents.push(a);
}
const pedColors = [0xcc3333, 0xe8c030, 0x2f9e44, 0xf5f5f5, 0x8844aa, 0xee7722, 0x22aacc, 0x444444];
for (let i = 0; i < 40; i++) addAgent(makePerson(pedColors[i % pedColors.length]), 1.6, SIDEWALK);

const carGeo = new THREE.BoxGeometry(2, 1.2, 4.2);
const taxiMats = [new THREE.MeshLambertMaterial({ color: 0xf2c200 }), new THREE.MeshLambertMaterial({ color: 0x2a5fbf })];
for (let i = 0; i < 15; i++) {            // taxis jaunes / bleus
  const car = new THREE.Mesh(carGeo, taxiMats[i % 2]);
  car.position.y = 0.75;
  const wrap = new THREE.Group(); wrap.add(car);
  addAgent(wrap, 9, LANE);
}

function updateAgents(dt) {
  for (const a of agents) {
    const p = a.mesh.position;
    const dx = a.px - p.x, dz = a.pz - p.z, d = Math.hypot(dx, dz);
    if (d <= a.speed * dt) {              // arrivé : on se cale sur le point et on choisit la suite
      p.x = a.px; p.z = a.pz; a.gx = a.tx; a.gz = a.tz; pickDir(a);
      continue;
    }
    p.x += (dx / d) * a.speed * dt;
    p.z += (dz / d) * a.speed * dt;
    // rotation progressive par le plus court chemin
    const want = Math.atan2(dx, dz);
    const diff = ((want - a.mesh.rotation.y + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    a.mesh.rotation.y += diff * Math.min(1, dt * 8);
  }
}

// ---------- Contrôles (joystick tactile + glisser pour la caméra + clavier) ----------
let yaw = 0, jx = 0, jy = 0;
const keys = {}, touches = new Map();
let leftId = null;                        // un seul doigt pilote le joystick
const stick = document.getElementById('stick'), knob = document.getElementById('knob');

window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('contextmenu', e => e.preventDefault());   // pas de menu au toucher long
window.addEventListener('pointerdown', e => {
  const left = e.clientX < window.innerWidth / 2;
  if (left && leftId !== null) return;
  touches.set(e.pointerId, { left, sx: e.clientX, sy: e.clientY, lx: e.clientX });
  if (left) {
    leftId = e.pointerId;
    stick.style.display = 'block'; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px';
  }
});
window.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId); if (!t) return;
  if (t.left) {
    const dx = e.clientX - t.sx, dy = e.clientY - t.sy;
    const len = Math.hypot(dx, dy), k = len > 50 ? 50 / len : 1;   // limite à 50 px
    jx = (dx * k) / 50; jy = (-dy * k) / 50;
    knob.style.transform = `translate(${jx * 40}px, ${-jy * 40}px)`;
  } else {
    yaw -= (e.clientX - t.lx) * 0.005; t.lx = e.clientX;
  }
});
const release = e => {
  const t = touches.get(e.pointerId); if (!t) return;
  if (t.left) { jx = jy = 0; leftId = null; stick.style.display = 'none'; knob.style.transform = ''; }
  touches.delete(e.pointerId);
};
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);

function collides(x, z, r = 0.5) {
  for (const b of boxes) if (x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r) return true;
  return Math.abs(x) > WORLD + 20 || Math.abs(z) > WORLD + 20;
}
function updatePlayer(dt) {
  const f = jy + (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const r = jx + (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  if (keys.KeyQ) yaw += dt * 2;
  if (keys.KeyE) yaw -= dt * 2;
  const len = Math.hypot(f, r); if (len < 0.05) return;
  const sp = 5 * Math.min(len, 1) * dt;
  const mx = (-Math.sin(yaw) * f + Math.cos(yaw) * r) / len * sp;
  const mz = (-Math.cos(yaw) * f - Math.sin(yaw) * r) / len * sp;
  const p = player.position;
  if (!collides(p.x + mx, p.z)) p.x += mx;     // axes séparés = glissement le long des murs
  if (!collides(p.x, p.z + mz)) p.z += mz;
  player.rotation.y = Math.atan2(mx, mz);
}
function updateCamera() {
  const p = player.position, sx = Math.sin(yaw), sz = Math.cos(yaw);
  let dist = 8;                                // se rapproche si un mur est derrière le joueur
  for (let t = 1; t <= 8; t += 0.5) {
    if (collides(p.x + sx * t, p.z + sz * t, 0.4)) { dist = Math.max(t - 1, 1.5); break; }
  }
  camera.position.set(p.x + sx * dist, 1.5 + dist * 0.45, p.z + sz * dist);
  camera.lookAt(p.x, 1.5, p.z);
}

// ---------- Jour / nuit ----------
// Éclairage physique (three r155+) : les intensités sont ~π fois plus faibles qu'avant, d'où le facteur Math.PI.
let tod = 0.3;                                  // 0..1 ; 0.25 = 06:00, 0.5 = midi, 0.75 = 18:00
const DAY_SECONDS = 240;                        // une journée complète = 4 minutes réelles
const skyDay = new THREE.Color(0x87ceeb), skyNight = new THREE.Color(0x070b1e);
const sky = new THREE.Color();
scene.background = sky;
function updateDayNight(dt) {
  tod = (tod + dt / DAY_SECONDS) % 1;
  const a = (tod - 0.25) * Math.PI * 2;
  const light = Math.max(Math.sin(a), 0);       // 0 la nuit, 1 à midi
  sun.position.set(Math.cos(a) * 100, Math.sin(a) * 100 + 5, 60);
  sun.intensity = (0.08 + light * 0.45) * Math.PI;
  hemi.intensity = (0.22 + light * 0.55) * Math.PI;
  sky.copy(skyNight).lerp(skyDay, light);
  scene.fog.color.copy(sky);
}
const clockText = () => {
  const mins = Math.floor(tod * 1440);
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
};

// ---------- Boucle principale ----------
const clockEl = document.getElementById('clock');
let last = performance.now(), fpsAcc = 0, fpsFrames = 0, started = false;
renderer.setAnimationLoop(now => {
  const real = (now - last) / 1000; last = now;
  const dt = Math.min(Math.max(real, 0), 0.05);   // plafonné : pas de saut après une mise en veille
  updatePlayer(dt); updateAgents(dt); updateDayNight(dt); updateCamera();
  renderer.render(scene, camera);

  fpsAcc += real; fpsFrames++;
  if (fpsAcc >= 0.5) {                            // HUD rafraîchi 2 fois par seconde
    clockEl.textContent = clockText() + ' · ' + Math.round(fpsFrames / fpsAcc) + ' ips';
    fpsAcc = 0; fpsFrames = 0;
  }
  if (!started) { started = true; const msg = document.getElementById('msg'); if (msg) msg.remove(); }
});
