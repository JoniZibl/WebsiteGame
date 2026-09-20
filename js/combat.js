import * as THREE from 'three';
import { isSolid, HEIGHT } from './voxel.js';
import { flattenGroup } from './meshkit.js';

/* ==========================================================================
 *  Gegner und Kampf.
 *
 *  Vier Sorten, bewusst durchschaubar: sie merken dich auf Sichtweite, laufen
 *  dich an, schlagen im Takt zu und bleiben stehen, wenn sie dich verlieren.
 *  Was den Kampf trägt, ist nicht ihre Klugheit, sondern wo sie stehen —
 *  vier Skelette in einer engen Kammer sind etwas anderes als vier auf der Wiese.
 * ========================================================================== */

/* Beinamen für die Gezeichneten. Ein Wolf ist ein Wolf; der Narbige Wolf
   ist eine Geschichte, die man weitererzählt. */
const BEINAMEN = ['Der Narbige', 'Alt', 'Grimm', 'Einohr', 'Schwarz', 'Bleich',
  'Hinkend', 'Der Große', 'Rot', 'Stumm'];

const GRAVITY = 24;
const RADIUS = 0.34;

/* Drei Haltungen:
     friedlich  — greift nie an, läuft weg, wenn man zu nah kommt
     wehrhaft   — lässt dich in Ruhe, bis du zuschlägst; dann aber richtig
     wild       — kommt von allein
   `stufe` ist die eingebaute Gefahr des Wesens, unabhängig davon, wo es steht.
   Sie steht in der Zielleiste und warnt, bevor man drauf einschlägt. */
