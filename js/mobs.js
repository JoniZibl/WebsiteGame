import * as THREE from 'three';
import { AIR, B, isSolid, HEIGHT } from './voxel.js';
import { flattenGroup } from './meshkit.js';

/* ==========================================================================
 *  Was im Dunkeln lebt.
 *
 *  Zwei Sorten, beide bewusst dumm: sie laufen geradeaus auf den Zwerg zu,
 *  steigen eine Stufe und fallen. Gefährlich werden sie durch die Menge und
 *  dadurch, dass man sie im Stollen erst hört und dann sieht.
 * ========================================================================== */

const GRAVITY = 24;
const RADIUS = 0.3;

export const KINDS = {
  schleim: {
    name: 'Höhlenschleim', color: '#8fd06a', dark: '#3f6b35',
    speed: 2.0, hp: 2, damage: 7, body: 1.15, drop: B.pilz, hops: true,
  },
  kriecher: {
    name: 'Steinbeißer', color: '#b06a56', dark: '#5e3428',
    speed: 3.1, hp: 3, damage: 12, body: 1.35, drop: B.kohle, hops: false,
  },
};

function buildMesh(kind) {
  const g = new THREE.Group();
  const main = new THREE.MeshLambertMaterial({ color: kind.color, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: kind.dark, flatShading: true });
  const eye = new THREE.MeshBasicMaterial({ color: '#ffe9a8' });
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

  const body = new THREE.Mesh(box(0.7, kind.body * 0.66, 0.6), main);
  body.position.y = kind.body * 0.4;
  const head = new THREE.Mesh(box(0.56, 0.42, 0.5), dark);
  head.position.y = kind.body * 0.86;
  const eyeL = new THREE.Mesh(box(0.11, 0.13, 0.06), eye);
  eyeL.position.set(-0.13, kind.body * 0.88, 0.26);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.13;
  const footL = new THREE.Mesh(box(0.22, 0.2, 0.3), dark);
  footL.position.set(-0.2, 0.1, 0);
  const footR = footL.clone(); footR.position.x = 0.2;

  g.add(body, head, eyeL, eyeR, footL, footR);
  return flattenGroup(g);
}

export class MobManager {
  constructor(scene, hooks) {
    this.scene = scene;
    this.hooks = hooks;              // onHit(damage), audio, juice
    this.mobs = [];
    this.protos = {};
    for (const [id, kind] of Object.entries(KINDS)) this.protos[id] = buildMesh(kind);
    this.spawnTimer = 3;
  }

  get count() { return this.mobs.length; }

  clear() {
    for (const m of this.mobs) this.scene.remove(m.obj);
    this.mobs.length = 0;
  }

  spawn(id, x, y, z) {
    const kind = KINDS[id];
    const obj = this.protos[id].clone();
    obj.position.set(x, y, z);
    this.scene.add(obj);
    const mob = { id, kind, obj, pos: new THREE.Vector3(x, y, z),
      vy: 0, hp: kind.hp, hurt: 0, cooldown: 0, bob: Math.random() * 6 };
    this.mobs.push(mob);
    return mob;
  }

  /** Sucht in der Dunkelheit rund um den Spieler einen freien Fleck. */
  trySpawnNear(world, player, dark) {
    if (this.mobs.length >= 10) return;
    const ring = 12 + Math.random() * 10;
    const a = Math.random() * Math.PI * 2;
    const x = Math.floor(player.pos.x + Math.cos(a) * ring);
    const z = Math.floor(player.pos.z + Math.sin(a) * ring);
    const y0 = Math.floor(player.pos.y);

    for (let dy = 4; dy >= -6; dy--) {
      const y = y0 + dy;
      if (y < 1 || y + 2 >= HEIGHT) continue;
      const floor = world.get(x, y - 1, z);
      if (!isSolid(floor)) continue;
      if (isSolid(world.get(x, y, z)) || isSolid(world.get(x, y + 1, z))) continue;
      const id = dark > 0.6 && Math.random() < 0.45 ? 'kriecher' : 'schleim';
      this.spawn(id, x + 0.5, y, z + 0.5);
      return;
    }
  }

