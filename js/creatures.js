import * as THREE from 'three';
import { heightAt, isLand, WATER_LEVEL, PALETTE, piece, buildMesh, findStart } from './world.js';

/* ==========================================================================
 *  Alles, was lebt: das Wesen und die, die vor ihm weglaufen.
 *
 *  Eine einzige Zahl regiert dieses Spiel — die Größe. Wer kleiner ist, wird
 *  gefressen und macht größer. Wer größer ist, ist eine Gefahr. Dieselbe
 *  Figur ist am Anfang tödlich und später ein Happen.
 * ========================================================================== */

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CUBE = box(1, 1, 1);

/* -------------------------------------------------------------------------- */
/*  Bewohner                                                                   */
/* -------------------------------------------------------------------------- */
export const KINDS = {
  huhn: {
    label: 'Huhn', size: 0.35, food: 0.35, speed: 3.4, scare: 9, damage: 0,
    body: '#f6f1e2', trim: '#e0654a', h: 0.5,
  },
  schaf: {
    label: 'Schaf', size: 0.9, food: 0.9, speed: 2.8, scare: 11, damage: 0,
    body: '#f2ede0', trim: '#3d3733', h: 0.9,
  },
  schwein: {
    label: 'Schwein', size: 1.2, food: 1.3, speed: 3.0, scare: 10, damage: 0,
    body: '#eba9a2', trim: '#d18780', h: 0.9,
  },
  dorfbewohner: {
    label: 'Dorfbewohner', size: 1.8, food: 2.2, speed: 3.6, scare: 15, damage: 0,
    body: '#5f86b0', trim: '#f0cfa8', h: 1.7,
  },
  bauer: {
    label: 'Bauer', size: 2.6, food: 3.2, speed: 3.2, scare: 0, damage: 0.22,
    body: '#7d6b4a', trim: '#f0cfa8', h: 1.9, hunts: true,
  },
  ritter: {
    label: 'Ritter', size: 5.0, food: 7.0, speed: 3.4, scare: 0, damage: 0.5,
    body: '#9aa3ad', trim: '#c9563f', h: 2.2, hunts: true,
  },
  riese: {
    label: 'Turmwächter', size: 9.0, food: 16.0, speed: 2.8, scare: 0, damage: 0.9,
    body: '#8d8577', trim: '#5e5648', h: 3.4, hunts: true,
  },
};

const ORDER = ['huhn', 'schaf', 'schwein', 'dorfbewohner', 'bauer', 'ritter', 'riese'];

/** Baut eine Klötzchenfigur: Körper, Kopf, Beine, Augen. */
function buildCreature(def) {
  const bucket = [];
  const body = new THREE.Color(def.body);
  const trim = new THREE.Color(def.trim);
  const dark = new THREE.Color('#2b2620');
  const h = def.h;

  const vier = def.size < 1.5;   // Tiere laufen auf vieren, Leute auf zweien

  if (vier) {
    piece(bucket, CUBE, body, 0, h * 0.62, 0, h * 0.85, h * 0.6, h * 1.25);
    piece(bucket, CUBE, trim, 0, h * 0.78, h * 0.72, h * 0.55, h * 0.5, h * 0.45);
    for (const [dx, dz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      piece(bucket, CUBE, dark, dx * h * 0.3, h * 0.17, dz * h * 0.42, h * 0.18, h * 0.35, h * 0.18);
    }
    piece(bucket, CUBE, dark, -h * 0.16, h * 0.86, h * 0.9, h * 0.1, h * 0.1, h * 0.06);
    piece(bucket, CUBE, dark, h * 0.16, h * 0.86, h * 0.9, h * 0.1, h * 0.1, h * 0.06);
  } else {
    piece(bucket, CUBE, body, 0, h * 0.52, 0, h * 0.5, h * 0.62, h * 0.32);
    piece(bucket, CUBE, trim, 0, h * 0.92, 0, h * 0.36, h * 0.3, h * 0.3);
    piece(bucket, CUBE, body, -h * 0.33, h * 0.52, 0, h * 0.14, h * 0.5, h * 0.16);
    piece(bucket, CUBE, body, h * 0.33, h * 0.52, 0, h * 0.14, h * 0.5, h * 0.16);
    piece(bucket, CUBE, dark, -h * 0.13, h * 0.2, 0, h * 0.16, h * 0.42, h * 0.18);
    piece(bucket, CUBE, dark, h * 0.13, h * 0.2, 0, h * 0.16, h * 0.42, h * 0.18);
    piece(bucket, CUBE, dark, -h * 0.09, h * 0.96, h * 0.16, h * 0.07, h * 0.08, h * 0.05);
    piece(bucket, CUBE, dark, h * 0.09, h * 0.96, h * 0.16, h * 0.07, h * 0.08, h * 0.05);
  }
  return buildMesh(bucket);
}

const SHADOW_GEO = new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2);
const SHADOW_MAT = new THREE.MeshBasicMaterial({
  color: '#2f3a22', transparent: true, opacity: 0.22, depthWrite: false,
});

