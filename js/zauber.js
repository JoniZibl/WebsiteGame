/* ==========================================================================
 *  Die Zauber.
 *
 *  Magie war lange ein Knopf, der einmal ringsum wehtat. Jetzt ist sie ein
 *  kleines Regal: zehn Sprüche, vier Güten, und jeder tut etwas anderes —
 *  einer schleudert, einer heilt, einer jagt die Meute auseinander. Gelernt
 *  wird aus Büchern, die in Truhen liegen; was man kann, bleibt im Beutel
 *  nicht liegen, sondern im Kopf.
 *
 *  `wirkung` sagt, was main.js damit anstellt:
 *    welle    — alles ringsum trifft es
 *    geschoss — ein Ding fliegt los
 *    strahl   — ein Kegel nach vorn
 *    kette    — springt von Wesen zu Wesen
 *    regen    — ein Fächer Geschosse
 *    heilen   — zurück auf die Beine
 *    schutz   — hält eine Weile die Hiebe ab
 *    bann     — treibt sie fort
 * ========================================================================== */

export const ZAUBER = {
  funkenschlag: {
    name: 'Funkenschlag', sym: 'funke', guete: 'gemein', kosten: 16, braucht: 1,
    wirkung: 'welle', kraft: 1.0, weite: 7, farbe: '#8fb8cf',
    kurz: 'Trifft alles ringsum',
    text: 'Den kann jeder. Ein Schlag Licht nach allen Seiten, mehr nicht.',
  },
  steinsplitter: {
    name: 'Steinsplitter', sym: 'splitter', guete: 'gemein', kosten: 12, braucht: 1,
    wirkung: 'geschoss', geschoss: 'stein', kraft: 1.2, farbe: '#b9aa98',
    kurz: 'Ein Splitter geradeaus',
    text: 'Billig, spitz und erstaunlich oft genug.',
  },

  eislanze: {
    name: 'Eislanze', sym: 'eis', guete: 'selten', kosten: 22, braucht: 2,
    wirkung: 'geschoss', geschoss: 'funke', kraft: 1.8, lahm: 3.5, farbe: '#9fd8e8',
    kurz: 'Durchbohrt und macht lahm',
    text: 'Was sie trifft, kommt eine Weile nicht mehr richtig vom Fleck.',
  },
  flammenhauch: {
    name: 'Flammenhauch', sym: 'flamme', guete: 'selten', kosten: 24, braucht: 2,
    wirkung: 'strahl', kraft: 1.3, weite: 9, breite: 0.85, farbe: '#e0654b',
    kurz: 'Ein Kegel Feuer nach vorn',
    text: 'Nach vorn heraus, breit genug für drei. Im Rücken hilft er nichts.',
  },
  balsam: {
    name: 'Balsam', sym: 'balsam', guete: 'selten', kosten: 26, braucht: 2,
    wirkung: 'heilen', kraft: 2.2, farbe: '#7fae5e',
    kurz: 'Schließt Wunden',
    text: 'Riecht nach Wiese. Wirkt schneller als jeder Trank und kostet kein Gold.',
  },

  steinhaut: {
    name: 'Steinhaut', sym: 'steinhaut', guete: 'episch', kosten: 30, braucht: 4,
    wirkung: 'schutz', dauer: 12, farbe: '#9aa3ab',
    kurz: 'Hält zwölf Atemzüge lang die Hälfte ab',
    text: 'Die Haut wird grau und schwer. Man steht damit, wo man sonst fiele.',
  },
  schreckensruf: {
    name: 'Schreckensruf', sym: 'ruf', guete: 'episch', kosten: 26, braucht: 4,
    wirkung: 'bann', weite: 11, dauer: 6, farbe: '#e8a83c',
    kurz: 'Jagt die Meute auseinander',
    text: 'Kein Schaden, keine Wunde — sie laufen einfach weg. Manchmal ist das mehr wert.',
  },
  blitzkette: {
    name: 'Blitzkette', sym: 'blitz', guete: 'episch', kosten: 34, braucht: 4,
    wirkung: 'kette', kraft: 1.5, weite: 9, spruenge: 4, farbe: '#f5e07a',
    kurz: 'Springt von Wesen zu Wesen',
    text: 'Sie sucht sich den Weg allein und wird mit jedem Sprung ein wenig müder.',
  },

  himmelssturm: {
    name: 'Himmelssturm', sym: 'sturm', guete: 'sagenhaft', kosten: 50, braucht: 6,
    wirkung: 'welle', kraft: 2.8, weite: 13, stoss: true, farbe: '#cfe6f2',
    kurz: 'Wirft alles um, weit hinaus',
    text: 'Einmal Luft holen, und das halbe Tal liegt flach.',
  },
  ascheregen: {
    name: 'Ascheregen', sym: 'asche', guete: 'sagenhaft', kosten: 44, braucht: 6,
    wirkung: 'regen', geschoss: 'asche', kraft: 1.1, zahl: 7, farbe: '#e0654b',
    kurz: 'Ein Fächer glühender Brocken',
    text: 'Aus dem Roten Grund. Wer ihn zuerst gewirkt hat, steht dort noch.',
  },
};

export const ZAUBER_IDS = Object.keys(ZAUBER);

/** Der eine, den man von Anfang an kann. */
export const ANFANGSZAUBER = 'funkenschlag';

/** Kann der Held das überhaupt sprechen? */
export function reichtDieUebung(held, id) {
  const z = ZAUBER[id];
  return !!z && (held.fert.magie || 1) >= (z.braucht || 1);
}

/** Welche Zauber er kennt — immer mit dem Anfangszauber vorneweg. */
export function gelernte(held) {
  // Eine Kopie — sonst schriebe das Nachschlagen dem Helden den Anfangszauber
  // in sein Gedächtnis, und das gehört ihm allein.
  const hat = new Set(held.zauber || []);
  hat.add(ANFANGSZAUBER);
  return ZAUBER_IDS.filter((id) => hat.has(id));
}
