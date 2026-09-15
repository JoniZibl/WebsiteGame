import * as THREE from 'three';
import { heightAt, isLand, WATER_LEVEL } from './world.js';
import { flattenGroup } from './meshkit.js';

// Kleines Getier: Rehe und Hasen, die vor einem davonhoppeln, dazu tagsüber
// Falter und nachts Glühwürmchen. Nichts davon kämpft — es macht die Welt
// nur lebendig.

const FUR = ['#b08055', '#9a7048', '#c39468'];

function makeDeer(color) {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: '#4a3b2c', flatShading: true });
  const cream = new THREE.MeshLambertMaterial({ color: '#f2e6cc', flatShading: true });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 1.0), fur);
  body.position.y = 0.72;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.5, 0.26), fur);
  neck.position.set(0, 1.05, 0.42);
  neck.rotation.x = -0.35;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.42), fur);
  head.position.set(0, 1.3, 0.6);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.1), cream);
  tail.position.set(0, 0.86, -0.52);
  const ears = [-1, 1].map((sx) => {
    const e = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), fur);
    e.position.set(sx * 0.14, 1.44, 0.54);
    e.rotation.z = sx * 0.5;
    return e;
  });
  const legs = [[-0.17, 0.35], [0.17, 0.35], [-0.17, -0.35], [0.17, -0.35]].map(([x, z]) => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.5, 0.11), dark);
    l.position.set(x, 0.25, z);
    return l;
  });

  [body, neck, head, tail, ...ears, ...legs].forEach((m) => { m.castShadow = true; g.add(m); });
  return flattenGroup(g);
}

function makeHare(color) {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const cream = new THREE.MeshLambertMaterial({ color: '#f2e6cc', flatShading: true });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 7, 5), fur);
  body.position.y = 0.3;
  body.scale.set(1, 0.85, 1.25);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 7, 5), fur);
  head.position.set(0, 0.48, 0.26);
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 5, 4), cream);
  tail.position.set(0, 0.34, -0.34);
  const ears = [-1, 1].map((sx) => {
    const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.26, 2, 5), fur);
    e.position.set(sx * 0.09, 0.72, 0.2);
    e.rotation.z = sx * 0.22;
    return e;
  });
  [body, head, tail, ...ears].forEach((m) => { m.castShadow = true; g.add(m); });
  return flattenGroup(g);
}

const shadowGeo = new THREE.CircleGeometry(0.5, 10).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: '#3d4a2c', transparent: true, opacity: 0.16, depthWrite: false });

export class Critters {
  constructor(scene, count = 5, sparks = 18) {
    this.scene = scene;

    this.animals = Array.from({ length: count }, (_, i) => {
      const deer = i % 2 === 0;
      const group = deer ? makeDeer(FUR[i % FUR.length]) : makeHare('#b9ab8d');
      group.scale.setScalar(deer ? 1 : 1.25);
      group.visible = false;
      const shade = new THREE.Mesh(shadowGeo, shadowMat);
      shade.scale.setScalar(deer ? 0.9 : 0.55);
      shade.visible = false;
      scene.add(group, shade);
      return {
        group, shade, deer,
        pos: new THREE.Vector3(), target: new THREE.Vector3(),
        flee: 0, phase: Math.random() * 6.3, wait: Math.random() * 3, placed: false,
      };
    });

    // Falter am Tag, Glühwürmchen in der Nacht – eine einzige Instanz-Wolke
    const sparkGeo = new THREE.OctahedronGeometry(0.11, 0);
    this.sparkMat = new THREE.MeshLambertMaterial({ color: '#f7f0d4', flatShading: true, emissive: '#000000' });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, this.sparkMat, sparks);
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparkMesh.frustumCulled = false;
    scene.add(this.sparkMesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this.sparks = Array.from({ length: sparks }, () => ({
      a: Math.random() * 6.3, r: 4 + Math.random() * 22, h: 0.6 + Math.random() * 2.4, sp: 0.2 + Math.random() * 0.5, spin: Math.random() * 6.3,
    }));
  }

