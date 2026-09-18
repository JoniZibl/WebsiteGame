/* ==========================================================================
 *  Wer wo lebt.
 *
 *  Jede Gegend hat ihr eigenes Getier, und zwar in drei Haltungen: friedlich
 *  (läuft weg), wehrhaft (lässt dich in Ruhe, solange du es in Ruhe lässt) und
 *  wild (kommt von allein). Dazu eine Gefahrenzahl je Gegend — sie entscheidet,
 *  wie stark das ist, was dort steht. Die Wiese trägt Hasen, der Rote Grund
 *  trägt Aschwyrme, und dazwischen liegt alles, was man sich erarbeiten muss.
 *
 *  Wichtig fürs Gefühl: die gefährlichen Gegenden sind nicht weiter weg,
 *  sondern einfach anders. Man kann als Anfänger in ein Firnfeld laufen —
 *  man sollte nur nicht.
 * ========================================================================== */

/** 1 = harmlos, 5 = da hat man am Anfang nichts verloren. */
export const GEFAHR = {
  wiese: 1, bluete: 1, birken: 1,
  wald: 2, heide: 2, steppe: 2,
  taiga: 3, berg: 3, wueste: 3,
  sumpf: 4, schnee: 4,
  mesa: 5,
};

export const GEFAHRWORT = ['', 'ruhig', 'rau', 'wild', 'böse', 'tödlich'];

/* Gewichte, keine Wahrscheinlichkeiten: 4 kommt doppelt so oft wie 2. */
export const BEWOHNER = {
  wiese:   { tag: [['hase', 4], ['schaf', 3], ['dachs', 1.5], ['keiler', 1], ['wolf', 1.5]],
             nacht: [['wolf', 3], ['raeuber', 2], ['skelett', 1], ['nachtmahr', 0.4]] },
  bluete:  { tag: [['hase', 4], ['reh', 2], ['schaf', 2], ['dachs', 1]],
             nacht: [['falter', 4], ['irrlicht', 2], ['wolf', 1], ['spinne', 1]] },
  birken:  { tag: [['reh', 3], ['hase', 2], ['elch', 1], ['luchs', 1.5], ['baer', 0.8]],
             nacht: [['wolf', 3], ['luchs', 1.5], ['waldschrat', 1], ['nachtmahr', 0.5]] },
  wald:    { tag: [['reh', 3], ['keiler', 2], ['wolf', 2], ['luchs', 2], ['baer', 1],
                   ['schuetze', 1], ['dachs', 1]],
             nacht: [['wolf', 4], ['spinne', 2], ['waldschrat', 1.2], ['raeuber', 2],
                     ['schuetze', 1], ['nachtmahr', 0.6]] },
  heide:   { tag: [['schaf', 3], ['keiler', 2], ['wolf', 1], ['dachs', 1], ['schuetze', 1.5]],
             nacht: [['wolf', 3], ['raeuber', 2], ['schuetze', 1.5], ['skelett', 1]] },
  steppe:  { tag: [['hase', 2], ['raeuber', 3], ['schuetze', 2], ['wolf', 2], ['geier', 1.5]],
             nacht: [['raeuber', 3], ['schuetze', 2], ['skelett', 2], ['geier', 1], ['nachtmahr', 0.5]] },
  taiga:   { tag: [['wolf', 3], ['elch', 2], ['reh', 1], ['luchs', 2], ['baer', 1.2]],
             nacht: [['frostwolf', 3], ['elch', 1], ['luchs', 1.5], ['waldschrat', 0.8],
                     ['nachtmahr', 0.6]] },
  berg:    { tag: [['ziege', 3], ['steinruecken', 1.5], ['wolf', 1], ['troll', 1],
                   ['geier', 1]],
             nacht: [['frostwolf', 2], ['steinruecken', 1.5], ['troll', 1.4],
                     ['nachtmahr', 0.5]] },
  wueste:  { tag: [['kriecher', 3], ['ziege', 1], ['geier', 2]],
             nacht: [['kriecher', 3], ['skelett', 2], ['ghul', 1.5], ['nachtmahr', 0.8]] },
  schnee:  { tag: [['frostwolf', 3], ['ziege', 1], ['troll', 0.8]],
             nacht: [['frostwolf', 3], ['firnriese', 1.2], ['troll', 1]] },
  sumpf:   { tag: [['moorschrat', 2], ['irrlicht', 1.5], ['keiler', 1], ['unke', 2.5],
                   ['spinne', 2]],
             nacht: [['irrlicht', 3], ['moorschrat', 2.5], ['spinne', 2.5], ['unke', 1.5],
                     ['nachtmahr', 0.8]] },
  mesa:    { tag: [['kriecher', 2], ['skelett', 2], ['aschwyrm', 1.2], ['geier', 1.5],
                   ['ghul', 1.5]],
             nacht: [['skelett', 3], ['aschwyrm', 2], ['ghul', 2], ['nachtmahr', 1]] },
};

/** Zieht ein Wesen für diese Gegend und Tageszeit. */
export function wesenWaehlen(biomId, nacht, rand = Math.random) {
  const b = BEWOHNER[biomId] || BEWOHNER.wiese;
  const topf = (nacht ? b.nacht : b.tag) || b.tag;
  let summe = 0;
  for (const [, g] of topf) summe += g;
  let w = rand() * summe;
  for (const [id, g] of topf) { w -= g; if (w <= 0) return id; }
  return topf[0][0];
}

export const gefahrVon = (biomId) => GEFAHR[biomId] || 1;
