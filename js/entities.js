import * as THREE from 'three';
import { heightAt, isLand, WATER_LEVEL } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);

/* ---------------- weicher Blob-Schatten (günstig auf dem Handy) ------------- */
const blobGeo = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ color: '#2f4858', transparent: true, opacity: 0.18, depthWrite: false });
function makeBlob(scale = 1) {
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.scale.setScalar(scale);
  m.renderOrder = 1;
  return m;
}

/* =========================================================================== */
/*  Spielfigur                                                                 */
/* =========================================================================== */
export class Player {
  constructor(scene) {
    this.group = new THREE.Group();
    this.rig = new THREE.Group();          // hüpft/neigt sich, ohne die Position zu stören
    this.group.add(this.rig);
    this.rig.scale.setScalar(1.7);   // gut lesbar aus der Vogelperspektive

    const cloak = new THREE.MeshLambertMaterial({ color: '#ef8a72', flatShading: true });
    const cloakDark = new THREE.MeshLambertMaterial({ color: '#d26a57', flatShading: true });
    const skin = new THREE.MeshLambertMaterial({ color: '#f6d9b8', flatShading: true });
    const cream = new THREE.MeshLambertMaterial({ color: '#fdf6e8', flatShading: true });
    const pack = new THREE.MeshLambertMaterial({ color: '#6c8f7d', flatShading: true });
    const wood = new THREE.MeshLambertMaterial({ color: '#7a5540', flatShading: true });

    // Silhouette von oben: breite Schultern, davor der Kopf, hinten die Kapuze.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.4, 3, 9), cloak);
    torso.scale.set(1.3, 1, 0.95);
    torso.position.y = 0.55;

    const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(0.17, 7, 5), cream);
    shoulderL.position.set(-0.36, 0.8, 0.02);
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = 0.36;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.29, 9, 7), skin);
    head.position.set(0, 1.12, 0.06);

    const hood = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.55, 8), cloakDark);
    hood.position.set(0, 1.3, -0.16);
    hood.rotation.x = -0.45;                       // Zipfel zeigt nach hinten

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 5), skin);
    nose.position.set(0, 1.08, 0.3);
    nose.rotation.x = Math.PI / 2;

    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.26), pack);
    bag.position.set(0, 0.62, -0.38);

    // Bogen liegt flach vor der Brust – von oben ein klarer Richtungspfeil
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 4, 9, Math.PI * 0.9), wood);
    bow.position.set(0.3, 0.62, 0.26);
    bow.rotation.set(Math.PI / 2, 0, -Math.PI / 2);

    [torso, shoulderL, shoulderR, head, hood, nose, bag, bow].forEach((m) => {
      m.castShadow = true;
      this.rig.add(m);
    });
    this.bow = bow;
    this.bowRest = bow.rotation.z;

    this.blob = makeBlob(1.05);
    scene.add(this.group, this.blob);

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.speed = 8.5;
    this.radius = 0.45;
    this.hpMax = 100;
    this.hp = 100;
    this.sinceHit = 99;
    this.t = 0;
    this.moving = false;
  }

  reset() {
    // einen trockenen Startplatz in der Nähe suchen
    let x = 0, z = 0;
    for (let i = 0; i < 400 && !isLand(x, z); i++) {
      const a = i * 0.7, r = i * 0.6;
      x = Math.cos(a) * r; z = Math.sin(a) * r;
    }
    this.pos.set(x, heightAt(x, z), z);
    this.hp = this.hpMax;
    this.sinceHit = 99;
    this.vel.set(0, 0, 0);
  }

  update(dt, move, world) {
    this.t += dt;
    this.sinceHit += dt;
    this.moving = move.active;

    const want = new THREE.Vector3(move.x, 0, move.y).multiplyScalar(this.speed * move.strength);
    this.vel.lerp(want, 1 - Math.pow(0.0008, dt));   // weiches Anfahren/Bremsen

    const next = this.pos.clone().addScaledVector(this.vel, dt);

    // nicht ins tiefe Wasser laufen
    if (heightAt(next.x, next.z) < WATER_LEVEL + 0.1) {
      if (heightAt(next.x, this.pos.z) > WATER_LEVEL + 0.1) next.z = this.pos.z;
      else if (heightAt(this.pos.x, next.z) > WATER_LEVEL + 0.1) next.x = this.pos.x;
      else { next.x = this.pos.x; next.z = this.pos.z; }
    }
    world.resolveCollisions(next, this.radius);
    this.pos.x = next.x; this.pos.z = next.z;
    this.pos.y = heightAt(this.pos.x, this.pos.z);

    if (move.active && move.strength > 0.05) this.facing = Math.atan2(move.x, move.y);

    // ruhige Regeneration, wenn man kurz nicht getroffen wurde
    if (this.sinceHit > 4) this.hp = Math.min(this.hpMax, this.hp + 5 * dt);

    // Animation
    const sp = this.vel.length();
    const bob = this.moving ? Math.sin(this.t * 14) * 0.07 * Math.min(1, sp / 4) : Math.sin(this.t * 2.2) * 0.02;
    this.rig.position.y = bob;
    this.rig.rotation.x = Math.min(sp / this.speed, 1) * 0.16;
    this.rig.rotation.z = this.moving ? Math.sin(this.t * 14) * 0.05 : 0;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;

    this.blob.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
  }

  aimAt(x, z) { this.facing = Math.atan2(x - this.pos.x, z - this.pos.z); }

  hurt(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.sinceHit = 0;
    return this.hp <= 0;
  }
}

