import * as THREE from 'three';
import { heightAt, isLand, WATER_LEVEL } from './world.js';

const UP = new THREE.Vector3(0, 1, 0);

/* ---------------- weicher Blob-Schatten (günstig auf dem Handy) ------------- */
const blobGeo = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
const blobMat = new THREE.MeshBasicMaterial({ color: '#3d4a2c', transparent: true, opacity: 0.2, depthWrite: false });
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

    // ---------------------------------------------------------------
    //  Das Laternenkind: ein kleiner Mantel, darauf eine Laterne statt
    //  eines Kopfes. Die Flamme darin ist zugleich Lebensbalken, Munition
    //  und Lichtquelle — die Silhouette ist das Spielprinzip.
    // ---------------------------------------------------------------
    const cloak = new THREE.MeshLambertMaterial({ color: '#4b5a74', flatShading: true });
    const cloakLight = new THREE.MeshLambertMaterial({ color: '#68789a', flatShading: true });
    const scarf = new THREE.MeshLambertMaterial({ color: '#df6a4a', flatShading: true });
    const metal = new THREE.MeshLambertMaterial({ color: '#8f7b52', flatShading: true });
    const metalDark = new THREE.MeshLambertMaterial({ color: '#5e4f34', flatShading: true });

    // Das Glas glüht von innen — die Helligkeit folgt der Flamme.
    this.glassMat = new THREE.MeshLambertMaterial({
      color: '#ffd89a', emissive: '#ffae4d', transparent: true, opacity: 0.92, flatShading: true,
    });
    this.flameMat = new THREE.MeshBasicMaterial({ color: '#fff0c4' });

    const cape = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.95, 8), cloak);
    cape.position.y = 0.48;
    const capeTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.1, 8), cloakLight);
    capeTrim.position.y = 0.06;

    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.22, 2, 6), cloakLight);
    armL.position.set(-0.36, 0.62, 0.05);
    armL.rotation.z = 0.25;
    const armR = armL.clone();
    armR.position.x = 0.36;
    armR.rotation.z = -0.25;

    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.16, 8), scarf);
    collar.position.y = 0.96;
    const scarfEnd = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.1), scarf);
    scarfEnd.position.set(0.02, 0.76, -0.3);
    scarfEnd.rotation.x = 0.35;

    // Laternenkopf: Boden, Glas, Deckel, Bügel
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.12, 8), metal);
    base.position.y = 1.08;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.46, 8), this.glassMat);
    glass.position.y = 1.36;
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.3, 5), this.flameMat);
    flame.position.y = 1.32;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.33, 0.24, 8), metal);
    cap.position.y = 1.7;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 4, 10, Math.PI), metalDark);
    handle.position.y = 1.84;
    handle.rotation.y = Math.PI / 2;

    // zwei Streben geben der Laterne Kanten statt einer glatten Röhre
    const bars = [0, 1].map((i) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.48, 0.05), metalDark);
      b.position.set(Math.cos(i * Math.PI / 2) * 0.26, 1.36, Math.sin(i * Math.PI / 2) * 0.26);
      return b;
    });

    // kleines Windlicht in der Hand zeigt die Blickrichtung an
    const docht = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), metalDark);
    docht.position.set(0, 0.7, 0.42);

    [cape, capeTrim, armL, armR, collar, scarfEnd, base, cap, handle, ...bars, docht]
      .forEach((m) => { m.castShadow = true; this.rig.add(m); });
    this.rig.add(glass, flame);

    this.glass = glass;
    this.flameMesh = flame;
    this.bow = docht;                 // trägt weiter das Zucken beim Schuss
    this.bowRest = docht.rotation.z;

    this.blob = makeBlob(1.05);

    // Wellenring, sobald man im Wasser steht oder schwimmt
    this.ripple = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.95, 18).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#e8f2e0', transparent: true, opacity: 0.32, depthWrite: false })
    );
    this.ripple.visible = false;
    this.ripple.renderOrder = 3;

    scene.add(this.group, this.blob, this.ripple);
    this.wading = false;
    this.swimming = false;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.speed = 8.5;
    this.radius = 0.45;
    this.hpMax = 100;          // Fassungsvermögen der Laterne
    this.hp = 70;              // aktuelle Flamme
    this.burn = 1.1;           // wie schnell sie herunterbrennt (pro Sekunde)
    this.baseSpeed = 8.5;
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
    this.hp = this.hpMax * 0.7;
    this.sinceHit = 99;
    this.speed = this.baseSpeed;
    this.vel.set(0, 0, 0);
  }

  update(dt, move, world) {
    this.t += dt;
    this.sinceHit += dt;
    this.moving = move.active;

    // Wasser bremst, sperrt aber nichts ab: man watet und schwimmt hinaus.
    const ground = heightAt(this.pos.x, this.pos.z);
    const depth = WATER_LEVEL - ground;
    const wasSwimming = this.swimming;
    this.wading = depth > 0.15;
    this.swimming = depth > 0.9;
    const drag = this.swimming ? 0.55 : this.wading ? 0.72 : 1;

    const want = new THREE.Vector3(move.x, 0, move.y).multiplyScalar(this.speed * move.strength * drag);
    this.vel.lerp(want, 1 - Math.pow(this.swimming ? 0.02 : 0.0008, dt));   // im Wasser träger

    const next = this.pos.clone().addScaledVector(this.vel, dt);
    world.resolveCollisions(next, this.radius);
    this.pos.x = next.x; this.pos.z = next.z;

    const newGround = heightAt(this.pos.x, this.pos.z);
    this.swimming = WATER_LEVEL - newGround > 0.9;
    this.wading = WATER_LEVEL - newGround > 0.15;
    // beim Schwimmen treibt man an der Oberfläche, sonst steht man auf dem Grund
    this.pos.y = this.swimming ? WATER_LEVEL - 0.45 : newGround;
    this.justEnteredWater = this.swimming && !wasSwimming;

    if (move.active && move.strength > 0.05) this.facing = Math.atan2(move.x, move.y);

    // Die Flamme brennt herunter (oder wächst im Tageslicht), nie über den Rand.
    this.hp = Math.min(this.hpMax, Math.max(0, this.hp - this.burn * dt));

    // Animation
    const sp = this.vel.length();
    const bob = this.moving ? Math.sin(this.t * 14) * 0.07 * Math.min(1, sp / 4) : Math.sin(this.t * 2.2) * 0.02;
    this.rig.position.y = bob - (this.swimming ? 0.45 : this.wading ? 0.18 : 0);
    this.rig.rotation.x = this.swimming ? 0.05 : Math.min(sp / this.speed, 1) * 0.16;
    this.rig.rotation.z = this.moving && !this.swimming ? Math.sin(this.t * 14) * 0.05 : 0;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;

    // Wellenring im Wasser statt Schatten am Boden
    const inWater = this.wading || this.swimming;
    this.ripple.visible = inWater;
    this.blob.visible = !inWater;
    if (inWater) {
      const puls = 1 + Math.sin(this.t * 3.4) * 0.12 + (this.moving ? 0.25 : 0);
      this.ripple.position.set(this.pos.x, WATER_LEVEL + 0.06, this.pos.z);
      this.ripple.scale.setScalar(puls);
      this.ripple.material.opacity = 0.34 - (this.moving ? 0 : 0.1);
    }
    this.blob.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);

    // Die Laterne lebt: Flackern, Höhe der Flamme, Farbe nach Füllstand
    const f = this.flame;
    const flicker = 0.88 + Math.sin(this.t * 11) * 0.06 + Math.sin(this.t * 23.7) * 0.04;
    this.glassMat.emissiveIntensity = (0.25 + f * 1.15) * flicker;
    this.glassMat.emissive.setRGB(1, 0.42 + f * 0.36, 0.12 + f * 0.36);
    this.flameMat.color.setRGB(1, 0.62 + f * 0.33, 0.3 + f * 0.5);
    this.flameMesh.scale.set(0.5 + f * 0.6, (0.35 + f * 0.9) * flicker, 0.5 + f * 0.6);
    this.flameMesh.rotation.y += dt * 2.4;
  }

  /** Füllstand der Laterne, 0..1 — Leben, Munition und Licht in einem. */
  get flame() { return this.hp / this.hpMax; }

  /** Kostet Licht. Gibt false zurück, wenn nichts mehr da ist. */
  spend(amount) {
    if (this.hp <= 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    return true;
  }

  feed(amount) { this.hp = Math.min(this.hpMax, this.hp + amount); }

  aimAt(x, z) { this.facing = Math.atan2(x - this.pos.x, z - this.pos.z); }

  hurt(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.sinceHit = 0;
    return this.hp <= 0;
  }
}