  update(dt, world, player, dark) {
    // Im Hellen und über Tage bleibt es ruhig
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 2.2 + Math.random() * 2.5;
      if (dark > 0.35) this.trySpawnNear(world, player, dark);
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const k = m.kind;

      const dx = player.pos.x - m.pos.x;
      const dz = player.pos.z - m.pos.z;
      const dist = Math.hypot(dx, dz);

      // Zu weit weg? Dann braucht es ihn nicht mehr.
      if (dist > 46 || Math.abs(player.pos.y - m.pos.y) > 22) {
        this.scene.remove(m.obj);
        this.mobs.splice(i, 1);
        continue;
      }

      if (dist > 0.6) {
        const step = k.speed * dt;
        this.move(world, m, (dx / dist) * step, (dz / dist) * step);
        m.obj.rotation.y = Math.atan2(dx, dz);
      }

      // Schwerkraft und Stufen
      m.vy -= GRAVITY * dt;
      const ny = m.pos.y + m.vy * dt;
      if (this.blocked(world, m.pos.x, ny, m.pos.z, k.body)) {
        if (m.vy < 0) { m.pos.y = Math.floor(m.pos.y) + (m.pos.y - Math.floor(m.pos.y) > 0.5 ? 1 : 0); }
        m.vy = 0;
      } else {
        m.pos.y = ny;
      }

      m.obj.position.copy(m.pos);
      m.bob += dt * (k.hops ? 9 : 5);
      m.obj.position.y += k.hops ? Math.abs(Math.sin(m.bob)) * 0.16 : Math.sin(m.bob) * 0.05;
      if (m.hurt > 0) { m.hurt -= dt; m.obj.position.x += Math.sin(m.hurt * 60) * 0.06; }

      // Treffer
      m.cooldown -= dt;
      const reach = 0.95;
      if (dist < reach && Math.abs(player.pos.y - m.pos.y) < 1.6 && m.cooldown <= 0) {
        m.cooldown = 1.1;
        this.hooks.onHit(k.damage, m);
      }
    }
  }

  move(world, m, dx, dz) {
    const k = m.kind;
    if (!this.blocked(world, m.pos.x + dx, m.pos.y, m.pos.z, k.body)) m.pos.x += dx;
    else if (!this.blocked(world, m.pos.x + dx, m.pos.y + 1, m.pos.z, k.body)) { m.pos.x += dx; m.pos.y += 1.02; }
    if (!this.blocked(world, m.pos.x, m.pos.y, m.pos.z + dz, k.body)) m.pos.z += dz;
    else if (!this.blocked(world, m.pos.x, m.pos.y + 1, m.pos.z + dz, k.body)) { m.pos.z += dz; m.pos.y += 1.02; }
  }

  blocked(world, x, y, z, body) {
    for (const ox of [-RADIUS, RADIUS]) {
      for (const oz of [-RADIUS, RADIUS]) {
        for (let h = 0; h <= body; h += 0.6) {
          if (isSolid(world.get(Math.floor(x + ox), Math.floor(y + h), Math.floor(z + oz)))) return true;
        }
      }
    }
    return false;
  }

  /** Steht ein Wesen in Schlagweite? Nur schauen, nicht treffen. */
  nearest(player, range = 2.2) {
    for (const m of this.mobs) {
      if (Math.abs(player.pos.y - m.pos.y) > 2) continue;
      if (Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z) <= range) return m;
    }
    return null;
  }

  /** Ein Schlag des Spielers trifft alles direkt vor ihm. */
  strike(player, damage = 2) {
    let hit = 0;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const d = Math.hypot(player.pos.x - m.pos.x, player.pos.z - m.pos.z);
      if (d > 2.2 || Math.abs(player.pos.y - m.pos.y) > 2) continue;
      m.hp -= damage;
      m.hurt = 0.25;
      hit++;
      if (m.hp <= 0) {
        this.scene.remove(m.obj);
        this.mobs.splice(i, 1);
        this.hooks.onKill?.(m);
      }
    }
    return hit;
  }
}
