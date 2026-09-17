import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { doerferUm, surfaceAt, biomeAt } from './voxel.js';
import * as props from './props.js';
import { FARBEN } from './props.js';

/* ==========================================================================
 *  Dörfer aufbauen.
 *
 *  Wo ein Dorf steht, sagt voxel.js — was darin steht, rechnet diese Datei
 *  aus denselben Koordinaten aus. Die Bauteile werden einmal gebaut und danach
 *  nur geklont, und nur Dörfer in Reichweite hängen wirklich in der Szene.
 * ========================================================================== */

/* Jede Gegend deckt anders: im Birkenhain rote Ziegel, in der Taiga
   Schindeln, in der Heide Ocker, im Bruch alles etwas vergraut. */
const DAECHER = {
  warm:   ['#c9553f', '#d98a4a', '#b8474f', '#d9694a'],
  taiga:  ['#4f6b63', '#3f5a57', '#6b7a5e', '#54604f'],
  trocken:['#c9913f', '#d9a94a', '#b5794a', '#a8743f'],
  bruch:  ['#7a7a5e', '#6b6a4f', '#8a7a5a', '#5e6350'],
};
const DACH_ZU_GEGEND = {
  taiga: 'taiga', wald: 'warm', birken: 'warm', wiese: 'warm', bluete: 'warm',
  heide: 'trocken', steppe: 'trocken', sumpf: 'bruch',
};

/* Drei Größen. Ein Weiler ist ein halbes Dutzend Katen an einem Brunnen, ein
   Marktflecken hat einen Platz mit Ständen und zwei Händlerinnen. */
const ARTEN = {
  weiler:       { haeuser: [5, 7],   haendler: 1, staende: 0, tor: false, name: 'Weiler' },
  dorf:         { haeuser: [9, 13],  haendler: 1, staende: 0, tor: false, name: 'Dorf' },
  marktflecken: { haeuser: [14, 18], haendler: 2, staende: 3, tor: true,  name: 'Marktflecken' },
};

/** Welche Sorte Dorf steht hier? Immer dieselbe für dieselben Koordinaten. */
export function dorfArt(dorf) {
  const rand = mulberry32((dorf.saat ^ 0x9e3779b9) >>> 0);
  const w = rand();
  return w < 0.34 ? 'weiler' : w < 0.82 ? 'dorf' : 'marktflecken';
}

/* Häuser dürfen sich nicht überlappen — seit man hineingehen kann, würde man
   sonst in der Wand des Nachbarn stecken bleiben. Also wird jeder Platz
   geprüft und notfalls verworfen. */
function passt(belegt, x, z, r) {
  for (const b of belegt) {
    if (Math.hypot(b.x - x, b.z - z) < b.r + r) return false;
  }
  return true;
}