/* =========================================================================== */
/*  Gegner — drei Sorten mit unterschiedlichem Verhalten                       */
/* =========================================================================== */
const enemyGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
const hornGeo = new THREE.ConeGeometry(0.3, 0.45, 5);
const eyeGeo = new THREE.BoxGeometry(0.13, 0.16, 0.08);
const eyeMat = new THREE.MeshBasicMaterial({ color: '#ffd27a' });   // glühende Augen im Dunkeln

export const KINDS = {
  // huscht stur auf einen zu
  hopper:  { hp: 3, speed: 2.7, damage: 8,  scale: 1.0, colors: ['#2f3346', '#3a3f56'], keep: 0 },
  // schwer und zäh, frisst viel Licht
  brute:   { hp: 10, speed: 1.7, damage: 18, scale: 1.7, colors: ['#23273a', '#2c3147'], keep: 0 },
  // hält Abstand und spuckt Dunkelheit
  spitter: { hp: 4, speed: 2.3, damage: 0,  scale: 1.05, colors: ['#3b3352', '#463c61'], keep: 11,
             shot: { damage: 9, speed: 13, cooldown: 2.1 } },
};

class Enemy {
  constructor(scene) {
    this.group = new THREE.Group();
    this.mat = new THREE.MeshLambertMaterial({ color: KINDS.hopper.colors[0], flatShading: true });
    this.body = new THREE.Mesh(enemyGeo, this.mat);
    this.body.position.y = 0.4;
    this.body.castShadow = true;
    this.horn = new THREE.Mesh(hornGeo, this.mat);
    this.horn.position.y = 1.0;
    this.horn.visible = false;
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.17, 0.5, 0.41);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.17, 0.5, 0.41);
    this.group.add(this.body, this.horn, eyeL, eyeR);
    this.blob = makeBlob(0.8);
    scene.add(this.group, this.blob);
    this.alive = false;
    this.pos = new THREE.Vector3();
    this.setVisible(false);
  }

  setVisible(v) { this.group.visible = v; this.blob.visible = v; }

  spawn(x, z, tier, kindName, tough = 0) {
    const k = KINDS[kindName];
    this.kind = kindName;
    this.def = k;
    this.pos.set(x, heightAt(x, z), z);
    this.hp = k.hp + tier + tough;
    this.hpMax = this.hp;
    this.speed = k.speed + Math.min(tier * 0.22, 1.4);
    this.damage = k.damage + tier * 2;
    this.radius = 0.45 * k.scale;
    this.cooldown = 0.8 + Math.random() * 0.8;
    this.flash = 0;
    this.phase = Math.random() * 6.28;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.dying = 0;
    this.alive = true;
    this.mat.color.set(k.colors[(Math.random() * k.colors.length) | 0]);
    this.horn.visible = kindName === 'spitter';
    this.group.scale.setScalar(k.scale);
    this.setVisible(true);
  }

  update(dt, player, world, onHitPlayer, shots, brightness = 0) {
    if (this.dying > 0) {
      this.dying -= dt;
      const s = Math.max(0.001, (this.dying / 0.25) * this.def.scale);
      this.group.scale.setScalar(s);
      if (this.dying <= 0) { this.alive = false; this.setVisible(false); }
      return;
    }
    this.phase += dt * (7 / this.def.scale);
    this.cooldown -= dt;
    if (this.flash > 0) this.flash -= dt;

    // Im hellen Licht zerfallen Schatten – das Lager ist die eigentliche Waffe.
    if (brightness > 0.5) {
      this.burning = (brightness - 0.5) * 7;
      this.hp -= this.burning * dt;
      this.flash = Math.max(this.flash, 0.05);
      if (this.hp <= 0) { this.dying = 0.25; this.onBurn?.(this); return; }
    } else {
      this.burning = 0;
    }

    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const next = this.pos.clone();
    let moved = false;

    if (this.def.keep > 0) {
      // Fernkämpfer: Wunschabstand halten und dabei seitlich ausweichen
      const wish = this.def.keep;
      let ax = 0, az = 0;
      if (dist > wish) { ax = dx / dist; az = dz / dist; }
      else if (dist < wish * 0.7) { ax = -dx / dist; az = -dz / dist; }
      ax += (-dz / dist) * this.strafe * 0.5;
      az += (dx / dist) * this.strafe * 0.5;
      const len = Math.hypot(ax, az) || 1;
      next.x += (ax / len) * this.speed * dt;
      next.z += (az / len) * this.speed * dt;
      moved = true;

      if (this.cooldown <= 0 && dist < wish * 1.5) {
        this.cooldown = this.def.shot.cooldown;
        shots.fire(this.pos, dx / dist, dz / dist, this.def.shot.damage + Math.floor(this.damage * 0.2));
        this.phase = 0;
      }
    } else if (dist > 1.0 * this.def.scale) {
      next.x += (dx / dist) * this.speed * dt;
      next.z += (dz / dist) * this.speed * dt;
      moved = true;
    } else if (this.cooldown <= 0) {
      this.cooldown = 0.9;
      onHitPlayer(this);
    }

    if (moved && heightAt(next.x, next.z) > WATER_LEVEL) {
      world.resolveCollisions(next, this.radius);
      this.pos.x = next.x; this.pos.z = next.z;
    }

    this.pos.y = heightAt(this.pos.x, this.pos.z);
    const hop = Math.abs(Math.sin(this.phase)) * 0.22;
    this.group.position.set(this.pos.x, this.pos.y + hop * this.def.scale, this.pos.z);
    this.group.rotation.y = Math.atan2(dx, dz);
    if (this.def.keep > 0) {
      const wind = this.cooldown < 0.35 ? 1.2 : 1;   // kurz vorm Spucken bläht er sich auf
      this.body.scale.set(wind, wind, wind);
    } else {
      this.body.scale.set(1 + hop * 0.35, 1 - hop * 0.3, 1 + hop * 0.35);
    }
    this.mat.emissive.setScalar(this.flash > 0 ? 0.55 : 0);
    this.blob.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
    this.blob.scale.setScalar((0.8 - hop * 0.5) * this.def.scale);
  }

  hurt(dmg) {
    this.hp -= dmg;
    this.flash = 0.09;
    if (this.hp <= 0) { this.dying = 0.25; return true; }
    return false;
  }
}

