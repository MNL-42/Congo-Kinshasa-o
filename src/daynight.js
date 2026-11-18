// Cycle jour/nuit. Éclairage physique (three r155+) : intensités multipliées par π.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createDayNight(scene, sun, hemi) {
  let tod = CONFIG.START_TIME;                   // 0..1 ; 0.25 = 06:00, 0.5 = midi, 0.75 = 18:00
  const skyDay = new THREE.Color(0x87ceeb), skyNight = new THREE.Color(0x070b1e), sky = new THREE.Color();
  scene.background = sky;
  function update(dt) {
    tod = (tod + dt / CONFIG.DAY_SECONDS) % 1;
    const a = (tod - 0.25) * Math.PI * 2, light = Math.max(Math.sin(a), 0);
    sun.position.set(Math.cos(a) * 100, Math.sin(a) * 100 + 5, 60);
    sun.intensity = (0.08 + light * 0.45) * Math.PI;
    hemi.intensity = (0.22 + light * 0.55) * Math.PI;
    sky.copy(skyNight).lerp(skyDay, light);
    scene.fog.color.copy(sky);
  }
  function clock() {
    const m = Math.floor(tod * 1440);
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  return { update, clock };
}