/** Der Bauplan eines Dorfs: immer derselbe für dieselben Koordinaten. */
export function bauplan(dorf) {
  const rand = mulberry32(dorf.saat >>> 0);
  const teile = [];
  const leute = [];
  const belegt = [];

  const artId = dorfArt(dorf);
  const art = ARTEN[artId];
  const gegend = biomeAt(dorf.x, dorf.z);
  const farben = DAECHER[DACH_ZU_GEGEND[gegend.id] || 'warm'];
  // Straßendorf oder Ringdorf — zwei ganz verschiedene Gassen
  const strasse = artId !== 'weiler' && rand() < 0.45;

  teile.push({ art: 'brunnen', x: dorf.x, z: dorf.z, dreh: 0 });
  belegt.push({ x: dorf.x, z: dorf.z, r: 3.2 });

  const anzahl = art.haeuser[0] + Math.floor(rand() * (art.haeuser[1] - art.haeuser[0] + 1));
  const achse = rand() * Math.PI * 2;      // Richtung der Straße

  // Je größer das Dorf, desto weiter der Ring — sonst stehen sich die Häuser
  // gegenseitig im Weg und die Hälfte fällt weg.
  const eng = artId === 'weiler' ? [0.28, 0.58]
    : artId === 'dorf' ? [0.36, 0.78] : [0.46, 0.96];

  let gesetzt = 0;
  for (let i = 0; i < anzahl; i++) {
    const breite = 4.4 + rand() * 1.6;
    const tiefe = 3.8 + rand() * 1.2;
    const r = Math.hypot(breite, tiefe) / 2 + 1.1;

    // Mehrere Anläufe für denselben Platz, bevor ein Haus ausfällt
    let platz = null;
    for (let versuch = 0; versuch < 5 && !platz; versuch++) {
      let x, z, blickX, blickZ;
      if (strasse) {
        const seite = i % 2 ? 1 : -1;
        const weit = (Math.floor(i / 2) - anzahl / 4) * (8.5 + rand() * 1.5);
        const ab = 6.5 + rand() * 1.8 + versuch * 1.6;
        x = Math.round(dorf.x + Math.cos(achse) * weit + Math.cos(achse + Math.PI / 2) * ab * seite);
        z = Math.round(dorf.z + Math.sin(achse) * weit + Math.sin(achse + Math.PI / 2) * ab * seite);
        blickX = -Math.cos(achse + Math.PI / 2) * seite;
        blickZ = -Math.sin(achse + Math.PI / 2) * seite;
      } else {
        const winkel = (i / anzahl) * Math.PI * 2 + (rand() - 0.5) * 0.3;
        const radius = dorf.r * (eng[0] + rand() * (eng[1] - eng[0]));
        x = Math.round(dorf.x + Math.cos(winkel) * radius);
        z = Math.round(dorf.z + Math.sin(winkel) * radius);
        blickX = -Math.cos(winkel);
        blickZ = -Math.sin(winkel);
      }
      if (passt(belegt, x, z, r)) platz = { x, z, blickX, blickZ };
    }
    if (!platz) continue;
    const { x, z, blickX, blickZ } = platz;
    belegt.push({ x, z, r });

    // `dreh` dreht die lokale +z-Achse (die Türseite) in die Blickrichtung
    const dreh = Math.atan2(blickX, blickZ);
    const handel = gesetzt < art.haendler;
    teile.push({
      art: 'haus', x, z, dreh, breite, tiefe,
      hoehe: 2.6 + rand() * 0.6,
      dach: farben[Math.floor(rand() * farben.length)],
      innen: handel ? 'laden' : 'kammer',
    });
    leute.push({
      x: x + blickX * 3.2, z: z + blickZ * 3.2,
      saat: (rand() * 1e9) | 0, heimX: x, heimZ: z,
      handel,
    });
    gesetzt++;
  }

  // Marktstände auf dem Platz
  for (let i = 0; i < art.staende; i++) {
    const winkel = achse + Math.PI / 2 + (i - 1) * 1.15;
    const x = Math.round(dorf.x + Math.cos(winkel) * 8.5);
    const z = Math.round(dorf.z + Math.sin(winkel) * 8.5);
    if (!passt(belegt, x, z, 2.2)) continue;
    belegt.push({ x, z, r: 2.2 });
    teile.push({ art: 'stand', x, z, dreh: -winkel + Math.PI / 2 });
  }

  // Ein Tor dort, wo die Straße hinausführt
  if (art.tor) {
    for (const s of [1, -1]) {
      const x = Math.round(dorf.x + Math.cos(achse) * dorf.r * 1.02 * s);
      const z = Math.round(dorf.z + Math.sin(achse) * dorf.r * 1.02 * s);
      if (!passt(belegt, x, z, 2.5)) continue;
      belegt.push({ x, z, r: 2.5 });
      teile.push({ art: 'dorftor', x, z, dreh: -achse });
    }
  }

  // Laternen an den Wegen
  const laternen = artId === 'weiler' ? 2 : 4;
  for (let i = 0; i < laternen; i++) {
    const winkel = achse + (i / laternen) * Math.PI * 2;
    const x = Math.round(dorf.x + Math.cos(winkel) * 6.5);
    const z = Math.round(dorf.z + Math.sin(winkel) * 6.5);
    if (!passt(belegt, x, z, 1.2)) continue;
    belegt.push({ x, z, r: 1.2 });
    teile.push({ art: 'laterne', x, z, dreh: 0 });
  }

  // Zäune, Bäume und Büsche füllen die Lücken — aber nie in einem Haus
  const gruen = artId === 'weiler' ? 26 : 46;
  for (let i = 0; i < gruen; i++) {
    const winkel = rand() * Math.PI * 2;
    const radius = dorf.r * (0.22 + rand() * 0.72);
    const x = Math.round(dorf.x + Math.cos(winkel) * radius);
    const z = Math.round(dorf.z + Math.sin(winkel) * radius);
    if (!passt(belegt, x, z, 1.0)) continue;
    const w = rand();
    teile.push({
      art: w < 0.3 ? 'zaun' : w < 0.62 ? 'tanne' : w < 0.85 ? 'busch' : 'laubbaum',
      x, z, dreh: rand() * Math.PI * 2,
    });
  }

  return { teile, leute, artId, art };
}