export class EnemyManager {
  constructor(scene, max = 16) {
    this.pool = Array.from({ length: max }, () => new Enemy(scene));
    this.spawnTimer = 1.5;
    this.tough = 0;          // wächst mit dem Level des Spielers mit
    this.nightBonus = 0;     // nachts sind mehr unterwegs
    this.lightHere = 1;      // Helligkeit beim Spieler (0 = finster)
    this.onBurn = null;      // Rückruf, wenn ein Schatten im Licht zerfällt
  }

  reset() {
    this.pool.forEach((e) => { e.alive = false; e.setVisible(false); });
    this.spawnTimer = 2;
    this.tough = 0;
  }

  get living() { return this.pool.filter((e) => e.alive && e.dying <= 0); }

  pickKind(tier) {
    const r = Math.random();
    if (tier >= 1 && r < 0.28) return 'spitter';
    if (tier >= 2 && r < 0.42) return 'brute';
    if (tier >= 1 && r < 0.5) return 'brute';
    return 'hopper';
  }

  update(dt, player, world, onHitPlayer, shots, brightnessAt = () => 1) {
    // Schwierigkeit wächst mit der Entfernung vom Startpunkt
    const tier = Math.floor(Math.hypot(player.pos.x, player.pos.z) / 90);
    const dark = 1 - (this.lightHere ?? 1);
    const target = Math.min(
      Math.round((3 + tier * 2 + this.tough * 0.6 + this.nightBonus) * (0.35 + dark * 1.3)),
      this.pool.length
    );

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
          if (isLand(x, z) && brightnessAt({ x, z }) < 0.45) {
            free.spawn(x, z, tier, this.pickKind(tier), this.tough);
            break;
          }
        }
      }
    }

    for (const e of this.pool) {
      if (!e.alive) continue;
      e.onBurn = this.onBurn;
      e.update(dt, player, world, onHitPlayer, shots, brightnessAt(e.pos));
    }
  }

  spawnAt(x, z, kind, tier) {
    const free = this.pool.find((e) => !e.alive);
    if (free && isLand(x, z)) free.spawn(x, z, tier, kind, this.tough);
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
/*  Wächter — schläft im Steinkreis, bis jemand zu nah kommt                    */
/* =========================================================================== */
export class Boss {
  constructor(scene) {
    this.group = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: '#9b9a84', flatShading: true });
    const stoneDark = new THREE.MeshLambertMaterial({ color: '#7d7c69', flatShading: true });
    const moss = new THREE.MeshLambertMaterial({ color: '#6b8b45', flatShading: true });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: '#df8a5c' });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.9, 1.3), stone);
    torso.position.y = 1.5;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.85, 0.95), stoneDark);
    head.position.y = 2.75;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.22, 1.1), moss);
    cap.position.y = 3.2;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.6), stoneDark);
    armL.position.set(-1.2, 1.5, 0);
    const armR = armL.clone();
    armR.position.x = 1.2;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.7), stoneDark);
    legL.position.set(-0.45, 0.4, 0);
    const legR = legL.clone();
    legR.position.x = 0.45;

    const eyeGeo2 = new THREE.BoxGeometry(0.2, 0.12, 0.1);
    const eyeL = new THREE.Mesh(eyeGeo2, this.eyeMat); eyeL.position.set(-0.24, 2.8, 0.5);
    const eyeR = new THREE.Mesh(eyeGeo2, this.eyeMat); eyeR.position.set(0.24, 2.8, 0.5);

    this.arms = [armL, armR];
    [torso, head, cap, armL, armR, legL, legR, eyeL, eyeR].forEach((m) => {
      m.castShadow = true;
      this.group.add(m);
    });
    this.mats = [stone, stoneDark];

    // Ring, der den Schlag ankündigt
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#e2643c', transparent: true, opacity: 0.55, depthWrite: false })
    );
    this.ring.visible = false;
    this.ring.renderOrder = 2;

    this.blob = makeBlob(3.2);
    scene.add(this.group, this.ring, this.blob);
    this.pos = new THREE.Vector3();
    this.def = { scale: 3 };          // damit Pfeile denselben Treffertest nutzen können
    this.alive = false;
    this.setVisible(false);
  }

  setVisible(v) { this.group.visible = v; this.blob.visible = v; if (!v) this.ring.visible = false; }

  spawn(shrine, level) {
    this.shrine = shrine;
    this.pos.set(shrine.x, heightAt(shrine.x, shrine.z), shrine.z);
    this.hpMax = 45 + level * 14;
    this.hp = this.hpMax;
    this.damage = 22 + level * 3;
    this.speed = 2.0;
    this.radius = 0.9;
    this.state = 'sleep';
    this.timer = 0;
    this.slamCd = 3.2;
    this.summonCd = 9;
    this.flash = 0;
    this.dying = 0;
    this.alive = true;
    this.size = 1.4;                  // der Wächter überragt alles andere
    this.group.scale.setScalar(this.size);
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.setVisible(true);
  }

  get awake() { return this.alive && this.state !== 'sleep' && this.dying <= 0; }

  update(dt, player, world, cb) {
    if (!this.alive) return;

    if (this.dying > 0) {
      this.dying -= dt;
      this.group.position.y = this.pos.y - (1 - this.dying / 1.2) * 1.6;
      this.group.rotation.z = (1 - this.dying / 1.2) * 0.5;
      if (this.dying <= 0) { this.alive = false; this.setVisible(false); this.group.rotation.z = 0; }
      return;
    }

    if (this.flash > 0) this.flash -= dt;
    for (const m of this.mats) m.emissive.setScalar(this.flash > 0 ? 0.4 : 0);

    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    this.timer += dt;

    if (this.state === 'sleep') {
      // zusammengesunken, bis jemand in den Kreis tritt
      this.group.scale.set(this.size, this.size * 0.55, this.size);
      this.eyeMat.color.setHex(0x5c5a4c);
      if (dist < 15) {
        this.state = 'wake';
        this.timer = 0;
        cb.onWake();
      }
      this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.blob.position.set(this.pos.x, this.pos.y + 0.04, this.pos.z);
      return;
    }

    if (this.state === 'wake') {
      const t = Math.min(1, this.timer / 1.3);
      this.group.scale.set(this.size, this.size * (0.55 + t * 0.45), this.size);
      this.eyeMat.color.setHex(0xdf8a5c);
      if (t >= 1) { this.state = 'chase'; this.timer = 0; }
    }

    if (this.state === 'chase') {
      this.slamCd -= dt;
      this.summonCd -= dt;

      if (dist > 2.6) {
        const next = this.pos.clone();
        next.x += (dx / dist) * this.speed * dt;
        next.z += (dz / dist) * this.speed * dt;
        if (heightAt(next.x, next.z) > WATER_LEVEL) {
          world.resolveCollisions(next, this.radius);
          this.pos.x = next.x; this.pos.z = next.z;
        }
      }
      if (this.slamCd <= 0 && dist < 11) {
        this.state = 'windup';
        this.timer = 0;
        this.ring.visible = true;
      }
      if (this.summonCd <= 0) {
        this.summonCd = 11;
        cb.onSummon(this.pos);
      }
      // schwerer Gang
      const sway = Math.sin(this.timer * 4.5);
      this.arms[0].rotation.x = sway * 0.35;
      this.arms[1].rotation.x = -sway * 0.35;
    }

    if (this.state === 'windup') {
      const t = Math.min(1, this.timer / 1.0);
      const r = 1.5 + t * 6.0;
      this.ring.scale.setScalar(r);
      this.ring.material.opacity = 0.25 + t * 0.45;
      this.arms[0].rotation.x = -t * 1.5;
      this.arms[1].rotation.x = -t * 1.5;
      this.group.scale.set(this.size * (1 + t * 0.08), this.size * (1 - t * 0.06), this.size * (1 + t * 0.08));
      if (t >= 1) {
        this.state = 'recover';
        this.timer = 0;
        this.ring.visible = false;
        this.slamCd = 3.4;
        cb.onSlam(this.pos, 7.5, this.damage);
      }
    }

    if (this.state === 'recover') {
      this.group.scale.setScalar(this.size);
      this.arms[0].rotation.x = 0;
      this.arms[1].rotation.x = 0;
      if (this.timer > 0.7) { this.state = 'chase'; this.timer = 0; }
    }

    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.group.rotation.y = Math.atan2(dx, dz);
    this.blob.position.set(this.pos.x, this.pos.y + 0.04, this.pos.z);
    this.ring.position.set(this.pos.x, this.pos.y + 0.08, this.pos.z);
  }

  hurt(dmg) {
    if (!this.awake) return false;      // im Schlaf ist er unverwundbar
    this.hp -= dmg;
    this.flash = 0.09;
    if (this.hp <= 0) { this.dying = 1.2; this.ring.visible = false; return true; }
    return false;
  }

  reset() { this.alive = false; this.setVisible(false); }
}

