import * as THREE from 'three';

/**
 * Alles, was einen Treffer wie einen Treffer anfühlen lässt: Bildruck,
 * Wackeln, Schockwellen und Zahlen, die aufsteigen. Ein Spiel ohne das
 * fühlt sich an wie ein Prototyp — egal wie viele Systeme darin stecken.
 */
/* Wie weit und wie lange ein angeschlagener Stein nachgibt. Weniger als ein
   Baum: die vier Grad sind gerade genug, dass man den Hieb sieht, und klein
   genug, dass die echte Wand dahinter verdeckt bleibt. */
const BLOCKWACKELZEIT = 0.26;
const BLOCKWACKELWEIT = 0.07;
const BLOCKWACKELSCHNELL = 34;
const BLOCKDECKUNG = 1.06;
const _kippachse = new THREE.Vector3();

export class Juice {
  constructor(scene, camera, blockStoff = null) {
    this.camera = camera;

    this.shakeAmount = 0;
    this.shakeTime = 0;
    this.offset = new THREE.Vector3();

    this.stop = 0;          // Bildruck in Sekunden
    this.timeScale = 1;

    // Schockwellen: flache Ringe, die aufblühen und verschwinden
    const ringGeo = new THREE.RingGeometry(0.55, 1, 20).rotateX(-Math.PI / 2);
    this.rings = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
        color: '#fff2cf', transparent: true, opacity: 0, depthWrite: false,
      }));
      m.visible = false;
      m.renderOrder = 4;
      scene.add(m);
      return { mesh: m, t: 0, life: 0, size: 1 };
    });

    /* Staub unter den Füßen: eigener Vorrat, damit die Schockwellen nicht
       davon aufgebraucht werden. Ein kleiner Wolken-Würfel, der aufgeht und
       sinkt — er macht aus Gleiten ein Gehen. */
    const staubGeo = new THREE.IcosahedronGeometry(0.22, 0);
    this.staubteile = Array.from({ length: 16 }, () => {
      const m = new THREE.Mesh(staubGeo, new THREE.MeshBasicMaterial({
        color: '#e6d9bd', transparent: true, opacity: 0, depthWrite: false,
      }));
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      return { mesh: m, t: 0, life: 0, size: 1, vx: 0, vz: 0 };
    });

    /* Stein und Erz stecken in der Chunk-Geometrie — einen einzelnen Würfel
       daraus zu bewegen ginge nur, indem man das ganze Netz neu baut, und
       das bei jedem Hieb. Stattdessen stellt sich für den Moment des Hiebs
       ein eigener Würfel an dieselbe Stelle und kippt. Er trägt dieselben
       Seitenfarben und denselben Werkstoff wie die Wand, aus der er kommt,
       also fällt der Wechsel nicht auf — es sieht aus, als gäbe der Stein
       unter dem Beil nach.

       Der Ursprung liegt unten in der Mitte: so dreht der Würfel um seinen
       Fuß statt um seine Mitte, genau wie ein angeschlagener Baum. Ein Hauch
       größer als ein Blockmaß ist er, damit der echte Stein darunter beim
       Kippen nicht an den Kanten hervorschaut. */
    const stossGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    stossGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(72), 3));
    this.blockStoff = blockStoff;
    this.stoesse = Array.from({ length: 4 }, () => {
      const geo = stossGeo.clone();
      const m = new THREE.Mesh(geo, blockStoff || new THREE.MeshBasicMaterial({
        vertexColors: true,
      }));
      m.visible = false;
      m.castShadow = false;
      scene.add(m);
      return { mesh: m, t: 0, life: 0, ax: 0, az: 0 };
    });
    /* In welcher Reihenfolge BoxGeometry die Seiten ablegt. Die Farben kommen
       nach Himmelsrichtung benannt herein, also muss das einmal sauber
       zugeordnet werden — sonst sitzt die helle Deckelfarbe an der Flanke. */
    this.seiten = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

    // Aufsteigende Zahlen als HTML — scharf, billig, funktioniert überall
    this.layer = document.getElementById('popups');
    this.pops = Array.from({ length: 14 }, () => {
      const el = document.createElement('div');
      el.className = 'pop';
      this.layer.append(el);
      return { el, t: 0, life: 0, pos: new THREE.Vector3(), rise: 0 };
    });
    this._v = new THREE.Vector3();

    /* Die Bildgröße wird gemerkt statt in jedem Bild für jede Zahl neu beim
       Browser erfragt — das Abfragen kann ihn zwingen, das Layout vorher
       fertig zu rechnen, und das mitten im Bild. */
    this.breite = window.innerWidth;
    this.hoehe = window.innerHeight;
    const messen = () => { this.breite = window.innerWidth; this.hoehe = window.innerHeight; };
    window.addEventListener('resize', messen);
    window.addEventListener('orientationchange', () => setTimeout(messen, 200));
  }

  /** Kurzer Bildruck — der Klassiker, der jeden Treffer verkauft. */
  freeze(seconds = 0.05) { this.stop = Math.max(this.stop, seconds); }

  shake(amount = 0.5) { this.shakeAmount = Math.min(1.4, this.shakeAmount + amount); }

  /** Eine kleine Wolke unter dem Fuß. */
  staub(pos, stark = 1, farbe = '#e6d9bd') {
    const t = this.staubteile.find((x) => x.life <= 0);
    if (!t) return;
    t.life = 0.42;
    t.t = 0;
    t.size = 0.5 + stark * 0.7;
    t.vx = (Math.random() - 0.5) * 0.7;
    t.vz = (Math.random() - 0.5) * 0.7;
    t.mesh.material.color.set(farbe);
    t.mesh.position.set(pos.x, (pos.y ?? 0) + 0.12, pos.z);
    t.mesh.visible = true;
  }

  /** Ein Block wackelt: kurzes Kippen vom Schlag weg. */
  stoss(ort, farben, rx = 0, rz = 0) {
    if (!farben) return;
    /* Steht derselbe Block schon da, wird er weitergeschlagen statt verdoppelt. */
    const t = this.stoesse.find((x) => x.life > 0 && x.bx === ort.x && x.by === ort.y && x.bz === ort.z)
      || this.stoesse.find((x) => x.life <= 0)
      || this.stoesse.reduce((a, b) => (a.t > b.t ? a : b));
    t.life = BLOCKWACKELZEIT;
    t.t = 0;
    const l = Math.hypot(rx, rz) || 1;
    t.ax = rz / l;                 // Kippachse steht quer zur Schlagrichtung
    t.az = -rx / l;
    t.bx = ort.x; t.by = ort.y; t.bz = ort.z;

    const farbe = t.mesh.geometry.getAttribute('color');
    for (let f = 0; f < 6; f++) {
      const c = farben[this.seiten[f]];
      if (!c) continue;
      for (let v = 0; v < 4; v++) farbe.setXYZ(f * 4 + v, c[0], c[1], c[2]);
    }
    farbe.needsUpdate = true;

    t.mesh.position.set(ort.x + 0.5, ort.y, ort.z + 0.5);
    t.mesh.quaternion.identity();
    t.mesh.scale.setScalar(BLOCKDECKUNG);
    t.mesh.visible = true;
  }

  /** Nimmt die Steinwürfel sofort weg — etwa wenn der Block gerade bricht. */
  blockRuhig() {
    for (const t of this.stoesse) { t.life = 0; t.mesh.visible = false; }
  }

  ring(pos, size = 3, color = '#fff2cf', life = 0.4) {
    const r = this.rings.find((x) => x.life <= 0);
    if (!r) return;
    r.life = life;
    r.t = 0;
    r.size = size;
    r.mesh.material.color.set(color);
    r.mesh.position.set(pos.x, (pos.y ?? 0) + 0.12, pos.z);
    r.mesh.visible = true;
  }

  popup(pos, text, color = '#fff2cf') {
    const p = this.pops.find((x) => x.life <= 0);
    if (!p) return;
    p.life = 0.85;
    p.t = 0;
    p.rise = 34 + Math.random() * 14;
    p.pos.set(pos.x + (Math.random() - 0.5) * 0.6, (pos.y ?? 0) + 1.2, pos.z);
    p.el.textContent = text;
    p.el.style.color = color;
    p.el.style.opacity = '1';
  }

  /** dt kommt ungebremst herein; zurück kommt die Zeit, die das Spiel sehen darf. */
  update(dt) {
    if (this.stop > 0) {
      this.stop = Math.max(0, this.stop - dt);
      this.timeScale = 0.02;
    } else {
      this.timeScale = 1;
    }

    // Wackeln klingt schnell ab und wechselt dabei die Richtung
    this.shakeTime += dt * 42;
    this.shakeAmount *= Math.pow(0.0015, dt);
    if (this.shakeAmount < 0.002) this.shakeAmount = 0;
    this.offset.set(
      Math.sin(this.shakeTime) * this.shakeAmount * 0.9,
      Math.sin(this.shakeTime * 1.7) * this.shakeAmount * 0.5,
      Math.cos(this.shakeTime * 1.3) * this.shakeAmount * 0.9
    );

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.t += dt;
      const k = Math.min(1, r.t / r.life);
      if (k >= 1) { r.life = 0; r.mesh.visible = false; continue; }
      const s = (0.3 + k * 0.9) * r.size;
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = (1 - k) * 0.75;
    }

    for (const t of this.staubteile) {
      if (t.life <= 0) continue;
      t.t += dt;
      const k = Math.min(1, t.t / t.life);
      if (k >= 1) { t.life = 0; t.mesh.visible = false; continue; }
      const s2 = t.size * (0.4 + k * 0.9);
      t.mesh.scale.set(s2, s2 * 0.6, s2);
      t.mesh.position.x += t.vx * dt;
      t.mesh.position.z += t.vz * dt;
      t.mesh.position.y += dt * 0.35;
      t.mesh.material.opacity = (1 - k) * 0.5;
    }

    for (const t of this.stoesse) {
      if (t.life <= 0) continue;
      t.t += dt;
      const k = Math.min(1, t.t / t.life);
      if (k >= 1) { t.life = 0; t.mesh.visible = false; continue; }
      /* Abklingen mal Schwingung, wie beim Baum — nur kleiner und kürzer.
         Ein Stein soll schwer wirken und nicht nachfedern wie ein Ast. */
      const winkel = BLOCKWACKELWEIT * (1 - k) * (1 - k) * Math.cos(t.t * BLOCKWACKELSCHNELL);
      _kippachse.set(t.ax, 0, t.az);
      t.mesh.quaternion.setFromAxisAngle(_kippachse, winkel);
    }

    for (const p of this.pops) {
      if (p.life <= 0) continue;
      p.t += dt;
      const k = Math.min(1, p.t / p.life);
      if (k >= 1) { p.life = 0; p.el.style.opacity = '0'; continue; }

      this._v.copy(p.pos).project(this.camera);
      const x = (this._v.x * 0.5 + 0.5) * this.breite;
      const y = (-this._v.y * 0.5 + 0.5) * this.hoehe - k * p.rise;
      const pop = k < 0.2 ? 1 + (0.2 - k) * 2.4 : 1;
      p.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${pop})`;
      p.el.style.opacity = String(1 - k * k);
    }

    return dt * this.timeScale;
  }

  /** Wird nach der Kamerabewegung aufgerufen. */
  applyToCamera() {
    this.camera.position.add(this.offset);
  }

  reset() {
    this.shakeAmount = 0;
    this.stop = 0;
    this.rings.forEach((r) => { r.life = 0; r.mesh.visible = false; });
    this.blockRuhig();
    this.pops.forEach((p) => { p.life = 0; p.el.style.opacity = '0'; });
  }
}
