import * as THREE from 'three';
import { flattenGroup } from './meshkit.js';

/* ==========================================================================
 *  Die Bauteile der Welt.
 *
 *  Das Gelände bleibt aus Blöcken — alles, was darauf steht, ist ein richtiges
 *  kleines Modell: Satteldächer, Kegeltannen, Zäune. Ohne die schrägen Flächen
 *  sieht es nie nach Spielzeugdorf aus, sondern immer nach Klötzchen.
 *
 *  Jedes Bauteil wird einmal gebaut, zu einem Mesh verschmolzen und danach nur
 *  noch geklont — sonst frisst ein Dorf hundert Zeichenaufrufe.
 * ========================================================================== */

export const FARBEN = {
  putz:     '#f4e6cc',
  putzWarm: '#e9d3ae',
  balken:   '#b5794a',
  balkenTief: '#9a6138',
  dach:     '#c9553f',
  dachTief: '#a8402f',
  dachAlt:  '#d98a4a',
  tuer:     '#8a5230',
  fenster:  '#7fb0bd',
  stein:    '#b9aa98',
  steinTief:'#9a8b79',
  tanne:    '#3f7a4f',
  tanneHell:'#4f9159',
  laub:     '#6aa35a',
  stamm:    '#8a5a38',
  rot:      '#c9543f',
  gold:     '#f5c451',
  dunkel:   '#4a3b30',
};

const mats = new Map();
function mat(color, basic = false) {
  const key = color + (basic ? '!' : '');
  if (!mats.has(key)) {
    mats.set(key, basic
      ? new THREE.MeshBasicMaterial({ color })
      : new THREE.MeshLambertMaterial({ color, flatShading: true }));
  }
  return mats.get(key);
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

function add(group, geo, color, x, y, z, rot) {
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

/* ------------------------------- Satteldach -------------------------------
 * Zwei geneigte Platten, die sich am First treffen, plus zwei Giebeldreiecke.
 * Die Neigung ist der halbe Grund, warum das Ganze nach Modell aussieht.
 * -------------------------------------------------------------------------- */
function satteldach(group, breite, tiefe, hoehe, y, farbe, kante) {
  const halb = breite / 2;
  const schraege = Math.hypot(halb + 0.3, hoehe);
  const winkel = Math.atan2(hoehe, halb + 0.3);
  const dicke = 0.22;

  for (const s of [-1, 1]) {
    const platte = add(group, box(schraege, dicke, tiefe + 0.7), farbe,
      s * (halb + 0.3) / 2, y + hoehe / 2, 0, [0, 0, -s * winkel]);
    platte.updateMatrix();
  }

  // Giebel: eine Dreiecksscheibe an jeder Stirnseite
  const giebel = new THREE.BufferGeometry();
  giebel.setAttribute('position', new THREE.Float32BufferAttribute([
    -halb, 0, 0, halb, 0, 0, 0, hoehe, 0,
  ], 3));
  giebel.computeVertexNormals();
  for (const s of [-1, 1]) {
    const g = new THREE.Mesh(giebel, mat(kante));
    g.position.set(0, y, s * (tiefe / 2 + 0.01));
    if (s < 0) g.rotation.y = Math.PI;
    g.castShadow = true;
    group.add(g);
  }
}

/* --------------------------------- Haus ----------------------------------- */
export function hausBauen({ breite = 5, tiefe = 4, hoehe = 3, dachFarbe = FARBEN.dach } = {}) {
  const g = new THREE.Group();

  // Sockel aus Stein, damit das Haus nicht im Gras schwimmt
  add(g, box(breite + 0.5, 0.4, tiefe + 0.5), FARBEN.stein, 0, 0.2, 0);

  // Wände
  add(g, box(breite, hoehe, tiefe), FARBEN.putz, 0, 0.4 + hoehe / 2, 0);

  // Eckbalken — die geben dem Putz erst Halt fürs Auge
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(g, box(0.34, hoehe, 0.34), FARBEN.balken,
        sx * (breite / 2 - 0.1), 0.4 + hoehe / 2, sz * (tiefe / 2 - 0.1));
    }
  }
  // Querbalken unter dem Dach
  add(g, box(breite + 0.2, 0.28, tiefe + 0.2), FARBEN.balken, 0, 0.4 + hoehe - 0.12, 0);

  satteldach(g, breite + 0.6, tiefe, hoehe * 0.62, 0.4 + hoehe, dachFarbe, FARBEN.putzWarm);

  // Tür mit Rahmen und Stufe
  add(g, box(1.24, 1.9, 0.18), FARBEN.balken, 0, 1.35, tiefe / 2 + 0.02);
  add(g, box(0.92, 1.62, 0.16), FARBEN.tuer, 0, 1.21, tiefe / 2 + 0.08);
  add(g, box(1.5, 0.22, 0.5), FARBEN.stein, 0, 0.45, tiefe / 2 + 0.3);

  // Fenster links und rechts der Tür
  for (const sx of [-1, 1]) {
    const x = sx * (breite / 2 - 1.05);
    add(g, box(0.86, 0.86, 0.14), FARBEN.balken, x, 2.15, tiefe / 2 + 0.02);
    add(g, box(0.62, 0.62, 0.12), FARBEN.fenster, x, 2.15, tiefe / 2 + 0.07);
  }
  // und eines an der Rückseite
  add(g, box(0.86, 0.86, 0.14), FARBEN.balken, 0, 2.15, -tiefe / 2 - 0.02);
  add(g, box(0.62, 0.62, 0.12), FARBEN.fenster, 0, 2.15, -tiefe / 2 - 0.07);

  return flattenGroup(g);
}