export class Doerfer {
  constructor(scene) {
    this.scene = scene;
    this.heimatKey = null;         // im Heimatdorf wohnt der Chronist
    this.aktiv = new Map();        // "i,j" -> { gruppe, dorf, plan }
    this.muster = {
      brunnen: props.brunnenBauen(),
      laterne: props.laterneBauen(),
      tanne: props.tanneBauen({ hoehe: 5 }),
      laubbaum: props.laubbaumBauen({ hoehe: 4.2 }),
      busch: props.buschBauen(),
      zaun: props.zaunBauen(4),
      kiste: props.kisteBauen(),
      stand: props.standBauen(),
      dorftor: props.torBauen(),
      fels: props.felsBauen(),
      tor: props.torBauen(),
    };
    this.haeuser = new Map();      // Häuser haben Maße, also je Form ein Muster
    this.offenesHaus = null;      // dessen Dach gerade abgenommen ist
  }

  hausMuster(t) {
    const key = `${t.breite.toFixed(1)}|${t.tiefe.toFixed(1)}|${t.hoehe.toFixed(1)}`
      + `|${t.dach}|${t.innen || 'kammer'}`;
    if (!this.haeuser.has(key)) {
      this.haeuser.set(key, props.hausBauen({
        breite: t.breite, tiefe: t.tiefe, hoehe: t.hoehe, dachFarbe: t.dach,
        innen: t.innen,
      }));
    }
    return this.haeuser.get(key);
  }

  /** Hängt Dörfer in Reichweite ein und alte wieder aus. */
  update(px, pz) {
    const nah = doerferUm(px, pz, 150);
    const gewollt = new Set();

    for (const dorf of nah) {
      const key = `${dorf.i},${dorf.j}`;
      gewollt.add(key);
      if (this.aktiv.has(key)) continue;

      const plan = bauplan(dorf);
      // Der Chronist wohnt nur an einem einzigen Ort auf der Welt
      if (key === this.heimatKey && plan.leute[1]) plan.leute[1].chronist = true;
      const gruppe = new THREE.Group();
      for (const t of plan.teile) {
        const muster = t.art === 'haus' ? this.hausMuster(t) : this.muster[t.art];
        if (!muster) continue;
        const obj = muster.clone();
        obj.position.set(t.x + 0.5, surfaceAt(t.x, t.z) + 1, t.z + 0.5);
        obj.rotation.y = t.dreh;
        if (t.art === 'haus') {
          t.obj = obj;
          t.dach = obj.getObjectByName('dach');
          t.oben = obj.getObjectByName('oben');
          t.bodenY = surfaceAt(t.x, t.z) + 1;
        }
        gruppe.add(obj);
      }
      this.scene.add(gruppe);
      this.aktiv.set(key, { gruppe, dorf, plan });
    }

    for (const [key, eintrag] of [...this.aktiv]) {
      if (gewollt.has(key)) continue;
      this.scene.remove(eintrag.gruppe);
      this.aktiv.delete(key);
    }
  }

  /* --------------------------- Häuser sind hohl ---------------------------
   * Fest sind jetzt die Wände, nicht der Grundriss — sonst käme man nie
   * hinein. Die Front hat eine Lücke, und wer darin steht, steht in der Tür.
   * ------------------------------------------------------------------------ */
  /* In das Koordinatensystem eines Hauses drehen. Achtung: three.js dreht
     die lokale +z-Achse auf (sin, cos) — solange das Haus ein Rechteck war,
     verzieh es einen Vorzeichenfehler, mit einer Tür in der Front nicht mehr. */
  static lokal(t, x, z) {
    const dx = x - (t.x + 0.5), dz = z - (t.z + 0.5);
    const c = Math.cos(t.dreh), s = Math.sin(t.dreh);
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  }

  /** Zurück in die Welt drehen. */
  static welt(t, lx, lz) {
    const c = Math.cos(t.dreh), s = Math.sin(t.dreh);
    return { x: t.x + 0.5 + (lx * c + lz * s), z: t.z + 0.5 + (-lx * s + lz * c) };
  }