class Being {
  constructor(scene) {
    this.group = new THREE.Group();
    this.meshes = {};
    for (const key of ORDER) {
      const m = buildCreature(KINDS[key]);
      m.visible = false;
      this.group.add(m);
      this.meshes[key] = m;
    }
    this.shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
    scene.add(this.group, this.shadow);
    this.pos = new THREE.Vector3();
    this.alive = false;
    this.setVisible(false);
  }

  setVisible(v) {
    this.group.visible = v;
    this.shadow.visible = v;
  }

  spawn(kind, x, z) {
    this.kind = kind;
    this.def = KINDS[kind];
    for (const key of ORDER) this.meshes[key].visible = key === kind;
    this.pos.set(x, heightAt(x, z), z);
    this.size = this.def.size;
    this.phase = Math.random() * 6.3;
    this.wait = Math.random() * 2;
    this.target = new THREE.Vector3(x, 0, z);
    this.panic = 0;
    this.cooldown = 0;
    this.dying = 0;
    this.alive = true;
    this.group.scale.setScalar(1);
    this.setVisible(true);
  }

  update(dt, player, world, onHitPlayer) {
    if (this.dying > 0) {
      this.dying -= dt;
      const k = Math.max(0, this.dying / 0.25);
      this.group.scale.set(k * 1.6, k * 0.4, k * 1.6);
      this.group.rotation.y += dt * 12;
      if (this.dying <= 0) { this.alive = false; this.setVisible(false); }
      return;
    }

    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const def = this.def;
    this.phase += dt * 8;
    this.cooldown -= dt;

    const bedrohlich = player.size > this.size;      // wir sind Beute
    let speed = 0;
    let dirX = 0, dirZ = 0;

    if (bedrohlich && dist < def.scare + player.size) {
      // Panik: weg vom Ungeheuer
      this.panic = 1.4;
      dirX = -dx / dist; dirZ = -dz / dist;
      speed = def.speed * 1.5;
    } else if (def.hunts && !bedrohlich && dist < 22) {
      // Jäger: solange wir größer sind, gehen wir drauf zu
      dirX = dx / dist; dirZ = dz / dist;
      speed = def.speed;
      if (dist < 1.2 + player.size * 0.4 && this.cooldown <= 0) {
        this.cooldown = 1.1;
        onHitPlayer(this);
      }
    } else {
      this.panic = Math.max(0, this.panic - dt);
      this.wait -= dt;
      const td = Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z);
      if (td < 0.6 && this.wait <= 0) {
        const a = Math.random() * 6.28, r = 3 + Math.random() * 8;
        this.target.set(this.pos.x + Math.cos(a) * r, 0, this.pos.z + Math.sin(a) * r);
        this.wait = 1.5 + Math.random() * 3;
      }
      if (td > 0.6) {
        dirX = (this.target.x - this.pos.x) / td;
        dirZ = (this.target.z - this.pos.z) / td;
        speed = def.speed * 0.4;
      }
    }

    if (speed > 0) {
      const nx = this.pos.x + dirX * speed * dt;
      const nz = this.pos.z + dirZ * speed * dt;
      if (heightAt(nx, nz) > WATER_LEVEL) { this.pos.x = nx; this.pos.z = nz; }
      this.group.rotation.y = Math.atan2(dirX, dirZ);
    }

    this.pos.y = heightAt(this.pos.x, this.pos.z);
    const hop = speed > 0 ? Math.abs(Math.sin(this.phase)) * (this.panic > 0 ? 0.28 : 0.12) : 0;
    this.group.position.set(this.pos.x, this.pos.y + hop, this.pos.z);

    const squish = 1 + hop * 0.3;
    this.group.scale.set(1 / squish, squish, 1 / squish);

    this.shadow.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
    this.shadow.scale.setScalar(Math.max(0.35, this.size * 0.55));
  }

  devour() { this.dying = 0.25; }
}

export class Beings {
  constructor(scene, max = 22) {
    this.pool = Array.from({ length: max }, () => new Being(scene));
    this.timer = 0;
    this.onSpawn = null;
  }

  reset() {
    this.pool.forEach((b) => { b.alive = false; b.setVisible(false); });
    this.timer = 0;
  }

  get living() { return this.pool.filter((b) => b.alive && b.dying <= 0); }

