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
  ballon: {
    name: 'Heißluftballon', sym: 'ballon',
    kosten: { tuch: 3, seil: 4, holz: 12, eisen: 8, schwefel: 3 },
    fest: 0,               // man soll hineinsteigen, nicht dagegenlaufen
    nah: 3.4,
    fliegt: true,
    abbauHiebe: 7,         // das Teuerste reißt man nicht aus Versehen ab
    kurz: 'Steig ein und flieg',
    text: 'Drei Bahnen Segeltuch, ein Korb und ein Brenner. Von oben sieht das '
        + 'Land aus wie eine Karte, die noch niemand gezeichnet hat.',
    bauer: () => props.ballonBauen(),
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

/* ------------------------------ Am Werktisch -------------------------------
 * Das Zweite, was man aus Stoffen machen kann: nicht etwas, das draußen steht,
 * sondern etwas, das in den Beutel wandert. Halbzeug zuerst — Seil und Tuch
 * braucht man für fast alles andere —, dann Werkzeug und Rüstung.
 *
 * Absicht dahinter: jede Zeile soll aus einer anderen Richtung kommen. Holz
 * schlägt man oben, Eisen und Schwefel holt man aus der Tiefe, Fell und Wolle
 * bringt nur das Getier. Wer den Ballon will, muss überall gewesen sein.
 * -------------------------------------------------------------------------- */
export const WERKZEUG = {
  seil:        { gibt: 'seil',        kosten: { wolfsfell: 2 },
                 kurz: 'aus zwei Fellen gedreht' },
  tuch:        { gibt: 'tuch',        kosten: { wolle: 3 },
                 kurz: 'drei Ballen Wolle, dicht gewebt' },
  knueppel:    { gibt: 'knueppel',    kosten: { holz: 4 },
                 kurz: 'für den Anfang reicht ein Ast' },
  holzspeer:   { gibt: 'holzspeer',   kosten: { holz: 8, stein: 2 },
                 kurz: 'Abstand halten' },
  beil:        { gibt: 'beil',        kosten: { holz: 6, eisen: 3 },
                 kurz: 'die erste Schneide aus Eisen' },
  wams:        { gibt: 'wams',        kosten: { wolfsfell: 4, seil: 1 },
                 kurz: 'Fell auf dem Rücken' },
  kurzschwert: { gibt: 'kurzschwert', kosten: { holz: 3, eisen: 8 },
                 kurz: 'handlich und ehrlich' },
  hornpanzer:  { gibt: 'hornpanzer',  kosten: { hauer: 2, wolfsfell: 6, seil: 2 },
                 kurz: 'was der Keiler nicht mehr braucht' },
  jagdspiess:  { gibt: 'jagdspiess',  kosten: { holz: 4, eisen: 10, seil: 1 },
                 kurz: 'der Keiler kommt bis hierher' },
  kettenhemd:  { gibt: 'kettenhemd',  kosten: { eisen: 14, seil: 2 },
                 kurz: 'schwer, laut, sein Geld wert' },
};

export const WERKLISTE = Object.keys(WERKZEUG);

export const artVon = (id) => BAUTEILE[id] || null;

/** Steht im Beutel genug für diese Kosten? */
export function reichtFuer(beutel, kosten) {
  for (const [stoff, n] of Object.entries(kosten)) {
    if ((beutel[stoff] || 0) < n) return false;
  }
  return true;
}

/** Steht im Beutel genug für dieses Bauteil? */
export function reicht(beutel, id) {
  const a = BAUTEILE[id];
  return !!a && reichtFuer(beutel, a.kosten);
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