  /** Die fünf Wandstücke eines Hauses, in seinen eigenen Koordinaten. */
  static waende(t) {
    if (t.waende) return t.waende;
    const w = props.WAND / 2;
    const hw = t.breite / 2, ht = t.tiefe / 2;
    const tuerHalb = Math.min(props.TUER, t.breite * 0.36) / 2;
    const seite = (hw - tuerHalb) / 2;
    t.waende = [
      { x: 0, z: -ht + w, hw, ht: w },                       // hinten
      { x: -hw + w, z: 0, hw: w, ht },                       // links
      { x: hw - w, z: 0, hw: w, ht },                        // rechts
      { x: -(hw - seite), z: ht - w, hw: seite, ht: w },     // Front links
      { x: hw - seite, z: ht - w, hw: seite, ht: w },        // Front rechts
    ];
    return t.waende;
  }

  /** Schiebt einen Punkt aus der nächsten Hauswand heraus. */
  wegSchieben(x, z, rand = 0.34) {
    for (const { plan } of this.aktiv.values()) {
      for (const t of plan.teile) {
        if (t.art !== 'haus') continue;
        if (Math.abs(x - t.x) > 9 || Math.abs(z - t.z) > 9) continue;
        const l = Doerfer.lokal(t, x, z);
        for (const w of Doerfer.waende(t)) {
          const dx = l.x - w.x, dz = l.z - w.z;
          const hw = w.hw + rand, ht = w.ht + rand;
          if (Math.abs(dx) >= hw || Math.abs(dz) >= ht) continue;
          // Auf der kürzesten Seite hinaus, einen Hauch über die Kante
          const raus = hw - Math.abs(dx) < ht - Math.abs(dz)
            ? { x: w.x + Math.sign(dx || 1) * (hw + 0.03), z: l.z }
            : { x: l.x, z: w.z + Math.sign(dz || 1) * (ht + 0.03) };
          return Doerfer.welt(t, raus.x, raus.z);
        }
      }
    }
    return null;
  }

  /* In welchem Haus steht dieser Punkt? Gerechnet wird gegen den äußeren
     Grundriss: in einer Wand kann man nicht stehen, also heißt „drin“ hier
     entweder im Raum oder in der Tür — und das Haus öffnet sich schon beim
     Eintreten statt erst einen Schritt später. */
  hausUnter(x, z) {
    for (const { plan, dorf } of this.aktiv.values()) {
      for (const t of plan.teile) {
        if (t.art !== 'haus') continue;
        if (Math.abs(x - t.x) > 9 || Math.abs(z - t.z) > 9) continue;
        const l = Doerfer.lokal(t, x, z);
        if (Math.abs(l.x) < t.breite / 2 && Math.abs(l.z) < t.tiefe / 2) return { t, dorf };
      }
    }
    return null;
  }

  /* Wer eintritt, dem werden Dach und Wände abgenommen. Stehen bleibt die
     kniehohe Brüstung — sie zeichnet den Raum nach, ohne den Blick zu nehmen. */
  daecherPflegen(x, z) {
    const drin = this.hausUnter(x, z);
    const neu = drin ? drin.t : null;
    if (neu === this.offenesHaus) return drin;
    this.hausZeigen(this.offenesHaus, true);
    this.offenesHaus = neu;
    this.hausZeigen(neu, false);
    return drin;
  }

  hausZeigen(t, sichtbar) {
    if (!t) return;
    if (t.dach) t.dach.visible = sichtbar;
    if (t.oben) t.oben.visible = sichtbar;
  }

  /** Wo im Haus die Bettstelle liegt — in Weltkoordinaten. */
  bettVon(t) {
    const hw = t.breite / 2, ht = t.tiefe / 2;
    const p = Doerfer.welt(t, -hw + 0.85, -ht + 1.3);
    return { x: p.x, z: p.z, y: (t.bodenY || 0) + 1 };
  }

  /** Das Dorf, in dem der Spieler gerade steht — für HUD und Quests. */
  dorfUnter(x, z) {
    for (const { dorf } of this.aktiv.values()) {
      if (Math.hypot(x - dorf.x, z - dorf.z) < dorf.r) return dorf;
    }
    return null;
  }

  alleLeute() {
    const out = [];
    for (const { dorf, plan } of this.aktiv.values()) {
      for (const l of plan.leute) out.push({ ...l, dorf });
    }
    return out;
  }

  clear() {
    for (const { gruppe } of this.aktiv.values()) this.scene.remove(gruppe);
    this.aktiv.clear();
    this.offenesHaus = null;
  }
}