export const ARTEN = {
  /* ------------------------------ Friedliche ----------------------------- */
  hase: {
    name: 'Feldhase', fell: '#d8c7a8', dunkel: '#b09a78', augen: '#4a3b30',
    hp: 8, schaden: 0, tempo: 5.2, reichweite: 1, takt: 2, xp: 4, gold: 0,
    hoehe: 0.5, bau: 'vierbeiner', skala: 0.52, ohren: true,
    gesinnung: 'friedlich', stufe: 1, sicht: 12, beute: 'balg',
  },
  schaf: {
    name: 'Wollschaf', fell: '#f2e9d6', dunkel: '#cbbca0', augen: '#4a3b30',
    hp: 18, schaden: 0, tempo: 2.4, reichweite: 1, takt: 2, xp: 6, gold: 0,
    hoehe: 0.9, bau: 'vierbeiner', skala: 0.86, wollig: true,
    gesinnung: 'friedlich', stufe: 1, sicht: 10, beute: 'wolle',
  },
  reh: {
    name: 'Reh', fell: '#c08f5e', dunkel: '#8a6038', augen: '#3a2c22',
    hp: 22, schaden: 0, tempo: 4.8, reichweite: 1, takt: 2, xp: 10, gold: 0,
    hoehe: 1.0, bau: 'vierbeiner', skala: 0.95, hoch: true,
    gesinnung: 'friedlich', stufe: 1, sicht: 14, beute: 'balg',
  },
  ziege: {
    name: 'Bergziege', fell: '#e0d3bb', dunkel: '#a8956f', augen: '#4a3b30',
    hp: 24, schaden: 0, tempo: 3.4, reichweite: 1, takt: 2, xp: 9, gold: 0,
    hoehe: 0.9, bau: 'vierbeiner', skala: 0.8, hoerner: true,
    gesinnung: 'friedlich', stufe: 1, sicht: 12, beute: 'krummhorn',
  },
  falter: {
    name: 'Glühfalter', fell: '#f5c451', dunkel: '#e8a83c', augen: '#fff6e4',
    hp: 6, schaden: 0, tempo: 2.6, reichweite: 1, takt: 2, xp: 5, gold: 0,
    hoehe: 0.6, bau: 'schwebend', skala: 0.7, schwebt: true, leuchtet: true,
    gesinnung: 'friedlich', stufe: 1, sicht: 9, beute: 'falterstaub',
  },

  /* ------------------------------- Wehrhafte ----------------------------- */
  keiler: {
    name: 'Keiler', fell: '#7d6450', dunkel: '#54412f', augen: '#f5c451',
    hp: 44, schaden: 13, tempo: 4.6, reichweite: 1.3, takt: 1.3, xp: 34, gold: 0,
    hoehe: 0.9, bau: 'vierbeiner', skala: 0.95, hauer: true,
    gesinnung: 'wehrhaft', stufe: 2, sicht: 12, beute: 'hauer',
  },
  elch: {
    name: 'Elch', fell: '#8d6a4a', dunkel: '#5d4430', augen: '#f0e7d2',
    hp: 82, schaden: 17, tempo: 3.8, reichweite: 1.6, takt: 1.6, xp: 60, gold: 0,
    hoehe: 1.5, bau: 'vierbeiner', skala: 1.35, geweih: true, hoch: true,
    gesinnung: 'wehrhaft', stufe: 3, sicht: 13, beute: 'krummhorn',
  },
  steinruecken: {
    name: 'Steinrücken', fell: '#9a9384', dunkel: '#6d6659', augen: '#f5c451',
    hp: 150, schaden: 22, tempo: 1.9, reichweite: 1.6, takt: 2.1, xp: 110, gold: 0,
    hoehe: 1.2, bau: 'vierbeiner', skala: 1.45, panzer: true, wuchtig: true,
    gesinnung: 'wehrhaft', stufe: 4, sicht: 11, beute: 'felsschuppe',
  },

  /* --------------------------------- Wilde ------------------------------- */
  wolf: {
    name: 'Wolf', fell: '#a39488', dunkel: '#74675c', augen: '#f5c451',
    hp: 26, schaden: 9, tempo: 4.4, reichweite: 1.3, takt: 1.2, xp: 22, gold: 0,
    hoehe: 0.9, bau: 'vierbeiner', gesinnung: 'wild', stufe: 1, sicht: 16,
    beute: 'wolfsfell',
  },
  raeuber: {
    name: 'Räuber', fell: '#9d86b8', dunkel: '#6a5a86', augen: '#f6ead6',
    hp: 42, schaden: 10, tempo: 3.4, reichweite: 1.5, takt: 1.5, xp: 34, gold: 18,
    hoehe: 1.7, gesinnung: 'wild', stufe: 2, sicht: 14,
  },
  schuetze: {
    name: 'Wegelagerer', fell: '#8c7a5c', dunkel: '#5f5340', augen: '#f6ead6',
    hp: 38, schaden: 12, tempo: 3.2, reichweite: 1.4, takt: 1.9, xp: 42, gold: 22,
    hoehe: 1.7, gesinnung: 'wild', stufe: 2, sicht: 18,
    fern: 'pfeil', schussweite: 16, abstand: 7,
  },
  skelett: {
    name: 'Skelett', fell: '#f0e7d2', dunkel: '#c3b79c', augen: '#c9543f',
    hp: 34, schaden: 11, tempo: 2.9, reichweite: 1.5, takt: 1.7, xp: 30, gold: 12,
    hoehe: 1.7, gesinnung: 'wild', stufe: 2, sicht: 14, beute: 'knochen',
  },
  frostwolf: {
    name: 'Firnwolf', fell: '#cfe0ea', dunkel: '#93aec4', augen: '#9fd8e8',
    hp: 62, schaden: 16, tempo: 5.0, reichweite: 1.3, takt: 1.1, xp: 55, gold: 0,
    hoehe: 0.9, bau: 'vierbeiner', skala: 1.1,
    gesinnung: 'wild', stufe: 3, sicht: 19, beute: 'frostbalg',
  },
  irrlicht: {
    name: 'Irrlicht', fell: '#9fd8e8', dunkel: '#6aa8c4', augen: '#fdf6e8',
    hp: 34, schaden: 14, tempo: 4.2, reichweite: 1.6, takt: 1.3, xp: 45, gold: 0,
    hoehe: 0.8, bau: 'schwebend', skala: 0.95, schwebt: true, leuchtet: true,
    gesinnung: 'wild', stufe: 3, sicht: 17, beute: 'irrlichtkern',
    fern: 'funke', schussweite: 13, abstand: 5,
  },
  kriecher: {
    name: 'Dünenkriecher', fell: '#c9a05e', dunkel: '#96703a', augen: '#c9543f',
    hp: 58, schaden: 18, tempo: 3.6, reichweite: 1.5, takt: 1.4, xp: 58, gold: 0,
    hoehe: 0.8, bau: 'kriecher', skala: 1.0,
    gesinnung: 'wild', stufe: 3, sicht: 15, beute: 'giftstachel',
  },
  moorschrat: {
    name: 'Moorschrat', fell: '#6f7f55', dunkel: '#4a5a38', augen: '#c9f07a',
    hp: 105, schaden: 24, tempo: 2.7, reichweite: 1.8, takt: 1.8, xp: 105, gold: 25,
    hoehe: 2.2, skala: 1.12, gesinnung: 'wild', stufe: 4, sicht: 15, beute: 'moosherz',
  },
  nachtmahr: {
    name: 'Nachtmahr', fell: '#4b4560', dunkel: '#2f2b3f', augen: '#c9543f',
    hp: 125, schaden: 26, tempo: 4.4, reichweite: 1.7, takt: 1.3, xp: 125, gold: 40,
    hoehe: 1.9, gesinnung: 'wild', nurNachts: true, stufe: 4, sicht: 20, beute: 'nachtauge',
  },
  aschwyrm: {
    name: 'Aschwyrm', fell: '#b5503a', dunkel: '#7c3223', augen: '#f5c451',
    hp: 180, schaden: 30, tempo: 3.4, reichweite: 2.0, takt: 1.5, xp: 210, gold: 60,
    hoehe: 1.3, bau: 'wyrm', skala: 1.45, wuchtig: true,
    gesinnung: 'wild', stufe: 5, sicht: 18, beute: 'wyrmschuppe',
    fern: 'asche', schussweite: 15, abstand: 6,
  },
  firnriese: {
    name: 'Firnriese', fell: '#dfe9f0', dunkel: '#a9bccd', augen: '#9fd8e8',
    hp: 230, schaden: 34, tempo: 2.8, reichweite: 2.2, takt: 1.7, xp: 260, gold: 90,
    hoehe: 3.2, skala: 1.15, wuchtig: true,
    gesinnung: 'wild', nurNachts: true, stufe: 5, sicht: 18, beute: 'riesenzahn',
  },

  /* ------------------------- Was noch draussen lebt ----------------------- */
  dachs: {
    name: 'Dachs', fell: '#cfc6b4', dunkel: '#3f3a34', augen: '#3a2c22',
    hp: 30, schaden: 9, tempo: 3.6, reichweite: 1.2, takt: 1.3, xp: 20, gold: 0,
    hoehe: 0.7, bau: 'vierbeiner', skala: 0.66, streifen: true,
    gesinnung: 'wehrhaft', stufe: 1, sicht: 11, beute: 'balg',
  },
  luchs: {
    name: 'Luchs', fell: '#c9a87e', dunkel: '#8a6a44', augen: '#c9f07a',
    hp: 44, schaden: 13, tempo: 5.4, reichweite: 1.3, takt: 1.0, xp: 40, gold: 0,
    hoehe: 0.9, bau: 'vierbeiner', skala: 0.9, ohren: true, hoch: true,
    gesinnung: 'wild', stufe: 2, sicht: 18, beute: 'balg',
  },
  spinne: {
    name: 'Moorspinne', fell: '#4a4450', dunkel: '#2f2b38', augen: '#c9543f',
    hp: 40, schaden: 14, tempo: 4.4, reichweite: 1.3, takt: 1.1, xp: 44, gold: 0,
    hoehe: 0.8, bau: 'spinne', skala: 1.0,
    gesinnung: 'wild', stufe: 2, sicht: 15, beute: 'giftstachel',
  },
  geier: {
    name: 'Aasgeier', fell: '#6b6255', dunkel: '#433d35', augen: '#e8a83c',
    hp: 34, schaden: 12, tempo: 4.8, reichweite: 1.4, takt: 1.2, xp: 38, gold: 0,
    hoehe: 1.0, bau: 'vogel', skala: 1.0, schwebt: true,
    gesinnung: 'wild', stufe: 2, sicht: 20, beute: 'knochen',
  },
  unke: {
    name: 'Sumpfunke', fell: '#6f9a58', dunkel: '#46683a', augen: '#f5c451',
    hp: 52, schaden: 15, tempo: 2.6, reichweite: 1.4, takt: 1.6, xp: 46, gold: 0,
    hoehe: 0.9, bau: 'unke', skala: 1.1,
    gesinnung: 'wehrhaft', stufe: 2, sicht: 13, beute: 'giftstachel',
    fern: 'funke', schussweite: 12, abstand: 4,
  },
  ghul: {
    name: 'Gruftghul', fell: '#b7ae94', dunkel: '#7d745e', augen: '#c9f07a',
    hp: 70, schaden: 18, tempo: 3.8, reichweite: 1.5, takt: 1.3, xp: 62, gold: 14,
    hoehe: 1.8, skala: 1.05, gesinnung: 'wild', stufe: 3, sicht: 17, beute: 'knochen',
  },
  baer: {
    name: 'Waldbär', fell: '#7a5334', dunkel: '#4e3520', augen: '#f5c451',
    hp: 165, schaden: 26, tempo: 4.0, reichweite: 1.9, takt: 1.7, xp: 130, gold: 0,
    hoehe: 1.5, bau: 'vierbeiner', skala: 1.6, wuchtig: true,
    gesinnung: 'wehrhaft', stufe: 4, sicht: 15, beute: 'dickfell',
  },
  waldschrat: {
    name: 'Waldschrat', fell: '#5f7548', dunkel: '#3d4f30', augen: '#e8a83c',
    hp: 115, schaden: 25, tempo: 3.0, reichweite: 2.0, takt: 1.8, xp: 112, gold: 20,
    hoehe: 2.4, skala: 1.15, nurNachts: true,
    gesinnung: 'wild', stufe: 4, sicht: 16, beute: 'moosherz',
  },
  troll: {
    name: 'Steintroll', fell: '#8d8878', dunkel: '#5f5b50', augen: '#e8a83c',
    hp: 260, schaden: 36, tempo: 2.6, reichweite: 2.4, takt: 2.0, xp: 280, gold: 110,
    hoehe: 3.0, skala: 1.3, wuchtig: true,
    gesinnung: 'wild', stufe: 5, sicht: 17, beute: 'felsschuppe',
  },

  /* --------------------------------- Bosse ------------------------------- */
  waechter: {
    name: 'Der Wächter', fell: '#e8c46a', dunkel: '#b08a2f', augen: '#fff6e4',
    hp: 260, schaden: 22, tempo: 3.0, reichweite: 2.0, takt: 1.5, xp: 450, gold: 400,
    hoehe: 2.6, skala: 1.2, wuchtig: true, boss: true, gesinnung: 'wild', stufe: 5, sicht: 20,
  },
  hauptmann: {
    name: 'Hauptmann', fell: '#e0654b', dunkel: '#a8402f', augen: '#f5c451',
    hp: 110, schaden: 18, tempo: 3.2, reichweite: 1.8, takt: 1.6, xp: 120, gold: 90,
    hoehe: 2.0, boss: true, gesinnung: 'wild', stufe: 4, sicht: 17,
  },
};

