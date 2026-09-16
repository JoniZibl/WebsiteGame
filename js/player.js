import * as THREE from 'three';
import { B, BLOCKS, AIR, isSolid, HEIGHT } from './voxel.js';

/* ==========================================================================
 *  Die Figur in einer Blockwelt: Schwerkraft, Stufen steigen, graben, bauen.
 * ========================================================================== */

const RADIUS = 0.32;
const BODY = 1.72;
const GRAVITY = 26;
const JUMP = 8.2;

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();

    const coat = new THREE.MeshLambertMaterial({ color: '#4d7ec8', flatShading: true });
    const skin = new THREE.MeshLambertMaterial({ color: '#f0cfa8', flatShading: true });
    const hair = new THREE.MeshLambertMaterial({ color: '#5a3d2b', flatShading: true });
    const boot = new THREE.MeshLambertMaterial({ color: '#3a3f4d', flatShading: true });
    const dark = new THREE.MeshBasicMaterial({ color: '#241f2e' });

    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    this.torso = new THREE.Mesh(box(0.62, 0.72, 0.36), coat);
    this.torso.position.y = 1.02;
    this.head = new THREE.Mesh(box(0.52, 0.5, 0.48), skin);
    this.head.position.y = 1.62;
    const cap = new THREE.Mesh(box(0.56, 0.16, 0.52), hair);
    cap.position.y = 1.85;
    const eyeL = new THREE.Mesh(box(0.1, 0.12, 0.05), dark); eyeL.position.set(-0.13, 1.63, 0.25);
    const eyeR = new THREE.Mesh(box(0.1, 0.12, 0.05), dark); eyeR.position.set(0.13, 1.63, 0.25);

    this.armL = new THREE.Mesh(box(0.18, 0.62, 0.2), coat);
    this.armL.position.set(-0.4, 1.05, 0);
    this.armR = new THREE.Mesh(box(0.18, 0.62, 0.2), coat);
    this.armR.position.set(0.4, 1.05, 0);

    this.legL = new THREE.Mesh(box(0.22, 0.62, 0.24), boot);
    this.legL.position.set(-0.15, 0.34, 0);
    this.legR = new THREE.Mesh(box(0.22, 0.62, 0.24), boot);
    this.legR.position.set(0.15, 0.34, 0);

    // Werkzeug in der Hand — dreht sich beim Graben
    this.tool = new THREE.Mesh(box(0.1, 0.52, 0.1), hair);
    this.tool.position.set(0.44, 1.1, 0.2);
    this.head2 = new THREE.Mesh(box(0.34, 0.12, 0.12), new THREE.MeshLambertMaterial({
      color: '#b9c0c8', flatShading: true,
    }));
    this.head2.position.set(0.44, 1.36, 0.2);

    [this.torso, this.head, cap, eyeL, eyeR, this.armL, this.armR, this.legL, this.legR,
     this.tool, this.head2].forEach((m) => { m.castShadow = true; this.group.add(m); });

    scene.add(this.group);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.onGround = false;
    this.inWater = false;
    this.t = 0;
    this.swing = 0;
    this.health = 10;
  }

  spawn(world, x, z) {
    const y = world.surfaceY(x, z) + 1;
    this.pos.set(x + 0.5, y, z + 0.5);
    this.vel.set(0, 0, 0);
    this.health = 10;
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

    const speed = (this.inWater ? 3.4 : 5.4) * move.strength;
    const wishX = move.x * speed;
    const wishZ = move.y * speed;
    this.vel.x += (wishX - this.vel.x) * Math.min(1, dt * 14);
    this.vel.z += (wishZ - this.vel.z) * Math.min(1, dt * 14);

    // Schwerkraft, im Wasser gebremst
    this.vel.y -= (this.inWater ? GRAVITY * 0.28 : GRAVITY) * dt;
    if (this.inWater) this.vel.y = Math.max(this.vel.y, -2.4);

    // Waagerecht bewegen, dabei Stufen von einem Block automatisch nehmen
    const stepX = this.vel.x * dt;
    if (!this.blocked(world, this.pos.x + stepX, this.pos.y, this.pos.z)) {
      this.pos.x += stepX;
    } else if (this.onGround && !this.blocked(world, this.pos.x + stepX, this.pos.y + 1.02, this.pos.z)) {
      this.pos.y += 1.02;
      this.pos.x += stepX;
    } else {
      this.vel.x = 0;
    }

    const stepZ = this.vel.z * dt;
    if (!this.blocked(world, this.pos.x, this.pos.y, this.pos.z + stepZ)) {
      this.pos.z += stepZ;
    } else if (this.onGround && !this.blocked(world, this.pos.x, this.pos.y + 1.02, this.pos.z + stepZ)) {
      this.pos.y += 1.02;
      this.pos.z += stepZ;
    } else {
      this.vel.z = 0;
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
    const stride = Math.sin(this.t * 10);
    const walking = sp > 0.4;
    this.legL.rotation.x = walking ? stride * 0.7 : 0;
    this.legR.rotation.x = walking ? -stride * 0.7 : 0;
    this.armL.rotation.x = walking ? -stride * 0.5 : 0;

    const swingK = Math.max(0, this.swing / 0.25);
    this.armR.rotation.x = -swingK * 1.6 + (walking ? stride * 0.5 : 0);
    this.tool.rotation.x = -swingK * 1.6;
    this.head2.position.set(0.44, 1.36 - swingK * 0.5, 0.2 + swingK * 0.35);
    this.tool.position.set(0.44, 1.1 - swingK * 0.28, 0.2 + swingK * 0.2);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;
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
    for (const dy of [0, 1, 2]) {
      const t = { x: bx + fx, y: by + dy, z: bz + fz };
      if (!isSolid(world.get(t.x, t.y, t.z))) return t;
    }
    return null;
  }
}
