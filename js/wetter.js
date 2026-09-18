import * as THREE from 'three';

/* ==========================================================================
 *  Wetter.
 *
 *  Eine Welt ohne Wetter sieht immer gleich aus, egal wie viele Gegenden sie
 *  hat. Hier zieht es durch: Regen über den Wiesen, Schnee im Firnfeld, Nebel
 *  über dem Bruch, Sand über der Düne.
 *
 *  Es gibt genau eine Laune, die langsam auf und ab wandert. Welche Gegend man
 *  gerade durchquert, entscheidet, was diese Laune dort bedeutet — dieselbe
 *  Trübsal ist über dem Firnfeld Schnee und über dem Wald Regen. Läuft man
 *  hinüber, wechselt es weich.
 * ========================================================================== */

const ZAHL = 520;              // so viele Teilchen fallen gleichzeitig
const KASTEN = { x: 46, y: 26, z: 46 };   // in diesem Kasten um den Spieler

export const WETTER = {
  klar:   { name: 'klar',       nebel: 1.0,  dunkel: 0.0,  teilchen: 0,    ton: 0 },
  wolkig: { name: 'bedeckt',    nebel: 0.94, dunkel: 0.06, teilchen: 0,    ton: 0.1,
            himmel: '#cfc9b8' },
  nebel:  { name: 'Nebel',      nebel: 0.66, dunkel: 0.1,  teilchen: 0.3,  ton: 0.15,
            farbe: '#e8e4d8', himmel: '#d8d4c6', fall: 0.5, breit: 0.5, wind: 0.2 },
  regen:  { name: 'Regen',      nebel: 0.8,  dunkel: 0.16, teilchen: 1.0,  ton: 0.6,
            farbe: '#bcd2de', himmel: '#9fb6c4', fall: 26, breit: 0.035, lang: 0.85, wind: 0.5 },
  schnee: { name: 'Schneefall', nebel: 0.74, dunkel: 0.06, teilchen: 0.8,  ton: 0.18,
            farbe: '#ffffff', himmel: '#dfe7ee', fall: 3.4, breit: 0.13, lang: 0.13, wind: 1.1 },
  sand:   { name: 'Sandwind',   nebel: 0.68, dunkel: 0.1,  teilchen: 0.9,  ton: 0.5,
            farbe: '#eddcb0', himmel: '#e0c88f', fall: 1.4, breit: 0.09, lang: 0.09, wind: 3.4 },
};

/* Was eine Laune (0..1) in welcher Gegend bedeutet. Die Schwellen sind so
   gesetzt, dass es meistens einfach schön ist — Wetter soll auffallen. */
const GEGENDEN = {
  schnee:  [[0.52, 'schnee'], [0.34, 'nebel'], [0.2, 'wolkig']],
  taiga:   [[0.66, 'schnee'], [0.46, 'nebel'], [0.28, 'wolkig']],
  berg:    [[0.7, 'schnee'], [0.52, 'nebel'], [0.3, 'wolkig']],
  sumpf:   [[0.72, 'regen'], [0.34, 'nebel'], [0.2, 'wolkig']],
  wueste:  [[0.68, 'sand'], [0.42, 'wolkig']],
  mesa:    [[0.62, 'sand'], [0.4, 'wolkig']],
  wald:    [[0.66, 'regen'], [0.5, 'nebel'], [0.3, 'wolkig']],
  birken:  [[0.68, 'regen'], [0.52, 'nebel'], [0.32, 'wolkig']],
  wiese:   [[0.7, 'regen'], [0.56, 'nebel'], [0.34, 'wolkig']],
  bluete:  [[0.74, 'regen'], [0.58, 'nebel'], [0.36, 'wolkig']],
  heide:   [[0.7, 'regen'], [0.5, 'wolkig']],
  steppe:  [[0.74, 'regen'], [0.52, 'wolkig']],
};

export class Wetter {
  constructor(scene) {
    this.scene = scene;
    this.laune = 0.25;
    this.ziel = 0.25;
    this.wechsel = 40;
    this.art = 'klar';
    this.staerke = 0;        // 0..1, wächst und schwindet beim Wechsel
    this.zeit = 0;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, ZAHL);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
    scene.add(this.mesh);