/* ------------------------------- Die Modelle ------------------------------- */
function mat(color) { return new THREE.MeshLambertMaterial({ color, flatShading: true }); }
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

const FARBE_HELL = mat('#f0e7d2');
const FARBE_GELB = mat('#e8a83c');

function bauen(art) {
  const g = new THREE.Group();
  const fell = mat(art.fell), dunkel = mat(art.dunkel);
  const auge = new THREE.MeshBasicMaterial({ color: art.augen });
  const teil = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o;
  };
  const bau = art.bau || (art.vierbeiner ? 'vierbeiner' : 'mensch');

  if (bau === 'vierbeiner') {
    const hoch = art.hoch ? 0.22 : 0;          // Reh und Elch stehen auf längeren Beinen
    teil(box(0.62, 0.52, 1.18), fell, 0, 0.66 + hoch, 0);
    if (art.wollig) {                           // Schaf: eine zweite Lage Wolle
      teil(box(0.76, 0.6, 1.16), fell, 0, 0.74, -0.04);
      teil(box(0.46, 0.4, 0.42), dunkel, 0, 0.84, 0.74);
    } else {
      teil(box(0.5, 0.44, 0.5), dunkel, 0, 0.82 + hoch, 0.74);
    }
    if (art.panzer) {                           // Steinrücken: der Panzer ist das Tier
      teil(box(1.0, 0.46, 1.3), dunkel, 0, 1.0, -0.06);
      teil(box(0.3, 0.22, 0.3), dunkel, -0.3, 1.3, 0.2);
      teil(box(0.26, 0.2, 0.26), dunkel, 0.28, 1.28, -0.3);
    }
    if (art.ohren) {                            // Hase
      teil(box(0.12, 0.42, 0.1), fell, -0.12, 1.16, 0.62);
      teil(box(0.12, 0.42, 0.1), fell, 0.12, 1.16, 0.62);
    } else if (art.hoerner) {                   // Ziege
      teil(box(0.1, 0.26, 0.1), dunkel, -0.16, 1.14 + hoch, 0.6);
      teil(box(0.1, 0.26, 0.1), dunkel, 0.16, 1.14 + hoch, 0.6);
    } else if (art.geweih) {                    // Elch
      for (const sx of [-1, 1]) {
        teil(box(0.1, 0.44, 0.1), dunkel, sx * 0.2, 1.22 + hoch, 0.62);
        teil(box(0.42, 0.1, 0.1), dunkel, sx * 0.4, 1.42 + hoch, 0.62);
        teil(box(0.1, 0.24, 0.1), dunkel, sx * 0.58, 1.54 + hoch, 0.62);
      }
    } else {
      teil(box(0.16, 0.2, 0.1), dunkel, -0.16, 1.1 + hoch, 0.66);
      teil(box(0.16, 0.2, 0.1), dunkel, 0.16, 1.1 + hoch, 0.66);
    }
    if (art.hauer) {                            // Keiler
      teil(box(0.08, 0.18, 0.08), mat('#f0e7d2'), -0.18, 0.74 + hoch, 0.94);
      teil(box(0.08, 0.18, 0.08), mat('#f0e7d2'), 0.18, 0.74 + hoch, 0.94);
    }
    teil(box(0.1, 0.1, 0.05), auge, -0.12, 0.86 + hoch, 0.99);
    teil(box(0.1, 0.1, 0.05), auge, 0.12, 0.86 + hoch, 0.99);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      teil(box(0.18, 0.44 + hoch * 2, 0.18), dunkel, sx * 0.22, 0.22 + hoch * 0.5, sz * 0.4);
    }
    teil(box(0.14, 0.14, 0.5), fell, 0, 0.8 + hoch, -0.78);

    if (art.streifen) {                         // Dachs: heller Streifen über den Rücken
      teil(box(0.16, 0.1, 1.2), FARBE_HELL, 0, 0.94 + hoch, 0);
      teil(box(0.12, 0.1, 0.44), FARBE_HELL, 0, 1.02 + hoch, 0.72);
    }
    if (art.wuchtig) {                          // Schultern, die man von oben sieht
      teil(box(0.86, 0.4, 0.6), fell, 0, 0.94 + hoch, 0.18);
      teil(box(0.3, 0.3, 0.3), dunkel, -0.3, 1.02 + hoch, 0.34);
      teil(box(0.3, 0.3, 0.3), dunkel, 0.3, 1.02 + hoch, 0.34);
    }

  } else if (bau === 'spinne') {
    // Flacher Leib, dicker Hinterleib, acht Beine im Knick
    teil(box(0.62, 0.36, 0.6), fell, 0, 0.5, 0.2);
    teil(new THREE.IcosahedronGeometry(0.46, 0), fell, 0, 0.6, -0.5);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const z = 0.34 - i * 0.28;
        teil(box(0.5, 0.1, 0.1), dunkel, sx * 0.52, 0.58, z, [0, 0, sx * 0.5]);
        teil(box(0.1, 0.44, 0.1), dunkel, sx * 0.76, 0.3, z);
      }
      teil(box(0.1, 0.1, 0.05), auge, sx * 0.14, 0.6, 0.5);
      teil(box(0.07, 0.07, 0.05), auge, sx * 0.26, 0.56, 0.44);
    }

  } else if (bau === 'vogel') {
    // Aasgeier: gebeugter Hals, breite Schwingen
    teil(box(0.5, 0.46, 0.8), fell, 0, 1.0, 0);
    teil(box(0.22, 0.4, 0.22), dunkel, 0, 1.36, 0.28);
    teil(box(0.3, 0.26, 0.34), dunkel, 0, 1.56, 0.34);
    teil(box(0.14, 0.12, 0.3), FARBE_GELB, 0, 1.52, 0.56);
    teil(box(0.08, 0.08, 0.05), auge, -0.1, 1.6, 0.48);
    teil(box(0.08, 0.08, 0.05), auge, 0.1, 1.6, 0.48);
    for (const sx of [-1, 1]) {
      teil(box(1.1, 0.12, 0.62), fell, sx * 0.76, 1.06, -0.04, [0, 0, -sx * 0.18]);
      teil(box(0.5, 0.1, 0.4), dunkel, sx * 1.3, 1.16, -0.1, [0, 0, -sx * 0.3]);
      teil(box(0.1, 0.3, 0.1), FARBE_GELB, sx * 0.16, 0.72, 0.06);
    }
    teil(box(0.34, 0.12, 0.5), dunkel, 0, 1.0, -0.6);

  } else if (bau === 'unke') {
    // Breit und geduckt, mit Kehlsack
    teil(box(1.0, 0.44, 0.9), fell, 0, 0.52, 0);
    teil(box(0.7, 0.36, 0.44), fell, 0, 0.62, 0.56);
    teil(box(0.52, 0.28, 0.3), dunkel, 0, 0.44, 0.62);
    teil(box(0.14, 0.14, 0.1), auge, -0.2, 0.8, 0.5);
    teil(box(0.14, 0.14, 0.1), auge, 0.2, 0.8, 0.5);
    for (const sx of [-1, 1]) {
      teil(box(0.2, 0.2, 0.6), dunkel, sx * 0.5, 0.3, 0.3);
      teil(box(0.24, 0.5, 0.24), dunkel, sx * 0.54, 0.4, -0.3);
      teil(box(0.3, 0.16, 0.34), dunkel, sx * 0.54, 0.16, -0.5);
    }
    teil(box(0.5, 0.16, 0.5), FARBE_HELL, 0, 0.78, -0.1);

  } else if (bau === 'schwebend') {
    // Ein Licht mit Körper: Kern, Hülle, drei Funken hinterher
    teil(new THREE.IcosahedronGeometry(0.34, 0), fell, 0, 1.1, 0);
    teil(new THREE.IcosahedronGeometry(0.2, 0), auge, 0, 1.1, 0);
    teil(box(0.16, 0.16, 0.16), dunkel, 0, 1.34, -0.28);
    teil(box(0.12, 0.12, 0.12), dunkel, 0.14, 1.04, -0.42);
    teil(box(0.1, 0.1, 0.1), fell, -0.16, 1.2, -0.5);

  } else if (bau === 'kriecher') {
    // Flach am Boden, Scheren vorn, Stachel über dem Rücken
    teil(box(0.7, 0.3, 0.9), fell, 0, 0.36, 0);
    teil(box(0.44, 0.24, 0.34), dunkel, 0, 0.42, 0.56);
    teil(box(0.1, 0.1, 0.05), auge, -0.12, 0.48, 0.72);
    teil(box(0.1, 0.1, 0.05), auge, 0.12, 0.48, 0.72);
    for (const sx of [-1, 1]) {
      teil(box(0.22, 0.14, 0.3), dunkel, sx * 0.34, 0.36, 0.64);
      for (const sz of [-0.3, 0, 0.3]) teil(box(0.4, 0.1, 0.1), dunkel, sx * 0.48, 0.2, sz);
    }
    teil(box(0.22, 0.22, 0.28), fell, 0, 0.62, -0.48);
    teil(box(0.18, 0.18, 0.24), fell, 0, 0.86, -0.62);
    teil(box(0.12, 0.26, 0.12), dunkel, 0, 1.04, -0.66);

  } else if (bau === 'wyrm') {
    // Ein Leib aus Gliedern, der sich aus dem Boden hebt
    teil(box(0.54, 0.5, 0.56), dunkel, 0, 0.3, -0.9);
    teil(box(0.62, 0.62, 0.6), fell, 0, 0.52, -0.34);
    teil(box(0.68, 0.7, 0.62), fell, 0, 0.86, 0.2);
    teil(box(0.6, 0.56, 0.5), dunkel, 0, 1.18, 0.66);
    teil(box(0.5, 0.4, 0.44), fell, 0, 1.36, 1.0);
    teil(box(0.12, 0.12, 0.06), auge, -0.14, 1.42, 1.2);
    teil(box(0.12, 0.12, 0.06), auge, 0.14, 1.42, 1.2);
    for (const sx of [-1, 1]) {
      teil(box(0.1, 0.24, 0.1), dunkel, sx * 0.18, 1.6, 0.9);
      teil(box(0.12, 0.3, 0.12), dunkel, sx * 0.3, 0.98, 0.1);
    }

  } else {
    const gross = art.wuchtig ? 1.35 : art.hoehe > 2.2 ? 1.2 : 1;
    teil(box(0.58 * gross, 0.76, 0.36 * gross), fell, 0, art.hoehe * 0.55, 0);
    teil(box(0.46 * gross, 0.44, 0.42 * gross), art.boss ? fell : dunkel, 0, art.hoehe * 0.98, 0);
    teil(box(0.1, 0.1, 0.05), auge, -0.11 * gross, art.hoehe * 0.99, 0.22 * gross);
    teil(box(0.1, 0.1, 0.05), auge, 0.11 * gross, art.hoehe * 0.99, 0.22 * gross);
    teil(box(0.16, 0.56, 0.18), dunkel, -0.38 * gross, art.hoehe * 0.56, 0);
    teil(box(0.16, 0.56, 0.18), dunkel, 0.38 * gross, art.hoehe * 0.56, 0);
    teil(box(0.2, 0.5, 0.22), dunkel, -0.14 * gross, art.hoehe * 0.2, 0);
    teil(box(0.2, 0.5, 0.22), dunkel, 0.14 * gross, art.hoehe * 0.2, 0);
    // Klinge
    teil(box(0.1, 0.72, 0.1), mat('#b9aa98'), 0.44 * gross, art.hoehe * 0.62, 0.2);
    if (art.wuchtig) {
      // Schultern und Fäuste, damit ein Riese auch von oben ein Riese ist
      teil(box(0.9 * gross, 0.34, 0.5 * gross), fell, 0, art.hoehe * 0.86, 0);
      for (const sx of [-1, 1]) {
        teil(box(0.34, 0.34, 0.34), fell, sx * 0.5 * gross, art.hoehe * 0.82, 0);
        teil(box(0.3, 0.3, 0.3), dunkel, sx * 0.44 * gross, art.hoehe * 0.3, 0.06);
      }
    }
    if (art.boss) {
      teil(box(0.7, 0.14, 0.7), mat('#f5c451'), 0, art.hoehe * 1.24, 0);
      teil(box(0.16, 0.26, 0.16), mat('#f5c451'), 0, art.hoehe * 1.38, 0);
    }
  }
  return flattenGroup(g);
}