/* =========================================================================== */
/*  Geschosse der Fernkämpfer — davor muss man weglaufen                       */
/* =========================================================================== */
export class EnemyShots {
  constructor(scene, max = 24) {
    // gut sichtbar: im grünen Wald ist Warmrot die einzige Farbe, die "Gefahr" sagt
    const geo = new THREE.IcosahedronGeometry(0.32, 0);
    const mat = new THREE.MeshLambertMaterial({ color: '#e2643c', flatShading: true, emissive: '#6d2412' });
    this.items = Array.from({ length: max }, () => {
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      return { mesh: m, alive: false, dir: new THREE.Vector3(), life: 0, damage: 8 };
    });
    this.speed = 13;
  }

  reset() { this.items.forEach((p) => { p.alive = false; p.mesh.visible = false; }); }

  fire(from, dirX, dirZ, damage) {
    const p = this.items.find((i) => !i.alive);
    if (!p) return;
    p.alive = true;
    p.life = 2.6;
    p.damage = damage;
    p.dir.set(dirX, 0, dirZ).normalize();
    p.mesh.position.set(from.x, from.y + 0.7, from.z);
    p.mesh.visible = true;
  }

  update(dt, player, onHit) {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.life -= dt;
      p.mesh.position.addScaledVector(p.dir, this.speed * dt);
      p.mesh.rotation.x += dt * 5;
      p.mesh.rotation.y += dt * 4;
      const dx = player.pos.x - p.mesh.position.x, dz = player.pos.z - p.mesh.position.z;
      if (dx * dx + dz * dz < 0.75 * 0.75) {
        p.alive = false; p.mesh.visible = false;
        onHit(p.damage);
      } else if (p.life <= 0) {
        p.alive = false; p.mesh.visible = false;
      }
    }
  }
}