  /** Welche Sorten passen zur aktuellen Größe? Immer etwas Beute und etwas Gefahr. */
  rollKind(size) {
    const pool = [];
    for (const key of ORDER) {
      const d = KINDS[key];
      if (d.size < size * 0.22) continue;              // zu winzig, langweilig
      if (d.size > size * 3.2) continue;               // zu groß, unfair
      pool.push(key);
    }
    if (!pool.length) pool.push('huhn');
    return pool[(Math.random() * pool.length) | 0];
  }

  update(dt, player, world, onHitPlayer) {
    const want = Math.min(this.pool.length, 8 + Math.floor(player.size));
    this.timer -= dt;
    if (this.timer <= 0 && this.living.length < want) {
      this.timer = 0.45;
      const free = this.pool.find((b) => !b.alive);
      if (free) {
        for (let i = 0; i < 20; i++) {
          const a = Math.random() * Math.PI * 2;
          const d = 16 + Math.random() * 20 + player.size * 2;
          const x = player.pos.x + Math.cos(a) * d;
          const z = player.pos.z + Math.sin(a) * d;
          if (isLand(x, z)) {
            free.spawn(this.rollKind(player.size), x, z);
            this.onSpawn?.(free);
            break;
          }
        }
      }
    }

    for (const b of this.pool) {
      if (!b.alive) continue;
      // zu weit weg? dann darf jemand Neues kommen
      if (b.dying <= 0 && b.pos.distanceTo(player.pos) > 90) { b.alive = false; b.setVisible(false); continue; }
      b.update(dt, player, world, onHitPlayer);
    }
  }
}

/* -------------------------------------------------------------------------- */
/*  Das Wesen                                                                  */
/* -------------------------------------------------------------------------- */
const TROPHY_GEO = new THREE.BoxGeometry(1, 1, 1);

export class Creature {
  constructor(scene) {
    this.group = new THREE.Group();
    this.rig = new THREE.Group();
    this.group.add(this.rig);

    const fur = new THREE.MeshLambertMaterial({ color: '#6d5bd0', flatShading: true });
    const furDark = new THREE.MeshLambertMaterial({ color: '#584aa8', flatShading: true });
    const belly = new THREE.MeshLambertMaterial({ color: '#f0e4a8', flatShading: true });
    const eyeW = new THREE.MeshBasicMaterial({ color: '#fdf6e4' });
    const eyeD = new THREE.MeshBasicMaterial({ color: '#241f2e' });
    const mouth = new THREE.MeshBasicMaterial({ color: '#3a2038' });

    this.body = new THREE.Mesh(box(1.25, 1.0, 1.15), fur);
    this.body.position.y = 0.6;

    this.bellyMesh = new THREE.Mesh(box(0.8, 0.55, 0.1), belly);
    this.bellyMesh.position.set(0, 0.5, 0.6);

    // Maul: geht beim Fressen auf
    this.mouth = new THREE.Mesh(box(0.72, 0.28, 0.08), mouth);
    this.mouth.position.set(0, 0.42, 0.62);

    const eyeL = new THREE.Mesh(box(0.26, 0.26, 0.1), eyeW); eyeL.position.set(-0.28, 0.92, 0.6);
    const eyeR = new THREE.Mesh(box(0.26, 0.26, 0.1), eyeW); eyeR.position.set(0.28, 0.92, 0.6);
    this.pupL = new THREE.Mesh(box(0.12, 0.14, 0.08), eyeD); this.pupL.position.set(-0.26, 0.9, 0.66);
    this.pupR = new THREE.Mesh(box(0.12, 0.14, 0.08), eyeD); this.pupR.position.set(0.26, 0.9, 0.66);

    this.ears = [-1, 1].map((sx) => {
      const e = new THREE.Mesh(box(0.22, 0.4, 0.2), furDark);
      e.position.set(sx * 0.42, 1.2, -0.1);
      return e;
    });

    this.legs = [[-0.38, 0.38], [0.38, 0.38], [-0.38, -0.38], [0.38, -0.38]].map(([x, z]) => {
      const l = new THREE.Mesh(box(0.26, 0.34, 0.26), furDark);
      l.position.set(x, 0.17, z);
      return l;
    });

    [this.body, this.bellyMesh, this.mouth, eyeL, eyeR, this.pupL, this.pupR, ...this.ears, ...this.legs]
      .forEach((m) => { m.castShadow = true; this.rig.add(m); });

    // Trophäen: was gefressen wurde, klebt sichtbar am Fell
    this.trophies = [];
    this.trophyRoot = new THREE.Group();
    this.rig.add(this.trophyRoot);

    this.shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
    scene.add(this.group, this.shadow);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.t = 0;
    this.chew = 0;
    this.hurtFlash = 0;
    this.size = 0.5;
  }

