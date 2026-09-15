import * as THREE from 'three';
import { heightAt } from './world.js';

// Dörfer bekommen Leben: ein paar Bewohner, die um die Häuser schlendern,
// und ein Händler mit Stand, bei dem man dauerhafte Verbesserungen kauft.

const CLOAKS = ['#e6dcc0', '#b8c48a', '#df8a5c', '#cbb98e', '#9fae74'];

function makeFigure(cloakColor, scale = 1) {
  const group = new THREE.Group();
  const cloak = new THREE.MeshLambertMaterial({ color: cloakColor, flatShading: true });
  const skin = new THREE.MeshLambertMaterial({ color: '#e8cba6', flatShading: true });
  const hat = new THREE.MeshLambertMaterial({ color: '#8a8a52', flatShading: true });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.36, 3, 8), cloak);
  body.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), skin);
  head.position.set(0, 1.0, 0.04);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.34, 7), hat);
  cap.position.y = 1.2;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 5), skin);
  nose.position.set(0, 0.97, 0.26);
  nose.rotation.x = Math.PI / 2;

  [body, head, cap, nose].forEach((m) => { m.castShadow = true; group.add(m); });
  group.scale.setScalar(1.55 * scale);
  return group;
}

const shadowGeo = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
const shadowMat = new THREE.MeshBasicMaterial({ color: '#3d4a2c', transparent: true, opacity: 0.18, depthWrite: false });