export class Feinde {
  constructor(scene, haken) {
    this.scene = scene;
    this.haken = haken;               // onTreffer, onTod
    this.liste = [];
    this.sterbende = [];       // Leiber, die gerade umkippen
    this.muster = {};
    for (const [id, art] of Object.entries(ARTEN)) this.muster[id] = bauen(art);
  }

  get anzahl() { return this.liste.length; }

  /* `gezeichnet` macht aus einem gewöhnlichen Wesen einen Anführer: mehr
     Leben, mehr Schlagkraft, größer — und einen Namen, der einem im Gedächtnis
     bleibt. Sie sind selten genug, dass man sie ernst nimmt. */
  spawn(id, x, y, z, stufe = 1, herkunft = null, gezeichnet = false) {
    const art = ARTEN[id];
    if (!art) return null;
    if (art.boss) gezeichnet = false;
    const obj = this.muster[id].clone();
    obj.position.set(x, y, z);
    obj.scale.setScalar((art.skala || 1) * (gezeichnet ? 1.3 : 1));
    this.scene.add(obj);
    const skalierung = (1 + (stufe - 1) * 0.22) * (gezeichnet ? 1.75 : 1);
    const f = {
      id, art, obj, herkunft,
      pos: new THREE.Vector3(x, y, z),
      vy: 0,
      hp: Math.round(art.hp * skalierung), hpMax: Math.round(art.hp * skalierung),
      schaden: Math.round(art.schaden * skalierung),
      wach: false, takt: 0, weh: 0, wank: Math.random() * 7,
      heimX: x, heimZ: z,
      gesinnung: art.gesinnung || 'wild',
      flucht: 0,                      // wie lange es noch wegläuft
      lahm: 0,                        // von einem Zauber festgehalten
      schreck: 0,                     // von einem Zauber in die Flucht geschlagen
      schweb: Math.random() * 6,
      gezeichnet,
      name: gezeichnet ? `${BEINAMEN[(Math.random() * BEINAMEN.length) | 0]} ${art.name}` : art.name,
      stossX: 0, stossZ: 0,           // Rückstoß nach einem Treffer
      holt: 0, holtVoll: 0, schlagBereit: false, fernSchlag: false, stoss: 0,
      // Die Gruppe dreht sich um Y, der Leib darin neigt sich — sonst kippte
      // ein Wesen je nach Blickrichtung zur Seite statt nach vorn.
      leib: obj.children[0],
    };
    this.liste.push(f);
    return f;
  }