/* -------------------------------- Kegeltanne ------------------------------- */
export function tanneBauen({ hoehe = 5, stufen = 3 } = {}) {
  const g = new THREE.Group();
  add(g, box(0.42, 1.1, 0.42), FARBEN.stamm, 0, 0.55, 0);

  for (let i = 0; i < stufen; i++) {
    const t = i / stufen;
    const r = 1.55 * (1 - t * 0.55);
    const h = hoehe / stufen * 1.05;
    const kegel = new THREE.ConeGeometry(r, h, 7, 1);
    const m = new THREE.Mesh(kegel, mat(i % 2 ? FARBEN.tanneHell : FARBEN.tanne));
    m.position.y = 0.9 + i * (hoehe / stufen) * 0.72 + h / 2;
    m.rotation.y = i * 0.5;
    m.castShadow = true;
    g.add(m);
  }
  return flattenGroup(g);
}

/* -------------------------------- Laubbaum --------------------------------- */
export function laubbaumBauen({ hoehe = 4 } = {}) {
  const g = new THREE.Group();
  add(g, box(0.46, hoehe * 0.55, 0.46), FARBEN.stamm, 0, hoehe * 0.28, 0);
  const krone = new THREE.IcosahedronGeometry(1.5, 0);
  for (const [dx, dy, dz, s] of [[0, 0, 0, 1], [0.8, -0.35, 0.3, 0.68], [-0.7, -0.2, -0.4, 0.62]]) {
    const m = new THREE.Mesh(krone, mat(dx ? FARBEN.tanneHell : FARBEN.laub));
    m.position.set(dx, hoehe * 0.62 + dy, dz);
    m.scale.setScalar(s);
    m.castShadow = true;
    g.add(m);
  }
  return flattenGroup(g);
}

/* --------------------------------- Busch ----------------------------------- */
export function buschBauen() {
  const g = new THREE.Group();
  const k = new THREE.IcosahedronGeometry(0.62, 0);
  for (const [dx, dy, dz, s] of [[0, 0, 0, 1], [0.5, -0.12, 0.2, 0.7], [-0.42, -0.1, -0.24, 0.6]]) {
    const m = new THREE.Mesh(k, mat(FARBEN.laub));
    m.position.set(dx, 0.45 + dy, dz);
    m.scale.setScalar(s);
    m.castShadow = true;
    g.add(m);
  }
  return flattenGroup(g);
}

