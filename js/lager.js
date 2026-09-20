import * as props from './props.js';

/* ==========================================================================
 *  Das eigene Lager.
 *
 *  Bisher gehörte einem in dieser Welt nichts: man lief durch Dörfer, die
 *  schon standen, und durch Gruften, die schon gefüllt waren. Ein Lager ist
 *  das erste, was man selbst hinstellt — und der Grund, unterwegs an einem
 *  Baum stehen zu bleiben, statt nur vorbeizulaufen.
 *
 *  Hier steht nur, WAS man bauen kann und was es kostet. Wo es steht und wie
 *  es in die Szene kommt, macht main.js; gebaut werden die Teile aus
 *  denselben Modellen, aus denen auch die Dörfer bestehen.
 * ========================================================================== */

export const BAUTEILE = {
  feuer: {
    name: 'Lagerfeuer', sym: 'flamme',
    kosten: { holz: 6, stein: 3 },
    fest: 1.15,            // so nah kommt man nicht heran
    nah: 3.0,              // ab hier spricht einen der Knopf an
    rast: true, feuer: true,
    kurz: 'Rast und Licht',
    text: 'Heilt dich aus und bringt dich über die Nacht. Und man hört es.',
    bauer: () => props.feuerBauen(),
  },
  zelt: {
    name: 'Zelt', sym: 'lager',
    kosten: { holz: 12, stein: 2 },
    fest: 1.5,
    nah: 3.2,
    rast: true,
    kurz: 'Schlafen wie im Haus',
    text: 'Ein Dach über dem Kopf, wo keines steht. Darin schläft man bis zum Morgen.',
    bauer: () => props.zeltBauen(),
  },
  laterne: {
    name: 'Laterne', sym: 'kerze',
    kosten: { holz: 4, glimmstein: 2 },
    fest: 0.45,
    nah: 2.4,
    feuer: true,
    kurz: 'Licht im Dunkeln',
    text: 'Glimm hinter Glas. Sie zeigt von weitem, wo dein Lager liegt.',
    bauer: () => props.laterneBauen(),
  },
  zaun: {
    name: 'Zaun', sym: 'axt',
    kosten: { holz: 4 },
    fest: 0.75,
    nah: 2.2,
    kurz: 'Hält Getier auf',
    text: 'Vier Bretter. Nichts, was springen kann, hält er auf — der Rest bleibt draußen.',
    bauer: () => props.zaunBauen(4),
  },
  schleifstein: {
    name: 'Schleifstein', sym: 'schwert',
    kosten: { holz: 3, stein: 12 },
    fest: 0.7,
    nah: 2.6,
    esse: true,
    kurz: 'Schärfen ohne Dorf',
    text: 'Was die Schmiedin kann, kannst du hier auch — wenn du das Gold dabei hast.',
    bauer: () => props.schleifsteinBauen(),
  },
};

export const LISTE = Object.keys(BAUTEILE);

export const artVon = (id) => BAUTEILE[id] || null;

/** Steht im Beutel genug für dieses Teil? */
export function reicht(beutel, id) {
  const a = BAUTEILE[id];
  if (!a) return false;
  for (const [stoff, n] of Object.entries(a.kosten)) {
    if ((beutel[stoff] || 0) < n) return false;
  }
  return true;
}

/** Was beim Abreißen zurückkommt: die Hälfte, aber nie nichts. */
export function rueckgabe(id) {
  const a = BAUTEILE[id];
  if (!a) return {};
  const raus = {};
  for (const [stoff, n] of Object.entries(a.kosten)) raus[stoff] = Math.max(1, Math.floor(n / 2));
  return raus;
}

/* Zwei Teile dürfen sich nicht überlappen — und weil sie über ihren Platz
   benannt werden, dürfen sie auch nicht auf demselben Feld stehen. */
export const schluessel = (x, z) => `${Math.round(x)},${Math.round(z)}`;