  clear() {
    for (const f of this.liste) this.scene.remove(f.obj);
    for (const t of this.sterbende) this.scene.remove(t.obj);
    this.liste.length = 0;
    this.sterbende.length = 0;
  }

  entfernen(f) {
    this.scene.remove(f.obj);
    const i = this.liste.indexOf(f);
    if (i >= 0) this.liste.splice(i, 1);
  }

  /** Aus der Liste heraus, aber noch einen Moment im Bild — es fällt um. */
  kippen(f) {
    const i = this.liste.indexOf(f);
    if (i >= 0) this.liste.splice(i, 1);
    this.sterbende.push({
      obj: f.obj, leib: f.leib, zeit: 0.55, dauer: 0.55, y: f.pos.y,
      skala: (f.art.skala || 1) * (f.gezeichnet ? 1.3 : 1),
      kipp: Math.random() < 0.5 ? 1 : -1,
    });
  }

  /** Alles, was weiter weg ist als die Sichtgrenze, wird abgeräumt. */
  aufraeumen(px, pz, grenze = 120) {
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const f = this.liste[i];
      if (Math.hypot(f.pos.x - px, f.pos.z - pz) > grenze) this.entfernen(f);
    }
  }

  blockiert(world, x, y, z, hoehe) {
    for (const ox of [-RADIUS, RADIUS]) {
      for (const oz of [-RADIUS, RADIUS]) {
        for (let h = 0; h <= hoehe; h += 0.7) {
          if (isSolid(world.get(Math.floor(x + ox), Math.floor(y + h), Math.floor(z + oz)))) return true;
        }
      }
    }
    return false;
  }

  update(dt, world, spielerPos, spielerLebt) {
    for (let i = this.liste.length - 1; i >= 0; i--) {
      const f = this.liste[i];
      const art = f.art;
      const dx = spielerPos.x - f.pos.x;
      const dz = spielerPos.z - f.pos.z;
      const dy = Math.abs(spielerPos.y - f.pos.y);
      const dist = Math.hypot(dx, dz);

      const scheu = f.gesinnung === 'friedlich';
      // Wildes Getier kommt von allein. Wehrhaftes erst, wenn man es weckt —
      // das besorgt `schlagen`. Friedliches wird nie wach, es läuft nur weg.
      if (!f.wach && !scheu && f.gesinnung === 'wild'
          && spielerLebt && dist < art.sicht && dy < 7) f.wach = true;
      if (f.wach && (dist > art.sicht * 2.2 || dy > 14)) f.wach = false;
      if (f.flucht > 0) f.flucht -= dt;
      if (f.lahm > 0) f.lahm -= dt;
      if (f.schreck > 0) f.schreck -= dt;
      if (scheu && spielerLebt && dist < 8 && dy < 5) f.flucht = Math.max(f.flucht, 2.5);

      let zielX = 0, zielZ = 0;
      if ((scheu || f.schreck > 0) && f.flucht > 0 && dist > 0.001) {
        // Weg vom Spieler, so schnell die Beine tragen
        zielX = -dx / dist; zielZ = -dz / dist;
        f.obj.rotation.y = Math.atan2(zielX, zielZ);
      } else if (f.wach && spielerLebt) {
        if (art.fern && dist < art.abstand && dist > 0.001) {
          // Schützen suchen den Abstand, aus dem sie treffen und nicht getroffen werden
          zielX = -dx / dist; zielZ = -dz / dist;
        } else if (art.fern && dist < art.schussweite) {
          zielX = 0; zielZ = 0;                 // in Schussweite: stehen und zielen
        } else if (dist > art.reichweite * 0.8) {
          zielX = dx / dist; zielZ = dz / dist;
        }
        f.obj.rotation.y = Math.atan2(dx, dz);
      } else {
        // Ohne Ziel wandert er ein wenig um seinen Platz
        f.wank += dt * 0.6;
        const hx = f.heimX - f.pos.x, hz = f.heimZ - f.pos.z;
        const hd = Math.hypot(hx, hz);
        if (hd > 6) { zielX = hx / hd * 0.4; zielZ = hz / hd * 0.4; }
        else { zielX = Math.cos(f.wank) * 0.25; zielZ = Math.sin(f.wank * 0.7) * 0.25; }
        if (zielX || zielZ) f.obj.rotation.y = Math.atan2(zielX, zielZ);
      }

      const schritt = art.tempo * (f.flucht > 0 ? 1.25 : 1)
        * (f.lahm > 0 ? 0.42 : 1) * (f.gezeichnet ? 1.1 : 1) * dt;
      this.schieben(world, f, zielX * schritt, zielZ * schritt);

      // Ein Treffer wirft zurück — daran merkt man, dass er gesessen hat
      if (f.stossX || f.stossZ) {
        this.schieben(world, f, f.stossX * dt, f.stossZ * dt);
        const weg = Math.max(0, 1 - dt * 7);
        f.stossX *= weg; f.stossZ *= weg;
        if (Math.abs(f.stossX) + Math.abs(f.stossZ) < 0.05) { f.stossX = 0; f.stossZ = 0; }
      }

      if (art.schwebt) {
        // Irrlichter fallen nicht, sie suchen sich ihre Höhe über dem Boden
        f.schweb += dt * 1.6;
        const boden = this.bodenUnter(world, f.pos.x, f.pos.y + 2, f.pos.z);
        const will = boden + 1.5 + Math.sin(f.schweb) * 0.35;
        f.pos.y += (will - f.pos.y) * Math.min(1, dt * 2.6);
      } else {
        f.vy -= GRAVITY * dt;
        const ny = f.pos.y + f.vy * dt;
        if (this.blockiert(world, f.pos.x, ny, f.pos.z, art.hoehe)) {
          if (f.vy < 0) f.pos.y = Math.floor(f.pos.y) + (f.pos.y % 1 > 0.5 ? 1 : 0);
          f.vy = 0;
        } else if (ny > 0) {
          f.pos.y = ny;
        }
      }
      if (f.pos.y < 1) { this.entfernen(f); continue; }

      /* Angriffe kommen nicht mehr aus dem Nichts: erst wird ausgeholt, dann
         geschlagen. Wer in dem Moment wegrollt, bei dem es zuschnappt, ist
         weg — erst dadurch wird die Rolle ein Werkzeug statt einer Zierde. */
      f.takt -= dt;
      if (f.holt > 0) {
        f.holt -= dt;
        if (f.holt <= 0 && f.schlagBereit) {
          f.schlagBereit = false;
          f.stoss = 0.18;
          if (f.fernSchlag) {
            if (spielerLebt) this.haken.onSchuss?.(f, dx / (dist || 1), dz / (dist || 1));
          } else if (spielerLebt && dist < art.reichweite + 0.5 && dy < 2.4) {
            this.haken.onTreffer(f);
          }
        }
      } else if (f.wach && !scheu && f.schreck <= 0 && art.schaden > 0 && spielerLebt && f.takt <= 0) {
        const nah = dist < art.reichweite && dy < 2.2;
        const weit = art.fern && dist < art.schussweite && dist > 1.5 && dy < 5;
        if (nah || weit) {
          f.takt = art.takt;
          f.holt = art.vorlauf || (weit && !nah ? 0.5 : 0.36);
          f.holtVoll = f.holt;
          f.schlagBereit = true;
          f.fernSchlag = weit && !nah;
          this.haken.onAusholen?.(f, f.holt);
        }
      }
      if (f.stoss > 0) f.stoss -= dt;

      this.beleben(f, dt, Math.abs(zielX) + Math.abs(zielZ) > 0.05, dx, dz, dist);
    }

    // Was gefallen ist, kippt um und sinkt weg, statt einfach zu verschwinden
    for (let i = this.sterbende.length - 1; i >= 0; i--) {
      const t = this.sterbende[i];
      t.zeit -= dt;
      const k = Math.max(0, t.zeit / t.dauer);
      if (t.leib) t.leib.rotation.z = t.kipp * (1 - k) * 1.5;
      t.obj.position.y = t.y - (1 - k) * 0.35;
      t.obj.scale.setScalar(t.skala * (0.4 + k * 0.6));
      if (t.zeit <= 0) { this.scene.remove(t.obj); this.sterbende.splice(i, 1); }
    }
  }

  /* Bewegung, Ausholen, Treffer und Wucht — alles am ganzen Körper, weil die
     Modelle aus einem Stück sind. Vierbeiner galoppieren, Menschen wiegen sich,
     Spinnen trippeln, und was wuchtig ist, stapft schwer. */
  beleben(f, dt, bewegt, dx, dz, dist) {
    const art = f.art;
    const bau = art.bau || (art.vierbeiner ? 'vierbeiner' : 'mensch');
    const skala = (art.skala || 1) * (f.gezeichnet ? 1.3 : 1);
    const schwer = art.wuchtig ? 0.55 : 1;

    f.wank += dt * (bewegt ? (bau === 'spinne' || bau === 'kriecher' ? 16
      : bau === 'vierbeiner' ? 11 * schwer : 7 * schwer) : 1.6);

    const o = f.obj;
    o.position.copy(f.pos);
    let hoch = 0, neig = 0, roll = 0, breit = 1, lang = 1;

    if (bewegt) {
      const s = Math.sin(f.wank), c = Math.cos(f.wank * 0.5);
      if (bau === 'vierbeiner') {
        hoch = Math.abs(s) * 0.09 * (art.wuchtig ? 1.6 : 1);
        neig = -s * 0.07;
        lang = 1 + Math.abs(s) * 0.05;
      } else if (bau === 'spinne' || bau === 'kriecher') {
        hoch = Math.abs(s) * 0.05;
        roll = c * 0.1;
      } else if (bau === 'vogel' || art.schwebt) {
        hoch = Math.sin(f.wank * 0.8) * 0.16;
        roll = Math.sin(f.wank * 0.5) * 0.14;
      } else {
        hoch = Math.abs(s) * 0.07 * (art.wuchtig ? 1.5 : 1);
        roll = s * 0.06;
        breit = 1 + Math.abs(s) * 0.03;
      }
    } else if (art.schwebt || bau === 'vogel') {
      hoch = Math.sin(f.wank) * 0.12;
    } else {
      // Atem im Stand: kaum sichtbar, aber ohne wirkt alles wie eingefroren
      lang = 1 + Math.sin(f.wank) * 0.012;
    }

    // Ausholen: zurücklehnen und größer werden, dann nach vorn schnellen
    if (f.holt > 0) {
      const k = 1 - f.holt / (f.holtVoll || 1);
      neig -= 0.34 * Math.sin(k * Math.PI * 0.8);
      breit *= 1 + k * 0.12;
      lang *= 1 + k * 0.1;
    } else if (f.stoss > 0 && dist > 0.01) {
      const k = f.stoss / 0.18;
      o.position.x += (dx / dist) * k * 0.45;
      o.position.z += (dz / dist) * k * 0.45;
      neig += 0.3 * k;
    }

    if (f.weh > 0) {
      f.weh -= dt;
      o.position.x += Math.sin(f.weh * 70) * 0.05;
      const q = f.weh / 0.22;
      breit *= 1 + q * 0.18;
      lang *= 1 - q * 0.16;
    }

    o.position.y += hoch;
    o.scale.setScalar(skala);
    const leib = f.leib;
    if (leib) {
      leib.rotation.x = neig;
      leib.rotation.z = roll;
      leib.scale.set(breit, lang, breit);
    }
  }

  schieben(world, f, dx, dz) {
    const h = f.art.hoehe;
    if (!this.blockiert(world, f.pos.x + dx, f.pos.y, f.pos.z, h)) f.pos.x += dx;
    else if (!this.blockiert(world, f.pos.x + dx, f.pos.y + 1, f.pos.z, h)) { f.pos.x += dx; f.pos.y += 1.02; }
    if (!this.blockiert(world, f.pos.x, f.pos.y, f.pos.z + dz, h)) f.pos.z += dz;
    else if (!this.blockiert(world, f.pos.x, f.pos.y + 1, f.pos.z + dz, h)) { f.pos.z += dz; f.pos.y += 1.02; }
  }

  /** Der oberste feste Block unter einem Punkt — für alles, was schwebt. */
  bodenUnter(world, x, y, z) {
    const bx = Math.floor(x), bz = Math.floor(z);
    for (let h = Math.floor(y); h > 0; h--) {
      if (isSolid(world.get(bx, h, bz))) return h + 1;
    }
    return 1;
  }

  /** Steht etwas in der Nähe, das einem wirklich an den Kragen will? */
  bedrohung(pos, r = 14) {
    for (const f of this.liste) {
      if (f.gesinnung === 'friedlich' || !f.wach || f.art.schaden <= 0) continue;
      if (Math.hypot(f.pos.x - pos.x, f.pos.z - pos.z) < r) return f;
    }
    return null;
  }

  /** Das nächste Ziel vor dem Spieler — für Anzeige und Zuschlagen. */
  ziel(pos, blick, reichweite = 2.6) {
    let best = null, bestWert = Infinity;
    for (const f of this.liste) {
      const dx = f.pos.x - pos.x, dz = f.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reichweite || Math.abs(f.pos.y - pos.y) > 2.4) continue;
      // Was hinter einem steht, zählt weniger als was vor einem steht
      const winkel = Math.abs(((Math.atan2(dx, dz) - blick + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const wert = d + winkel * 1.6;
      if (wert < bestWert) { bestWert = wert; best = f; }
    }
    return best;
  }

  /** Was ein Zauber auf einem Wesen liegen lässt: 'lahm' hält fest, 'schreck' jagt fort. */
  belegen(f, was, zeit) {
    if (was === 'lahm') f.lahm = Math.max(f.lahm || 0, zeit);
    if (was === 'schreck') {
      f.schreck = Math.max(f.schreck || 0, zeit);
      f.flucht = Math.max(f.flucht, zeit);
      f.schlagBereit = false;
      f.holt = 0;
    }
  }

  /** Zuschlagen mit Wucht: `stoss` ist die Richtung, aus der es kam. */
  schlagen(f, schaden, stoss = null) {
    f.hp -= schaden;
    f.weh = 0.22;
    if (stoss) {
      const wucht = (f.gezeichnet ? 3.5 : 7) / (1 + (f.art.hoehe || 1) * 0.3);
      f.stossX = stoss.x * wucht;
      f.stossZ = stoss.z * wucht;
    }
    // Wehrhaftes wird jetzt erst wütend, Friedliches rennt um sein Leben
    if (f.gesinnung === 'friedlich') f.flucht = 7;
    else f.wach = true;
    if (f.hp <= 0) {
      this.kippen(f);
      this.haken.onTod(f);
      return true;
    }
    return false;
  }
}