/* ---------------------------------- Zaun ----------------------------------- */
export function zaunBauen(laenge = 4) {
  const g = new THREE.Group();
  const felder = Math.max(1, Math.round(laenge / 2));
  for (let i = 0; i <= felder; i++) {
    add(g, box(0.22, 1.15, 0.22), FARBEN.balken, -laenge / 2 + i * (laenge / felder), 0.58, 0);
  }
  for (const y of [0.45, 0.88]) add(g, box(laenge, 0.16, 0.14), FARBEN.balkenTief, 0, y, 0);
  return flattenGroup(g);
}

/* -------------------------------- Laterne ---------------------------------- */
export function laterneBauen() {
  const g = new THREE.Group();
  add(g, box(0.3, 0.3, 0.3), FARBEN.stein, 0, 0.15, 0);
  add(g, box(0.22, 1.7, 0.22), FARBEN.rot, 0, 1.05, 0);
  add(g, box(0.5, 0.5, 0.5), FARBEN.rot, 0, 2.05, 0);
  const licht = new THREE.Mesh(box(0.34, 0.36, 0.34), mat(FARBEN.gold, true));
  licht.position.y = 2.05;
  g.add(licht);
  add(g, box(0.6, 0.16, 0.6), FARBEN.dunkel, 0, 2.34, 0);
  return flattenGroup(g);
}

/* -------------------------------- Brunnen ---------------------------------- */
export function brunnenBauen() {
  const g = new THREE.Group();
  const ring = new THREE.CylinderGeometry(1.25, 1.35, 0.9, 8);
  const m = new THREE.Mesh(ring, mat(FARBEN.stein));
  m.position.y = 0.45; m.castShadow = true; g.add(m);
  const wasser = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.06, 8), mat('#6cb8b4'));
  wasser.position.y = 0.88; g.add(wasser);
  for (const sx of [-1, 1]) add(g, box(0.22, 2.1, 0.22), FARBEN.balken, sx * 1.0, 1.5, 0);
  satteldach(g, 2.9, 1.6, 0.9, 2.5, FARBEN.dachAlt, FARBEN.balkenTief);
  return flattenGroup(g);
}

/* ------------------------------ Dungeon-Tor -------------------------------- */
export function torBauen() {
  const g = new THREE.Group();
  add(g, box(4.2, 0.6, 2.6), FARBEN.steinTief, 0, 0.3, 0);
  for (const sx of [-1, 1]) add(g, box(1.0, 3.2, 1.2), FARBEN.stein, sx * 1.55, 1.6, 0);
  add(g, box(4.2, 0.9, 1.4), FARBEN.stein, 0, 3.55, 0);
  // Der schwarze Schlund dazwischen
  const schlund = new THREE.Mesh(box(2.1, 3.0, 0.3), mat('#221a24', true));
  schlund.position.set(0, 1.9, 0.5);
  g.add(schlund);
  return flattenGroup(g);
}

/* --------------------------------- Kiste ----------------------------------- */
export function kisteBauen() {
  const g = new THREE.Group();
  add(g, box(1.1, 0.7, 0.8), FARBEN.balken, 0, 0.35, 0);
  add(g, box(1.16, 0.26, 0.86), FARBEN.balkenTief, 0, 0.78, 0);
  add(g, box(0.2, 0.26, 0.9), FARBEN.gold, 0, 0.72, 0);
  return flattenGroup(g);
}

/* --------------------------------- Felsen ---------------------------------- */
export function felsBauen() {
  const g = new THREE.Group();
  const k = new THREE.DodecahedronGeometry(0.9, 0);
  for (const [dx, dy, dz, s] of [[0, 0, 0, 1], [0.7, -0.3, 0.3, 0.6]]) {
    const m = new THREE.Mesh(k, mat(dx ? FARBEN.steinTief : FARBEN.stein));
    m.position.set(dx, 0.45 + dy, dz);
    m.scale.set(s, s * 0.75, s);
    m.rotation.set(dx, dz, 0.3);
    m.castShadow = true;
    g.add(m);
  }
  return flattenGroup(g);
}