export class Villagers {
  constructor(scene, count = 5) {
    this.scene = scene;
    this.center = null;

    this.folk = Array.from({ length: count }, (_, i) => {
      const group = makeFigure(CLOAKS[i % CLOAKS.length]);
      group.visible = false;
      const shade = new THREE.Mesh(shadowGeo, shadowMat);
      shade.visible = false;
      scene.add(group, shade);
      return { group, shade, pos: new THREE.Vector3(), target: new THREE.Vector3(), wait: 0, phase: Math.random() * 6.3 };
    });

    // Händler: eigener Stand, bleibt stehen
    this.trader = makeFigure('#df8a5c', 1.15);
    // Cremefarbene Plane mit zwei Streifen – hebt sich von den Ziegeldächern ab
    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.16, 1.7),
      new THREE.MeshLambertMaterial({ color: '#f3e6c8', flatShading: true })
    );
    awning.position.set(0, 2.5, -0.4);
    const stripeMat = new THREE.MeshLambertMaterial({ color: '#df8a5c', flatShading: true });
    const stripes = [-0.75, 0.75].map((x) => {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.19, 1.72), stripeMat);
      st.position.set(x, 2.5, -0.4);
      return st;
    });
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 2.5, 5),
      new THREE.MeshLambertMaterial({ color: '#6b5643', flatShading: true })
    );
    post.position.set(-1.2, 1.25, -0.4);
    const post2 = post.clone();
    post2.position.x = 1.2;
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.22, 0.9),
      new THREE.MeshLambertMaterial({ color: '#8a7350', flatShading: true })
    );
    table.position.set(0, 0.85, 0.75);

    // Waren auf dem Tisch
    const crates = [-0.6, 0.1, 0.7].map((x, i) => {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.26, 0.34),
        new THREE.MeshLambertMaterial({ color: i === 1 ? '#8a7350' : '#b8a074', flatShading: true })
      );
      c.position.set(x, 1.08, 0.75 + (i % 2) * 0.12);
      c.rotation.y = i * 0.4;
      return c;
    });

    // schwebendes Zeichen, damit man den Stand im Dorf findet
    this.marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.34, 0),
      new THREE.MeshLambertMaterial({ color: '#f2dda2', flatShading: true, emissive: '#6b5a24' })
    );
    this.marker.position.set(0, 3.4, -0.4);

    this.stall = new THREE.Group();
    [awning, ...stripes, post, post2, table, ...crates].forEach((m) => { m.castShadow = true; this.stall.add(m); });
    this.stall.add(this.marker);
    this.stall.visible = false;
    this.trader.visible = false;
    this.traderShade = new THREE.Mesh(shadowGeo, shadowMat);
    this.traderShade.visible = false;
    scene.add(this.trader, this.stall, this.traderShade);
    this.traderPos = new THREE.Vector3();
  }

  /** Bewohner rund um ein Dorf verteilen. */
  place(village) {
    this.center = village;
    const cx = village.x, cz = village.z;

    this.traderPos.set(cx + 3.2, heightAt(cx + 3.2, cz), cz);
    this.trader.position.copy(this.traderPos);
    this.trader.rotation.y = Math.PI;
    this.stall.position.copy(this.traderPos);
    this.stall.rotation.y = Math.PI;
    this.traderShade.position.set(this.traderPos.x, this.traderPos.y + 0.03, this.traderPos.z);
    this.trader.visible = this.stall.visible = this.traderShade.visible = true;

    this.folk.forEach((f, i) => {
      const a = (i / this.folk.length) * Math.PI * 2 + 0.4;
      const r = 4 + (i % 3) * 2.5;
      f.pos.set(cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r);
      f.pos.y = heightAt(f.pos.x, f.pos.z);
      f.target.copy(f.pos);
      f.wait = Math.random() * 3;
      f.group.visible = f.shade.visible = true;
    });
  }

  hide() {
    this.center = null;
    this.trader.visible = this.stall.visible = this.traderShade.visible = false;
    this.folk.forEach((f) => { f.group.visible = f.shade.visible = false; });
  }

  update(dt, player, world) {
    // Dorf in der Nähe suchen und bei Wechsel neu besetzen
    const village = world.nearestVillage(player.pos, 80);
    if (!village) { if (this.center) this.hide(); return; }
    if (!this.center || village.x !== this.center.x || village.z !== this.center.z) this.place(village);

    const traderTurn = Math.atan2(player.pos.x - this.traderPos.x, player.pos.z - this.traderPos.z);
    this.trader.rotation.y += (traderTurn - this.trader.rotation.y) * Math.min(1, dt * 3);
    this.trader.position.y = this.traderPos.y + Math.sin(performance.now() * 0.002) * 0.04;
    this.marker.rotation.y += dt * 1.6;
    this.marker.position.y = 3.4 + Math.sin(performance.now() * 0.003) * 0.12;

    for (const f of this.folk) {
      f.phase += dt * 6;
      f.wait -= dt;
      const dx = f.target.x - f.pos.x, dz = f.target.z - f.pos.z;
      const d = Math.hypot(dx, dz);

      if (d < 0.4) {
        if (f.wait <= 0) {
          // neues Ziel in Dorfnähe
          const a = Math.random() * Math.PI * 2;
          const r = 2 + Math.random() * 8;
          f.target.set(this.center.x + Math.cos(a) * r, 0, this.center.z + Math.sin(a) * r);
          f.wait = 1.5 + Math.random() * 4;
        }
      } else {
        const step = 1.5 * dt;
        const next = f.pos.clone();
        next.x += (dx / d) * step;
        next.z += (dz / d) * step;
        world.resolveCollisions(next, 0.4);
        f.pos.x = next.x; f.pos.z = next.z;
        f.group.rotation.y = Math.atan2(dx, dz);
      }

      f.pos.y = heightAt(f.pos.x, f.pos.z);
      const bob = d > 0.4 ? Math.abs(Math.sin(f.phase)) * 0.08 : Math.sin(f.phase * 0.25) * 0.02;
      f.group.position.set(f.pos.x, f.pos.y + bob, f.pos.z);
      f.shade.position.set(f.pos.x, f.pos.y + 0.03, f.pos.z);
    }
  }

  /** Steht der Spieler nah genug am Stand? */
  nearTrader(pos) {
    if (!this.center) return false;
    return Math.hypot(pos.x - this.traderPos.x, pos.z - this.traderPos.z) < 4;
  }
}