  placeAnimal(a, player) {
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = 22 + Math.random() * 26;
      const x = player.pos.x + Math.cos(ang) * d;
      const z = player.pos.z + Math.sin(ang) * d;
      if (!isLand(x, z)) continue;
      a.pos.set(x, heightAt(x, z), z);
      a.target.copy(a.pos);
      a.placed = true;
      a.group.visible = a.shade.visible = true;
      return;
    }
  }

  update(dt, player, world, nightness) {
    for (const a of this.animals) {
      const far = a.placed && a.pos.distanceTo(player.pos) > 75;
      if (!a.placed || far) { this.placeAnimal(a, player); continue; }

      const dx = player.pos.x - a.pos.x, dz = player.pos.z - a.pos.z;
      const dist = Math.hypot(dx, dz) || 1;

      // scheu: wer zu nah kommt, verscheucht sie
      if (dist < 9) a.flee = 2.2;
      if (a.flee > 0) a.flee -= dt;

      let speed = 0;
      if (a.flee > 0) {
        a.target.set(a.pos.x - (dx / dist) * 14, 0, a.pos.z - (dz / dist) * 14);
        speed = a.deer ? 7 : 6;
      } else {
        a.wait -= dt;
        const td = Math.hypot(a.target.x - a.pos.x, a.target.z - a.pos.z);
        if (td < 0.5 && a.wait <= 0) {
          const ang = Math.random() * Math.PI * 2;
          const r = 3 + Math.random() * 9;
          a.target.set(a.pos.x + Math.cos(ang) * r, 0, a.pos.z + Math.sin(ang) * r);
          a.wait = 2 + Math.random() * 5;
        }
        speed = td > 0.5 ? (a.deer ? 1.7 : 1.3) : 0;
      }

      const tx = a.target.x - a.pos.x, tz = a.target.z - a.pos.z;
      const td2 = Math.hypot(tx, tz);
      if (speed > 0 && td2 > 0.1) {
        const next = a.pos.clone();
        next.x += (tx / td2) * speed * dt;
        next.z += (tz / td2) * speed * dt;
        if (heightAt(next.x, next.z) > WATER_LEVEL + 0.2) {
          world.resolveCollisions(next, 0.5);
          a.pos.x = next.x; a.pos.z = next.z;
          a.group.rotation.y = Math.atan2(tx, tz);
        } else {
          a.wait = 0;
          a.target.copy(a.pos);
        }
        a.phase += dt * (a.deer ? 9 : 12) * (a.flee > 0 ? 1.7 : 1);
      }

      a.pos.y = heightAt(a.pos.x, a.pos.z);
      const hop = a.deer
        ? (speed > 0 ? Math.abs(Math.sin(a.phase)) * 0.06 : 0)
        : (speed > 0 ? Math.abs(Math.sin(a.phase)) * 0.25 : 0);
      a.group.position.set(a.pos.x, a.pos.y + hop, a.pos.z);
      a.shade.position.set(a.pos.x, a.pos.y + 0.03, a.pos.z);

      // federnder Gang statt einzelner Beine
      const mesh = a.group.userData.mesh;
      if (speed > 0) {
        const s2 = Math.sin(a.phase);
        mesh.rotation.x = s2 * (a.deer ? 0.06 : 0.16);
        mesh.scale.set(1, 1 - Math.abs(s2) * 0.05, 1 + Math.abs(s2) * 0.04);
      } else {
        mesh.rotation.x *= 0.9;
        const breathe = 1 + Math.sin(a.phase * 0.2) * 0.012;
        mesh.scale.set(1, breathe, 1);
      }
    }

    // Falter/Glühwürmchen kreisen um den Spieler
    const night = nightness > 0.4;
    this.sparkMat.color.set(night ? '#ffe9a8' : '#f7f0d4');
    this.sparkMat.emissive.setHex(night ? 0x8a6a1e : 0x000000);

    const now = performance.now();
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      s.a += dt * s.sp * (night ? 0.35 : 0.9);
      s.spin += dt * 3;
      const x = player.pos.x + Math.cos(s.a) * s.r;
      const z = player.pos.z + Math.sin(s.a * 1.13) * s.r;
      const flutter = night ? Math.sin(now * 0.001 + s.r) * 0.35 : Math.sin(now * 0.006 + s.r) * 0.28;
      this._p.set(x, Math.max(heightAt(x, z), WATER_LEVEL) + s.h + flutter, z);
      this._e.set(0, s.spin, night ? 0 : Math.sin(now * 0.02 + s.r) * 0.8);
      this._q.setFromEuler(this._e);
      const sc = night ? 0.9 + Math.sin(now * 0.004 + s.r) * 0.3 : 1;
      this._s.set(sc, sc, sc);
      this._m.compose(this._p, this._q, this._s);
      this.sparkMesh.setMatrixAt(i, this._m);
    }
    this.sparkMesh.instanceMatrix.needsUpdate = true;
  }
}
