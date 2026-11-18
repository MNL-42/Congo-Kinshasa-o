// Modèles 3D low-poly. Point unique à remplacer plus tard par des modèles glTF.
import * as THREE from 'three';

const bodyGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.3, 8);
const headGeo = new THREE.SphereGeometry(0.25, 8, 6);
const noseGeo = new THREE.BoxGeometry(0.12, 0.12, 0.2);
const skinMat = new THREE.MeshLambertMaterial({ color: 0x5a3825 });
const bodyMats = new Map();
const bodyMat = color => {
  if (!bodyMats.has(color)) bodyMats.set(color, new THREE.MeshLambertMaterial({ color }));
  return bodyMats.get(color);
};

export function makePerson(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(bodyGeo, bodyMat(color)); body.position.y = 0.65;
  const head = new THREE.Mesh(headGeo, skinMat);        head.position.y = 1.55;
  const nose = new THREE.Mesh(noseGeo, skinMat);        nose.position.set(0, 1.55, 0.25); // avant = +z
  g.add(body, head, nose);
  return g;
}

const carGeo = new THREE.BoxGeometry(2, 0.9, 4.2);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.6, 2.2);
const glassMat = new THREE.MeshLambertMaterial({ color: 0x223344 });
const taxiMats = [new THREE.MeshLambertMaterial({ color: 0xf2c200 }), new THREE.MeshLambertMaterial({ color: 0x2a5fbf })];

export function makeTaxi(i) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(carGeo, taxiMats[i % 2]); body.position.y = 0.6;
  const cabin = new THREE.Mesh(cabinGeo, glassMat);     cabin.position.set(0, 1.3, -0.2);
  g.add(body, cabin);
  return g;
}