/* =========================================================================== */
/*  Gegner — kleine hüpfende Würfelwesen                                       */
/* =========================================================================== */
const enemyGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const eyeGeo = new THREE.BoxGeometry(0.13, 0.16, 0.08);
const eyeMat = new THREE.MeshBasicMaterial({ color: '#2f4858' });
const ENEMY_COLORS = ['#f2879c', '#f2b179', '#a98fd6', '#7fb8ef'];

class Enemy {
  constructor(scene) {
    this.group = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ color: ENEMY_COLORS[0], flatShading: true });
    this.body = new THREE.Mesh(enemyGeo, this.mat);
    this.body.position.y = 0.4;
    this.body.castShadow = true;
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.17, 0.5, 0.41);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.17, 0.5, 0.41);
    this.group.add(this.body, eyeL, eyeR);
    this.blob = makeBlob(0.8);
    scene.add(this.group, this.blob);
    this.alive = false;
    this.pos = new THREE.Vector3();
    this.setVisible(false);
  }

  setVisible(v) { this.group.visible = v; this.blob.visible = v; }

  spawn(x, z, tier) {
    this.pos.set(x, heightAt(x, z), z);
    this.hp = 3 + tier;
    this.hpMax = this.hp;
    this.speed = 2.6 + Math.min(tier * 0.25, 1.8);
    this.damage = 8 + tier * 2;
    this.radius = 0.45;
    this.cooldown = 0;
    this.flash = 0;
    this.phase = Math.random() * 6.28;
    this.dying = 0;
    this.alive = true;
    this.mat.color.set(ENEMY_COLORS[(Math.random() * ENEMY_COLORS.length) | 0]);
    this.group.scale.setScalar(1);
    this.setVisible(true);
  }

  update(dt, player, world, onHitPlayer) {
    if (this.dying > 0) {
      this.dying -= dt;
      const s = Math.max(0.001, this.dying / 0.25);
      this.group.scale.setScalar(s);
      if (this.dying <= 0) { this.alive = false; this.setVisible(false); }
      return;
    }
    this.phase += dt * 7;
    this.cooldown -= dt;
    if (this.flash > 0) this.flash -= dt;

    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;

    if (dist > 1.1) {
      const step = this.speed * dt;
      const next = this.pos.clone();
      next.x += (dx / dist) * step;
      next.z += (dz / dist) * step;
      if (heightAt(next.x, next.z) > WATER_LEVEL) {
        world.resolveCollisions(next, this.radius);
        this.pos.x = next.x; this.pos.z = next.z;
      }
    } else if (this.cooldown <= 0) {
      this.cooldown = 0.9;
      onHitPlayer(this);
    }

    this.pos.y = heightAt(this.pos.x, this.pos.z);
    const hop = Math.abs(Math.sin(this.phase)) * 0.22;
    this.group.position.set(this.pos.x, this.pos.y + hop, this.pos.z);
    this.group.rotation.y = Math.atan2(dx, dz);
    this.body.scale.set(1 + hop * 0.35, 1 - hop * 0.3, 1 + hop * 0.35);
    this.mat.emissive.setScalar(this.flash > 0 ? 0.55 : 0);
    this.blob.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
    this.blob.scale.setScalar(0.8 - hop * 0.5);
  }

  hurt(dmg) {
    this.hp -= dmg;
    this.flash = 0.09;
    if (this.hp <= 0) { this.dying = 0.25; return true; }
    return false;
  }
}

export class EnemyManager {
  constructor(scene, max = 14) {
    this.pool = Array.from({ length: max }, () => new Enemy(scene));
    this.spawnTimer = 1.5;
  }

  reset() { this.pool.forEach((e) => { e.alive = false; e.setVisible(false); }); this.spawnTimer = 2; }

  get living() { return this.pool.filter((e) => e.alive && e.dying <= 0); }

  update(dt, player, world, onHitPlayer) {
    // Schwierigkeit wächst mit der Entfernung vom Startpunkt
    const tier = Math.floor(Math.hypot(player.pos.x, player.pos.z) / 90);
    const target = Math.min(4 + tier * 2, this.pool.length);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.living.length < target) {
      this.spawnTimer = 1.2;
      const free = this.pool.find((e) => !e.alive);
      if (free) {
        for (let i = 0; i < 24; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 17 + Math.random() * 11;
          const x = player.pos.x + Math.cos(a) * d;
          const z = player.pos.z + Math.sin(a) * d;
          if (isLand(x, z)) { free.spawn(x, z, tier); break; }
        }
      }
    }

