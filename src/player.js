// Joueur : joystick tactile (moitié gauche), caméra par glissement (moitié droite), clavier.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makePerson } from './models.js';

export function createPlayer({ scene, camera, world }) {
  const mesh = makePerson(0x2255cc);
  mesh.position.set(world.spawn.x, 0, world.spawn.z);
  scene.add(mesh);

  let yaw = 0, jx = 0, jy = 0, leftId = null;
  const keys = {}, touches = new Map();
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');

  window.addEventListener('keydown', e => { keys[e.code] = true; });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('contextmenu', e => e.preventDefault());
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
      const len = Math.hypot(dx, dy), k = len > 50 ? 50 / len : 1;
      jx = (dx * k) / 50; jy = (-dy * k) / 50;
      knob.style.transform = `translate(${jx * 40}px, ${-jy * 40}px)`;
    } else { yaw -= (e.clientX - t.lx) * 0.005; t.lx = e.clientX; }
  });
  const release = e => {
    const t = touches.get(e.pointerId); if (!t) return;
    if (t.left) { jx = jy = 0; leftId = null; stick.style.display = 'none'; knob.style.transform = ''; }
    touches.delete(e.pointerId);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  function update(dt) {
    const f = jy + (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    const r = jx + (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    if (keys.KeyQ) yaw += dt * 2;
    if (keys.KeyE) yaw -= dt * 2;
    const len = Math.hypot(f, r);
    if (len >= 0.05) {
      const sp = CONFIG.PLAYER_SPEED * Math.min(len, 1) * dt;
      const mx = (-Math.sin(yaw) * f + Math.cos(yaw) * r) / len * sp;
      const mz = (-Math.cos(yaw) * f - Math.sin(yaw) * r) / len * sp;
      const p = mesh.position;
      if (!world.blocked(p.x + mx, p.z, 0.5, 0)) p.x += mx;   // axes séparés = glissement le long des murs
      if (!world.blocked(p.x, p.z + mz, 0.5, 0)) p.z += mz;
      mesh.rotation.y = Math.atan2(mx, mz);
    }
    // Caméra : se rapproche si un bâtiment plus haut qu'elle se trouve derrière le joueur
    const p = mesh.position, sx = Math.sin(yaw), sz = Math.cos(yaw);
    let dist = 8;
    for (let t = 0.5; t <= 8; t += 0.5) {
      if (world.blocked(p.x + sx * t, p.z + sz * t, 0.4, 1.5 + t * 0.45)) { dist = Math.max(t - 0.5, 0.35); break; }
    }
    camera.position.set(p.x + sx * dist, 1.5 + dist * 0.45, p.z + sz * dist);
    camera.lookAt(p.x, 1.5, p.z);
  }
  return { mesh, update };
}
