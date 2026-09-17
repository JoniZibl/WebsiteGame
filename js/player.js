import * as THREE from 'three';
import { B, BLOCKS, AIR, isSolid, HEIGHT, surfaceAt } from './voxel.js';

/* ==========================================================================
 *  Die Figur in einer Blockwelt: Schwerkraft, Stufen steigen, graben, bauen.
 * ========================================================================== */

const RADIUS = 0.32;
const BODY = 1.72;
const GRAVITY = 26;
const JUMP = 8.2;
const HUEPFER = 7.4;      // reicht knapp über eine Stufe von einem Block

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();

    /* Der Lichtträger. Fast alles an ihm ist Silhouette — was man sieht, ist
       die Laterne und zwei Augen, die sie spiegeln. Bei der Größe, in der er
       auf dem Schirm steht, zählt nur die Umrisslinie. */
    /* Der Spieler muss sich auf einen Blick von den Dorfleuten abheben —
       dieselbe Bauweise, aber Stahl und Blau statt Leinen und Erdfarben. */
    const kutte = new THREE.MeshLambertMaterial({ color: '#4a6f9e', flatShading: true });
    const saum  = new THREE.MeshLambertMaterial({ color: '#33506f', flatShading: true });
    const haut  = new THREE.MeshLambertMaterial({ color: '#f0cba0', flatShading: true });
    const glas  = new THREE.MeshBasicMaterial({ color: '#ffe9b0' });
    const metall = new THREE.MeshLambertMaterial({ color: '#d8dde2', flatShading: true });
    const auge  = new THREE.MeshBasicMaterial({ color: '#3f3328' });

    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    // Rumpf: eine Kutte, unten breiter als oben
    this.torso = new THREE.Mesh(box(0.56, 0.78, 0.44), kutte);
    this.torso.position.y = 0.92;
    const rock = new THREE.Mesh(box(0.7, 0.36, 0.54), saum);
    rock.position.y = 0.36;

    // Kopf steckt in der Kapuze — nur ein Streifen Gesicht bleibt frei
    this.head = new THREE.Mesh(box(0.46, 0.4, 0.42), haut);
    this.head.position.y = 1.5;
    const kapuze = new THREE.Mesh(box(0.56, 0.42, 0.52), kutte);
    kapuze.position.set(0, 1.58, -0.06);
    const schirm = new THREE.Mesh(box(0.58, 0.12, 0.2), saum);
    schirm.position.set(0, 1.62, 0.2);

    const augeL = new THREE.Mesh(box(0.08, 0.08, 0.04), auge);
    augeL.position.set(-0.11, 1.45, 0.22);
    const augeR = augeL.clone(); augeR.position.x = 0.11;

    // Die Laterne: das eigentliche Gesicht der Figur
    this.armR = new THREE.Mesh(box(0.16, 0.5, 0.18), kutte);
    this.armR.position.set(0.34, 0.98, 0.1);
    this.armL = new THREE.Mesh(box(0.16, 0.5, 0.18), kutte);
    this.armL.position.set(-0.34, 0.98, 0.04);

    const buegel = new THREE.Mesh(box(0.04, 0.22, 0.04), metall);
    buegel.position.set(0.42, 0.98, 0.34);
    this.laterne = new THREE.Mesh(box(0.26, 0.28, 0.26), glas);
    this.laterne.position.set(0.42, 0.74, 0.34);
    const deckel = new THREE.Mesh(box(0.32, 0.07, 0.32), metall);
    deckel.position.set(0.42, 0.91, 0.34);
    const boden = new THREE.Mesh(box(0.32, 0.07, 0.32), metall);
    boden.position.set(0.42, 0.58, 0.34);

    this.legL = new THREE.Mesh(box(0.2, 0.3, 0.22), saum);
    this.legL.position.set(-0.14, 0.15, 0);
    this.legR = new THREE.Mesh(box(0.2, 0.3, 0.22), saum);
    this.legR.position.set(0.14, 0.15, 0);

    // Die Waffe in der freien Hand. Griff und Klinge sind getrennt, damit
    // eine bessere Waffe wirklich anders aussieht und nicht nur anders zählt.
    this.griffMat = new THREE.MeshLambertMaterial({ color: '#8a5230', flatShading: true });
    this.klingeMat = new THREE.MeshLambertMaterial({ color: '#d8dde2', flatShading: true });
    this.tool = new THREE.Mesh(box(0.09, 0.3, 0.09), this.griffMat);
    this.tool.position.set(-0.4, 0.92, 0.22);
    this.head2 = new THREE.Mesh(box(0.13, 0.5, 0.06), this.klingeMat);
    this.head2.position.set(-0.4, 0.66, 0.22);

    [this.torso, rock, this.head, kapuze, schirm, augeL, augeR, this.armL, this.armR,
     buegel, this.laterne, deckel, boden, this.legL, this.legR, this.tool, this.head2]
      .forEach((m) => { m.castShadow = true; this.group.add(m); });

    scene.add(this.group);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.onGround = false;
    this.inWater = false;
    this.t = 0;
    this.swing = 0;
    this.huepft = 0;
    this.tempo = 1;
    this.rennt = false;
    this.schritt = 0;   // Phase der Beinarbeit, läuft mit dem Tempo mit
  }

  spawn(world, x, z) {
    // Auf den gewachsenen Boden, nicht auf ein Blaetterdach - world.surfaceY
    // zaehlt Baeume mit und setzte den Zwerg schon mal in eine Baumkrone.
    const y = surfaceAt(x, z) + 1;
    for (let dy = 0; dy < 3; dy++) {
      const b = world.get(x, y + dy, z);
      if (b === B.laub || b === B.stamm || b === B.pilz) world.set(x, y + dy, z, AIR);
    }
    this.pos.set(x + 0.5, y, z + 0.5);
    this.vel.set(0, 0, 0);
  }

  /* --------------------------- Kollision ---------------------------------- */
  blocked(world, x, y, z) {
    const y0 = Math.floor(y + 0.05), y1 = Math.floor(y + BODY - 0.1);
    for (let by = y0; by <= y1; by++) {
      for (const [dx, dz] of [[-RADIUS, -RADIUS], [RADIUS, -RADIUS], [-RADIUS, RADIUS], [RADIUS, RADIUS]]) {
        if (isSolid(world.get(Math.floor(x + dx), by, Math.floor(z + dz)))) return true;
      }
    }
    return false;
  }

  update(dt, move, world) {
    this.t += dt;
    if (this.swing > 0) this.swing -= dt;

    const feet = world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z));
    this.inWater = feet === B.wasser;

    const speed = (this.inWater ? 3.4 : 5.4) * (this.tempo || 1) * move.strength;
    const wishX = move.x * speed;
    const wishZ = move.y * speed;
    this.vel.x += (wishX - this.vel.x) * Math.min(1, dt * 14);
    this.vel.z += (wishZ - this.vel.z) * Math.min(1, dt * 14);

    // Schwerkraft, im Wasser gebremst
    this.vel.y -= (this.inWater ? GRAVITY * 0.28 : GRAVITY) * dt;
    if (this.inWater) this.vel.y = Math.max(this.vel.y, -2.4);

    /* Waagerecht bewegen. Steht eine Stufe von einem Block im Weg, wird sie
       nicht mehr übersprungen, indem die Figur einen Meter nach oben gesetzt
       wird - das sah aus wie ein Fehler. Stattdessen hüpft sie: ein Stoß nach
       oben, und die Schwerkraft macht den Rest. Oben angekommen greift die
       waagerechte Bewegung von allein wieder. */
    const huepfenWenn = (frei) => {
      if (!this.onGround || !frei) return false;
      this.vel.y = HUEPFER;
      this.onGround = false;
      this.huepft = 0.36;          // fürs Anwinkeln der Beine
      return true;
    };

    /* In der Luft wird der Schwung nicht genommen: wer gegen die Kante hüpft,
       drückt weiter dagegen und rutscht oben drüber, sobald Platz ist. Nur wer
       am Boden vor einer echten Wand steht, bleibt stehen. */
    const stepX = this.vel.x * dt;
    if (!this.blocked(world, this.pos.x + stepX, this.pos.y, this.pos.z)) {
      this.pos.x += stepX;
    } else if (!huepfenWenn(!this.blocked(world, this.pos.x + stepX, this.pos.y + 1.05, this.pos.z))) {
      if (this.onGround) this.vel.x = 0;
    }

    const stepZ = this.vel.z * dt;
    if (!this.blocked(world, this.pos.x, this.pos.y, this.pos.z + stepZ)) {
      this.pos.z += stepZ;
    } else if (!huepfenWenn(!this.blocked(world, this.pos.x, this.pos.y + 1.05, this.pos.z + stepZ))) {
      if (this.onGround) this.vel.z = 0;
    }

    // Senkrecht
    const stepY = this.vel.y * dt;
    if (!this.blocked(world, this.pos.x, this.pos.y + stepY, this.pos.z)) {
      this.pos.y += stepY;
      this.onGround = false;
    } else {
      if (this.vel.y < 0) {
        this.pos.y = Math.floor(this.pos.y + stepY) + 1;
        this.onGround = true;
      }
      this.vel.y = 0;
    }
    if (this.pos.y < 1) { this.pos.y = 1; this.onGround = true; this.vel.y = 0; }

    if (move.active && move.strength > 0.05) this.facing = Math.atan2(move.x, move.y);

    // Animation
    const sp = Math.hypot(this.vel.x, this.vel.z);
    // Die Beine gehen im Takt der Geschwindigkeit — beim Rennen sichtbar schneller
    this.schritt += dt * Math.min(22, sp * 1.9);
    const stride = Math.sin(this.schritt);
    const walking = sp > 0.4;
    const weit = this.rennt && walking ? 0.85 : 0.55;
    if (this.huepft > 0) this.huepft -= dt;

    // Beim Hüpfen ziehen sich die Beine an, statt weiterzulaufen
    if (this.huepft > 0 || !this.onGround) {
      const k = Math.min(1, Math.max(0, this.huepft / 0.36));
      this.legL.rotation.x = -0.75 * k;
      this.legR.rotation.x = -0.45 * k;
    } else {
      this.legL.rotation.x = walking ? stride * weit : 0;
      this.legR.rotation.x = walking ? -stride * weit : 0;
    }

    // Die Laterne bleibt ruhig - sie ist das Einzige, was er nicht schwenkt.
    this.armR.rotation.x = walking ? stride * (this.rennt ? 0.3 : 0.12) : 0;

    const swingK = Math.max(0, this.swing / 0.25);
    this.armL.rotation.x = -swingK * 1.5 + (walking ? -stride * 0.4 : 0);
    this.tool.rotation.x = -swingK * 1.5;
    this.tool.position.set(-0.4, 0.92 - swingK * 0.22, 0.22 + swingK * 0.2);
    this.head2.position.set(-0.4, 0.66 - swingK * 0.44, 0.22 + swingK * 0.36);

    // Das Laternenglas atmet mit dem Licht
    const puls = 0.94 + Math.sin(this.t * 4.5) * 0.06;
    this.laterne.scale.setScalar(puls);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;
  }

  /** Was in der Hand steckt, richtet sich nach dem, was angelegt ist. */
  setWaffe(d) {
    if (!d) {
      this.tool.visible = false;
      this.head2.visible = false;
      return;
    }
    this.tool.visible = true;
    this.head2.visible = true;
    const laenge = 0.34 + (d.schaden || 0) * 0.026;
    const breite = 0.1 + (d.schaden || 0) * 0.006;
    this.head2.scale.set(breite / 0.13, laenge / 0.5, 1);
    this.klingeMat.color.set(d.klinge || '#d8dde2');
    this.griffMat.color.set(d.griff || '#8a5230');
  }

  jump() {
    if (this.onGround || this.inWater) {
      this.vel.y = this.inWater ? JUMP * 0.55 : JUMP;
      this.onGround = false;
    }
  }

  /** Auf welchen Block zielt die Figur gerade? */
  aim(world, mode) {
    const bx = Math.floor(this.pos.x);
    const bz = Math.floor(this.pos.z);
    const by = Math.floor(this.pos.y);

    if (mode === 'down') return { x: bx, y: by - 1, z: bz };

    const fx = Math.round(Math.sin(this.facing));
    const fz = Math.round(Math.cos(this.facing));
    // erst auf Bauchhöhe, sonst auf Fußhöhe, sonst darüber
    for (const dy of [0, 1, -1]) {
      const t = { x: bx + fx, y: by + dy, z: bz + fz };
      if (isSolid(world.get(t.x, t.y, t.z))) return t;
    }
    return { x: bx + fx, y: by, z: bz + fz };
  }

  /** Wohin würde ein gesetzter Block kommen? */
  placeTarget(world, mode) {
    const bx = Math.floor(this.pos.x), by = Math.floor(this.pos.y), bz = Math.floor(this.pos.z);
    if (mode === 'down') return { x: bx, y: by - 1, z: bz };
    const fx = Math.round(Math.sin(this.facing));
    const fz = Math.round(Math.cos(this.facing));

    // Erst in Blickrichtung, dann ringsum, zuletzt ueber den Kopf. Ohne den
    // letzten Ausweg liesse sich im engen Stollen keine Fackel setzen.
    const spots = [];
    for (const dy of [0, 1, 2]) spots.push({ x: bx + fx, y: by + dy, z: bz + fz });
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const dy of [0, 1]) spots.push({ x: bx + ox, y: by + dy, z: bz + oz });
    }
    spots.push({ x: bx, y: by + 2, z: bz });

    for (const t of spots) if (!isSolid(world.get(t.x, t.y, t.z))) return t;
    return null;
  }
}