/* =========================================================================== */
/*  Pfeile                                                                     */
/* =========================================================================== */
export class ProjectileManager {
  constructor(scene, max = 40) {
    const shaft = new THREE.BoxGeometry(0.07, 0.07, 0.55);
    const mat = new THREE.MeshLambertMaterial({ color: '#f7eed6', flatShading: true });
    this.items = Array.from({ length: max }, () => {
      const m = new THREE.Mesh(shaft, mat);
      m.visible = false;
      scene.add(m);
      return { mesh: m, alive: false, dir: new THREE.Vector3(), life: 0, pierce: 0, hit: [] };
    });
    this.speed = 30;
    this.damage = 1;
  }

  reset() { this.items.forEach((p) => { p.alive = false; p.mesh.visible = false; }); }

  fire(from, dirX, dirZ, pierce = 0) {
    const p = this.items.find((i) => !i.alive);
    if (!p) return;
    p.alive = true;
    p.life = 1.0;
    p.pierce = pierce;
    p.hit.length = 0;
    p.dir.set(dirX, 0, dirZ).normalize();
    p.mesh.position.set(from.x, from.y + 0.85, from.z);
    p.mesh.rotation.y = Math.atan2(p.dir.x, p.dir.z);
    p.mesh.visible = true;
  }

  update(dt, targets, onKill) {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.life -= dt;
      p.mesh.position.addScaledVector(p.dir, this.speed * dt);
      if (p.life <= 0) { p.alive = false; p.mesh.visible = false; continue; }

      for (const e of targets) {
        if (p.hit.includes(e)) continue;
        const r = 0.55 * e.def.scale;
        const dx = e.pos.x - p.mesh.position.x, dz = e.pos.z - p.mesh.position.z;
        if (dx * dx + dz * dz < r * r) {
          p.hit.push(e);
          if (e.hurt(this.damage)) onKill(e);
          if (p.pierce > 0) p.pierce -= 1;
          else { p.alive = false; p.mesh.visible = false; }
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
    const mat = new THREE.MeshLambertMaterial({ color: '#f2dda2', flatShading: true, emissive: '#6b5a24' });
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

  update(dt, player, onCollect, magnet = 4.5) {
    for (const g of this.items) {
      if (!g.alive) continue;
      g.t += dt * 3;
      const p = g.mesh.position;
      const dx = player.pos.x - p.x, dz = player.pos.z - p.z;
      const d = Math.hypot(dx, dz);

      if (d < magnet) {                    // sanfter Magnet
        const pull = Math.min(1, (magnet - d) / magnet) * 14 * dt;
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