    // Startpunkte im Kasten, jedes Teilchen mit eigenem Tempo
    this.punkte = [];
    for (let i = 0; i < ZAHL; i++) {
      this.punkte.push({
        x: (Math.random() - 0.5) * KASTEN.x,
        y: Math.random() * KASTEN.y,
        z: (Math.random() - 0.5) * KASTEN.z,
        eigen: 0.7 + Math.random() * 0.6,
        dreh: Math.random() * Math.PI,
      });
    }
    this.dummy = new THREE.Object3D();
  }

  get kind() { return WETTER[this.art]; }

  /** Wie stark das Wetter gerade wirkt — für Nebel, Licht und Ton. */
  get wirkung() { return this.staerke; }

  /** Nebelweiten werden damit multipliziert. */
  nebelFaktor() {
    return 1 + (this.kind.nebel - 1) * this.staerke;
  }

  dunkelheit() { return this.kind.dunkel * this.staerke; }

  /** Der Name fürs Anzeigen, oder null, wenn nichts los ist. */
  anzeige() {
    return this.art === 'klar' || this.staerke < 0.25 ? null : this.kind.name;
  }

  /** Wählt neu, was die Laune in dieser Gegend bedeutet. */
  artFuer(biomId) {
    const stufen = GEGENDEN[biomId] || GEGENDEN.wiese;
    for (const [schwelle, art] of stufen) {
      if (this.laune >= schwelle) return art;
    }
    return 'klar';
  }

  update(dt, biomId, pos, drinnen = false) {
    this.zeit += dt;

    // Die Laune wandert langsam auf ein neues Ziel zu
    this.wechsel -= dt;
    if (this.wechsel <= 0) {
      this.wechsel = 70 + Math.random() * 130;
      this.ziel = Math.random();
    }
    this.laune += (this.ziel - this.laune) * Math.min(1, dt * 0.05);

    const will = this.artFuer(biomId);
    if (will !== this.art) {
      // Erst ausklingen lassen, dann umschalten — sonst springt es hart um
      this.staerke -= dt * 0.5;
      if (this.staerke <= 0) { this.staerke = 0; this.art = will; }
    } else {
      const soll = this.art === 'klar' ? 0 : 1;
      this.staerke += (soll - this.staerke) * Math.min(1, dt * 0.35);
    }

    const k = this.kind;
    const sichtbar = !drinnen && k.teilchen > 0 && this.staerke > 0.04;
    this.mesh.visible = sichtbar;
    if (!sichtbar) return;

    this.mat.color.set(k.farbe);
    this.mat.opacity = (this.art === 'nebel' ? 0.16 : 0.62) * this.staerke;

    const zahl = Math.round(ZAHL * k.teilchen);
    const wind = k.wind * (0.6 + Math.sin(this.zeit * 0.3) * 0.4);
    for (let i = 0; i < ZAHL; i++) {
      const t = this.punkte[i];
      if (i >= zahl) { this.dummy.scale.setScalar(0); }
      else {
        t.y -= k.fall * t.eigen * dt;
        t.x += wind * dt;
        t.z += Math.sin(this.zeit * 0.7 + i) * k.wind * 0.25 * dt;
        // Oben wieder hineinschieben, wenn es unten hinausfällt
        if (t.y < -KASTEN.y * 0.3) { t.y = KASTEN.y * 0.7; t.x = (Math.random() - 0.5) * KASTEN.x; }
        if (t.x > KASTEN.x / 2) t.x -= KASTEN.x;
        if (t.x < -KASTEN.x / 2) t.x += KASTEN.x;
        if (t.z > KASTEN.z / 2) t.z -= KASTEN.z;
        if (t.z < -KASTEN.z / 2) t.z += KASTEN.z;
        this.dummy.scale.set(k.breit, k.lang || k.breit, k.breit);
      }
      this.dummy.position.set(pos.x + t.x, pos.y + t.y, pos.z + t.z);
      this.dummy.rotation.set(0, t.dreh, this.art === 'regen' ? -0.12 : 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
