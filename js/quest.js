import { mulberry32 } from './noise.js';

/* ==========================================================================
 *  Aufträge.
 *
 *  Jeder Auftrag ist ein kleiner Zustandsautomat: Ziel, Fortschritt, Lohn.
 *  Die Vorlagen sind bewusst wenige und klar — was ein Auftrag von einem
 *  Ortsschild unterscheidet, ist, dass er einen irgendwohin schickt.
 * ========================================================================== */

export const VORLAGEN = [
  {
    id: 'raeumen',
    titel: (o) => `Räumt ${o.ziel} aus`,
    text: (o) => `In ${o.ziel} hat sich Gesindel eingenistet. Macht es leer — alle davon.`,
    art: 'toeten', mengeMin: 3, mengeMax: 6,
    lohn: { gold: 90, xp: 120 },
  },
  {
    id: 'truhe',
    titel: (o) => `Das Erbstück in ${o.ziel}`,
    text: (o) => `Mein Großvater ließ etwas in ${o.ziel} zurück. Es liegt in einer Truhe. Bringt es mir.`,
    art: 'truhe', mengeMin: 1, mengeMax: 2,
    lohn: { gold: 140, xp: 160 },
  },
  {
    id: 'wolf',
    titel: () => 'Die Wölfe vor dem Dorf',
    text: () => 'Die Wölfe kommen bis an die Zäune. Es wäre uns eine Erleichterung, wenn sie das nicht mehr täten.',
    art: 'toeten', mengeMin: 4, mengeMax: 7, wo: 'draussen',
    lohn: { gold: 70, xp: 90 },
  },
  {
    id: 'glimm',
    titel: () => 'Glimm für die Schmiede',
    text: () => 'Die Esse ist kalt. In den Gruften sitzt Glimm im Fels — brecht uns welches heraus.',
    art: 'sammeln', mengeMin: 4, mengeMax: 8,
    lohn: { gold: 80, xp: 110 },
  },
  {
    id: 'bote',
    titel: (o) => `Nachricht nach ${o.ziel}`,
    text: (o) => `Bringt das hier nach ${o.ziel}. Fragt dort nach dem Brunnen, man kennt mich.`,
    art: 'gehen', mengeMin: 1, mengeMax: 1,
    lohn: { gold: 60, xp: 80 },
  },
];

let laufendeNr = 1;

/** Würfelt einen Auftrag für diesen Geber aus — immer denselben. */
export function auftragFuer(geberSaat, kontext) {
  const rand = mulberry32(geberSaat >>> 0);
  const v = VORLAGEN[Math.floor(rand() * VORLAGEN.length)];
  const menge = v.mengeMin + Math.floor(rand() * (v.mengeMax - v.mengeMin + 1));
  const ziel = v.art === 'gehen' ? kontext.nachbarort : kontext.dungeonName;
  const o = { ziel: ziel || 'der alten Gruft' };
  return {
    nr: laufendeNr++,
    vorlage: v.id,
    art: v.art,
    titel: v.titel(o),
    text: v.text(o),
    ziel: o.ziel,
    zielOrt: v.art === 'gehen' ? kontext.nachbarPos : kontext.dungeonPos,
    wo: v.wo || (v.art === 'toeten' || v.art === 'truhe' ? 'dungeon' : 'frei'),
    menge,
    stand: 0,
    fertig: false,
    abgegeben: false,
    lohn: { ...v.lohn },
  };
}

export class Auftragsbuch {
  constructor() { this.offen = []; this.erledigt = []; }

  hat(q) { return this.offen.some((x) => x.vorlage === q.vorlage && x.ziel === q.ziel); }

  annehmen(q) {
    if (this.offen.length >= 6 || this.hat(q)) return false;
    this.offen.push(q);
    return true;
  }

  /** Meldet ein Ereignis an alle passenden Aufträge. */
  melden(art, daten = {}) {
    const fertig = [];
    for (const q of this.offen) {
      if (q.fertig || q.art !== art) continue;
      if (art === 'toeten') {
        if (q.wo === 'dungeon' && !daten.imDungeon) continue;
        if (q.wo === 'draussen' && daten.imDungeon) continue;
      }
      if (art === 'gehen' && daten.ort !== q.ziel) continue;
      q.stand = Math.min(q.menge, q.stand + (daten.menge || 1));
      if (q.stand >= q.menge) { q.fertig = true; fertig.push(q); }
    }
    return fertig;
  }

  abgeben(q, held) {
    if (!q.fertig || q.abgegeben) return null;
    q.abgegeben = true;
    this.offen = this.offen.filter((x) => x !== q);
    this.erledigt.push(q);
    held.gold += q.lohn.gold;
    return q.lohn;
  }

  /** Der Auftrag, der gerade im HUD stehen sollte. */
  verfolgt() {
    return this.offen.find((q) => q.fertig) || this.offen[0] || null;
  }
}