    for (const e of this.pool) if (e.alive) e.update(dt, player, world, onHitPlayer);
  }

  nearest(pos, maxDist) {
    let best = null, bestD = maxDist * maxDist;
    for (const e of this.living) {
      const d = (e.pos.x - pos.x) ** 2 + (e.pos.z - pos.z) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
}

/* =========================================================================== */
/*  Pfeile                                                                     */
/* =========================================================================== */
export class ProjectileManager {
  constructor(scene, max = 40) {
    const shaft = new THREE.BoxGeometry(0.07, 0.07, 0.55);
    const mat = new THREE.MeshLambertMaterial({ color: '#fdf6e8', flatShading: true });
    this.items = Array.from({ length: max }, () => {
      const m = new THREE.Mesh(shaft, mat);
      m.visible = false;
      scene.add(m);
      return { mesh: m, alive: false, dir: new THREE.Vector3(), life: 0 };
    });
    this.speed = 30;
    this.damage = 1;
  }

  reset() { this.items.forEach((p) => { p.alive = false; p.mesh.visible = false; }); }

  fire(from, dirX, dirZ) {
    const p = this.items.find((i) => !i.alive);
    if (!p) return;
    p.alive = true;
    p.life = 1.0;
    p.dir.set(dirX, 0, dirZ).normalize();
    p.mesh.position.set(from.x, from.y + 0.85, from.z);
    p.mesh.rotation.y = Math.atan2(p.dir.x, p.dir.z);
    p.mesh.visible = true;
  }

  update(dt, enemies, onKill) {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.life -= dt;
      p.mesh.position.addScaledVector(p.dir, this.speed * dt);
      if (p.life <= 0) { p.alive = false; p.mesh.visible = false; continue; }

      for (const e of enemies.living) {
        const dx = e.pos.x - p.mesh.position.x, dz = e.pos.z - p.mesh.position.z;
        if (dx * dx + dz * dz < 0.55 * 0.55) {
          p.alive = false; p.mesh.visible = false;
          if (e.hurt(this.damage)) onKill(e);
          break;
        }
      }
    }
  }
}

/* =========================================================================== */
/*  Edelsteine — fallen aus Gegnern und fliegen zum Spieler                     */
/* =========================================================================== */
export class Gems {
  constructor(scene, max = 24) {
    const geo = new THREE.OctahedronGeometry(0.26, 0);
    const mat = new THREE.MeshLambertMaterial({ color: '#6fd6e8', flatShading: true, emissive: '#2a6d7a' });
    this.items = Array.from({ length: max }, () => {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      return { mesh: m, alive: false, t: 0, base: 0 };
    });
  }

  drop(pos) {
    const g = this.items.find((i) => !i.alive);
    if (!g) return;
    g.alive = true;
    g.t = Math.random() * 6.28;
    g.base = pos.y + 0.45;
    g.mesh.position.set(pos.x, g.base, pos.z);
    g.mesh.visible = true;
  }

  update(dt, player, onCollect) {
    for (const g of this.items) {
      if (!g.alive) continue;
      g.t += dt * 3;
      const p = g.mesh.position;
      const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
      const d = Math.hypot(dx, dz);

      if (d < 4.5) {                       // sanfter Magnet
        const pull = Math.min(1, (4.5 - d) / 4.5) * 14 * dt;
        p.x += dx * pull; p.z += dz * pull;
      }
      if (d < 0.9) {
        g.alive = false; g.mesh.visible = false;
        onCollect(g);
        continue;
      }
      g.base = heightAt(p.x, p.z) + 0.45;
      p.y = g.base + Math.sin(g.t) * 0.12;
      g.mesh.rotation.y += dt * 2.2;
    }
  }

  reset() { this.items.forEach((g) => { g.alive = false; g.mesh.visible = false; }); }
}

/* =========================================================================== */
/*  Partikel für Treffer & kleine Freudenmomente                               */
/* =========================================================================== */
export class Particles {
  constructor(scene, max = 60) {
    const geo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    this.items = Array.from({ length: max }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#fff', flatShading: true }));
      m.visible = false;
      scene.add(m);
      return { mesh: m, vel: new THREE.Vector3(), life: 0 };
    });
  }

  burst(pos, color, count = 8) {
    let spawned = 0;
    for (const p of this.items) {
      if (p.life > 0) continue;
      p.life = 0.5 + Math.random() * 0.3;
      p.mesh.material.color.set(color);
      p.mesh.position.copy(pos).addScalar(0);
      p.mesh.position.y += 0.4;
      p.vel.set((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4);
      p.mesh.visible = true;
      if (++spawned >= count) break;
    }
  }

  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 4;
      const s = Math.max(0.01, Math.min(1, p.life * 2.5));
      p.mesh.scale.setScalar(s);
      if (p.life <= 0) p.mesh.visible = false;
    }
  }

  reset() { this.items.forEach((p) => { p.life = 0; p.mesh.visible = false; }); }
}

export { UP };
