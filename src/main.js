// Kinshasa Open World - v0.2 : carte réelle OpenStreetMap (si data/kinshasa.json existe).
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeRng } from './util.js';
import { generateCity } from './procedural.js';
import { buildWorld } from './world.js';
import { createPlayer } from './player.js';
import { createAgents } from './agents.js';
import { createDayNight } from './daynight.js';

const hud = id => document.getElementById(id);

async function loadData() {
  try {
    const r = await fetch(CONFIG.DATA_URL);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (d.version !== 1 || !Array.isArray(d.roads) || !Array.isArray(d.buildings)) throw new Error('format inconnu');
    return { data: d, note: '' };
  } catch (e) {
    return { data: generateCity(), note: ' (data/kinshasa.json indisponible : ' + e.message + ')' };
  }
}

async function main() {
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
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  });

  hud('msg').textContent = 'Chargement de la carte…';
  const { data, note } = await loadData();
  hud('msg').textContent = 'Construction de la ville…';
  await new Promise(r => setTimeout(r, 30));      // laisse l'écran afficher le message

  const world = buildWorld(scene, data);
  const rnd = makeRng(2024);
  const player = createPlayer({ scene, camera, world });
  const crowd = createAgents({ scene, world, player, rnd });
  const dayNight = createDayNight(scene, sun, hemi);
  const s = world.stats;
  hud('src').textContent = data.source === 'osm'
    ? `Carte : ${data.name} (OpenStreetMap) · ${s.buildings} bâtiments`
    : `Carte fictive : aucune donnée OpenStreetMap${note}`;
  window.KOW = { world, player, crowd, data, dayNight, scene, camera };   // pour le débogage

  let last = performance.now(), acc = 0, frames = 0, started = false;
  renderer.setAnimationLoop(now => {
    const real = (now - last) / 1000; last = now;
    const dt = Math.min(Math.max(real, 0), 0.05);
    player.update(dt); crowd.update(dt); dayNight.update(dt);
    renderer.render(scene, camera);
    acc += real; frames++;
    if (acc >= 0.5) { hud('clock').textContent = dayNight.clock() + ' · ' + Math.round(frames / acc) + ' ips'; acc = 0; frames = 0; }
    if (!started) { started = true; const m = hud('msg'); if (m) m.remove(); }
  });
}
main();