  reset() {
    this.size = 0.5;
    const start = findStart();
    this.pos.set(start.x, heightAt(start.x, start.z), start.z);
    this.vel.set(0, 0, 0);
    this.t = 0;
    this.chew = 0;
    for (const t of this.trophies) this.trophyRoot.remove(t);
    this.trophies.length = 0;
  }

  get speed() { return 6.5 + this.size * 0.9; }
  get reach() { return 0.9 + this.size * 0.75; }

  /** Ein Bissen: wächst, schmatzt, und ein Stück bleibt am Fell kleben. */
  swallow(food, color) {
    this.size += food * 0.16;
    this.chew = 0.28;

    if (this.trophies.length < 22) {
      const m = new THREE.Mesh(TROPHY_GEO, new THREE.MeshLambertMaterial({
        color: color || 0xdddddd, flatShading: true,
      }));
      const a = Math.random() * Math.PI * 2;
      const r = 0.55 + Math.random() * 0.25;
      m.position.set(Math.cos(a) * r, 0.5 + Math.random() * 0.9, Math.sin(a) * r * 0.9);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      const s = 0.22 + Math.random() * 0.2;
      m.scale.setScalar(s);
      m.castShadow = true;
      this.trophyRoot.add(m);
      this.trophies.push(m);
    }
  }

  hurt(amount) {
    this.size = Math.max(0.35, this.size - amount);
    this.hurtFlash = 0.3;
    // ein Stück der Beute geht dabei verloren
    const lost = this.trophies.pop();
    if (lost) this.trophyRoot.remove(lost);
  }

  update(dt, move, world) {
    this.t += dt;
    if (this.chew > 0) this.chew -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;

    const want = new THREE.Vector3(move.x, 0, move.y).multiplyScalar(this.speed * move.strength);
    this.vel.lerp(want, 1 - Math.pow(0.0006, dt));

    const next = this.pos.clone().addScaledVector(this.vel, dt);
    // Wasser bremst, sperrt aber nicht
    const ground = heightAt(next.x, next.z);
    this.pos.x = next.x;
    this.pos.z = next.z;
    this.pos.y = Math.max(ground, WATER_LEVEL);

    if (move.active && move.strength > 0.05) this.facing = Math.atan2(move.x, move.y);

    // Größe wirkt: der Körper wächst mit, die Kamera bleibt, wo sie ist
    const scale = this.size;
    this.rig.scale.setScalar(scale);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;

    // Gang: stampfen, wackeln, kauen
    const sp = this.vel.length();
    const stride = Math.sin(this.t * 11);
    const walking = sp > 0.4;
    this.rig.position.y = walking ? Math.abs(stride) * 0.1 * scale : Math.sin(this.t * 2) * 0.02 * scale;
    this.rig.rotation.z = walking ? stride * 0.05 : 0;
    for (let i = 0; i < this.legs.length; i++) {
      this.legs[i].position.z = (i < 2 ? 0.38 : -0.38) + (walking ? Math.sin(this.t * 11 + i * 2) * 0.16 : 0);
    }
    const chewK = Math.max(0, this.chew / 0.28);
    this.mouth.scale.set(1 + chewK * 0.5, 1 + chewK * 2.4, 1);
    this.body.scale.set(1 + chewK * 0.12, 1 - chewK * 0.1, 1 + chewK * 0.12);
    for (const e of this.ears) e.rotation.x = walking ? Math.sin(this.t * 11) * 0.25 : 0;

    // Die Augen schielen zur nächsten Beute — kleine Geste, große Wirkung
    const look = this.lookAt;
    let lx = 0, ly = 0;
    if (look) {
      const rel = Math.atan2(look.x - this.pos.x, look.z - this.pos.z) - this.facing;
      lx = Math.max(-1, Math.min(1, Math.sin(rel) * 1.6));
      ly = Math.max(-0.6, Math.min(0.6, (look.y - this.pos.y) * 0.1));
    }
    this.pupL.position.set(-0.26 + lx * 0.07, 0.9 + ly * 0.05, 0.66);
    this.pupR.position.set(0.26 + lx * 0.07, 0.9 + ly * 0.05, 0.66);

    this.body.material.emissive?.setScalar(this.hurtFlash > 0 ? 0.4 : 0);

    this.shadow.position.set(this.pos.x, Math.max(heightAt(this.pos.x, this.pos.z), WATER_LEVEL) + 0.07, this.pos.z);
    this.shadow.scale.setScalar(scale * 0.85);
  }
}
