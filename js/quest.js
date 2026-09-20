import { mulberry32 } from './noise.js';

/* ==========================================================================
 *  Aufträge.
 *
 *  Jeder Auftrag ist ein kleiner Zustandsautomat: Ziel, Fortschritt, Lohn.
 *  Die Vorlagen sind bewusst wenige und klar — was ein Auftrag von einem
 *  Ortsschild unterscheidet, ist, dass er einen irgendwohin schickt.
 * ========================================================================== */

/* Wer was verlangt. Ein Jäger schickt einen auf die Jagd, die Wache zum
   Räuberlager, die Schmiedin will Stoff für die Esse, die Kräuterfrau kennt
   die Schreine. Dadurch klingt ein Auftrag nach der Person, die ihn gibt —
   und nicht nach einer Tabelle. */
export const VORLAGEN = [
  /* ------------------------- Die Welt draußen ---------------------------- */
  {
    id: 'lager', ortArt: 'lager', art: 'ort',
    berufe: ['Wache', 'Jäger', 'Bauer', 'Wirt'],
    titel: (o) => `Das Lager bei ${o.ortName}`,
    text: (o) => `Am Weg nach ${o.ortName} sitzt Gesindel um ein Feuer. Sie nehmen `
      + 'Wegzoll, den keiner von ihnen erheben darf. Macht dem ein Ende.',
    lohn: { gold: 130, xp: 150 },
  },
  {
    id: 'ruine', ortArt: 'ruine', art: 'ort',
    berufe: ['Wirt', 'Kräuterfrau', 'Chronist', 'Bauer'],
    titel: (o) => `Was in ${o.ortName} umgeht`,
    text: (o) => `In ${o.ortName} steht nachts etwas auf, das dort nicht mehr `
      + 'stehen sollte. Seht nach und legt es wieder hin.',
    lohn: { gold: 120, xp: 140 },
  },
  {
    id: 'turm', ortArt: 'turm', art: 'ort',
    berufe: ['Wache', 'Händlerin', 'Schmiedin'],
    titel: (o) => `${o.ortName} zurückholen`,
    text: (o) => `${o.ortName} war einmal unser Ausguck. Jetzt sitzt dort jemand `
      + 'anders und schießt auf alles, was vorbeikommt.',
    lohn: { gold: 170, xp: 190 },
  },
  {
    id: 'schrein', ortArt: 'schrein', art: 'schrein',
    berufe: ['Kräuterfrau', 'Chronist', 'Wirt'],
    titel: (o) => `Das Wegzeichen bei ${o.ortName}`,
    text: (o) => `Bei ${o.ortName} steht ein alter Schrein. Legt die Hand darauf `
      + 'und sagt mir, ob er noch antwortet. Es wäre mir eine Ruhe.',
    lohn: { gold: 90, xp: 120 },
  },

  /* ----------------------------- Die Jagd -------------------------------- */
  {
    id: 'jagd', art: 'jagd', mengeMin: 3, mengeMax: 5,
    berufe: ['Jäger', 'Schmiedin', 'Bauer', 'Wache'],
    titel: (o) => `${o.wesenName} vor der Tür`,
    text: (o) => `${o.wesenName} treiben sich hier herum, und es werden mehr. `
      + 'Nehmt euch ihrer an, bevor es jemand Böseres tut.',
    lohn: { gold: 110, xp: 140 },
  },
  {
    id: 'gezeichnet', art: 'gezeichnet', mengeMin: 1, mengeMax: 1,
    berufe: ['Wache', 'Jäger', 'Wirt'],
    titel: () => 'Der Gezeichnete',
    text: () => 'Einer von ihnen ist größer als die anderen und führt sie an. '
      + 'Solange der steht, kommen sie wieder. Legt ihn.',
    lohn: { gold: 200, xp: 240 },
  },

  /* ---------------------------- Die Werkbank ----------------------------- */
  {
    id: 'liefern', art: 'liefern', mengeMin: 2, mengeMax: 4,
    berufe: ['Schmiedin', 'Händlerin', 'Kräuterfrau', 'Wirt'],
    titel: (o) => `${o.wareName} für die Werkbank`,
    text: (o) => `Mir fehlt ${o.wareName}. Bringt mir welche, und ich zahle besser, `
      + 'als die Händlerin es je täte.',
    lohn: { gold: 120, xp: 110 },
  },
  {
    id: 'glimm', art: 'sammeln', mengeMin: 4, mengeMax: 7,
    berufe: ['Schmiedin', 'Wache'],
    titel: () => 'Glimm für die Esse',
    text: () => 'Die Esse ist kalt. In den Gruften sitzt Glimm im Fels — brecht uns welches heraus.',
    lohn: { gold: 90, xp: 120 },
  },

  /* ---------------------------- Die Gruften ------------------------------ */
  {
    id: 'raeumen', art: 'toeten', mengeMin: 3, mengeMax: 6, wo: 'dungeon',
    titel: (o) => `Räumt ${o.ziel} aus`,
    text: (o) => `In ${o.ziel} hat sich Gesindel eingenistet. Macht es leer — alle davon.`,
    lohn: { gold: 110, xp: 140 },
  },
  {
    id: 'truhe', art: 'truhe', mengeMin: 1, mengeMax: 2,
    titel: (o) => `Das Erbstück in ${o.ziel}`,
    text: (o) => `Mein Großvater ließ etwas in ${o.ziel} zurück. Es liegt in einer Truhe. Bringt es mir.`,
    lohn: { gold: 150, xp: 170 },
  },

  /* ----------------------------- Die Wege -------------------------------- */
  {
    id: 'bote', art: 'gehen', mengeMin: 1, mengeMax: 1,
    titel: (o) => `Nachricht nach ${o.ziel}`,
    text: (o) => `Bringt das hier nach ${o.ziel}. Fragt dort nach dem Brunnen, man kennt mich.`,
    lohn: { gold: 70, xp: 90 },
  },
];

let laufendeNr = 1;

/** Passt diese Vorlage zu dem, was die Welt um den Geber hergibt? */
function moeglich(v, kontext, beruf) {
  if (v.berufe && !v.berufe.includes(beruf)) return false;
  if (v.ortArt && !kontext.orte?.[v.ortArt]) return false;
  if (v.art === 'jagd' && !kontext.wesen) return false;
  if (v.art === 'liefern' && !kontext.ware) return false;
  if (v.art === 'gehen' && !kontext.nachbarPos) return false;
  return true;
}

/** Würfelt einen Auftrag für diesen Geber aus — immer denselben. */
export function auftragFuer(geberSaat, kontext, beruf = '') {
  const rand = mulberry32(geberSaat >>> 0);
  const topf = VORLAGEN.filter((v) => moeglich(v, kontext, beruf));
  const wahl = topf.length ? topf : VORLAGEN.filter((v) => moeglich(v, kontext, ''));
  const v = wahl[Math.floor(rand() * wahl.length)] || VORLAGEN[VORLAGEN.length - 1];

  const ort = v.ortArt ? kontext.orte[v.ortArt] : null;
  const o = {
    ziel: (v.art === 'gehen' ? kontext.nachbarort : kontext.dungeonName) || 'der alten Gruft',
    ortName: ort ? ort.name : 'dem alten Stein',
    wesenName: kontext.wesen ? kontext.wesen.name : 'Wölfe',
    wareName: kontext.ware ? kontext.ware.name : 'Wolfsfell',
  };

  let menge = v.mengeMin
    ? v.mengeMin + Math.floor(rand() * (v.mengeMax - v.mengeMin + 1))
    : 1;
  // Ein Ort ist geräumt, wenn nichts mehr steht — wie viele das sind, weiß er
  if (v.art === 'ort') menge = ort.zahl || 3;
  if (v.art === 'schrein') menge = 1;

  return {
    nr: laufendeNr++,
    vorlage: v.id,
    art: v.art,
    titel: v.titel(o),
    text: v.text(o),
    ziel: v.art === 'ort' || v.art === 'schrein' ? o.ortName : o.ziel,
    ortId: ort ? ort.id : null,
    wesen: v.art === 'jagd' ? kontext.wesen.id : null,
    ware: v.art === 'liefern' ? kontext.ware.id : null,
    /* Wohin man muss — und wohin man danach zurück muss. Was überall draußen
       spielt, hat absichtlich kein Ziel: ein Pfeil ins Nichts ist schlechter
       als gar keiner. */
    zielOrt: ort ? { x: ort.x, z: ort.z }
      : v.art === 'gehen' ? kontext.nachbarPos
      : v.wo === 'draussen' || v.art === 'jagd' || v.art === 'gezeichnet'
        || v.art === 'liefern' ? null
      : kontext.dungeonPos,
    geberOrt: kontext.geberPos || null,
    geberName: kontext.geberName || null,
    /* Die Saat des Gebers: nur daran lässt sich später genau der eine
       Mensch wiederfinden, der den Auftrag gegeben hat — Namen gibt es
       im Dorf mehrfach, Standorte wandern. */
    geberSaat,
    wo: v.wo || (v.art === 'toeten' || v.art === 'truhe' ? 'dungeon' : 'frei'),
    menge,
    stand: 0,
    fertig: false,
    abgegeben: false,
    lohn: { ...v.lohn },
  };
}

export class Auftragsbuch {
  constructor() { this.offen = []; this.erledigt = []; this.verfolgtNr = null; }

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
        // Ein Hase ist kein erledigter Auftrag
        if (daten.friedlich) continue;
        if (q.wo === 'dungeon' && !daten.imDungeon) continue;
        if (q.wo === 'draussen' && daten.imDungeon) continue;
      }
      // Was an einem bestimmten Ort passiert, zählt nur dort
      if ((art === 'ort' || art === 'schrein') && daten.ortId !== q.ortId) continue;
      // Und eine Jagd gilt nur für das Wesen, das gemeint war
      if (art === 'jagd' && daten.wesen !== q.wesen) continue;
      if (art === 'gezeichnet' && !daten.gezeichnet) continue;
      if (art === 'gehen' && daten.ort !== q.ziel) continue;
      q.stand = Math.min(q.menge, q.stand + (daten.menge || 1));
      if (q.stand >= q.menge) { q.fertig = true; fertig.push(q); }
    }
    return fertig;
  }

  /* Lieferaufträge zählen nicht mit, sie schauen nach: was im Beutel liegt,
     ist der Stand. Deshalb muss das jemand regelmäßig nachsehen. */
  beutelPruefen(held) {
    const fertig = [];
    for (const q of this.offen) {
      if (q.art !== 'liefern' || !q.ware) continue;
      const da = held.beutel[q.ware] || 0;
      const vorher = q.fertig;
      q.stand = Math.min(q.menge, da);
      q.fertig = da >= q.menge;
      if (q.fertig && !vorher) fertig.push(q);
    }
    return fertig;
  }

  abgeben(q, held) {
    if (!q.fertig || q.abgegeben) return null;
    // Geliefertes wechselt beim Abgeben wirklich den Besitzer
    if (q.art === 'liefern' && q.ware) {
      const da = held.beutel[q.ware] || 0;
      if (da < q.menge) return null;
      if (da === q.menge) delete held.beutel[q.ware];
      else held.beutel[q.ware] = da - q.menge;
    }
    q.abgegeben = true;
    this.offen = this.offen.filter((x) => x !== q);
    this.erledigt.push(q);
    held.gold += q.lohn.gold;
    return q.lohn;
  }

  /** Der Auftrag, der gerade im HUD stehen sollte. */
  /* Verfolgt wird genau eines: die Hauptgeschichte ('haupt') oder ein
     Nebenauftrag (dessen Nummer). Ohne eigene Wahl bleibt es bei null, und
     das Spiel entscheidet — Geschichte zuerst, sonst der erste Auftrag. */
  verfolgtHaupt() { return this.verfolgtNr === 'haupt'; }

  /** Der Nebenauftrag im HUD — oder nichts, wenn die Geschichte dran ist. */
  verfolgt() {
    if (this.verfolgtNr === 'haupt') return null;
    if (this.verfolgtNr != null) {
      const gewaehlt = this.offen.find((q) => q.nr === this.verfolgtNr);
      if (gewaehlt) return gewaehlt;
      this.verfolgtNr = null;          // der Auftrag ist weg, also von vorn
    }
    return this.offen.find((q) => q.fertig) || this.offen[0] || null;
  }

  /** q: ein Auftrag, 'haupt' für die Geschichte, null für „selbst entscheiden". */
  verfolgen(q) {
    if (q === 'haupt') { this.verfolgtNr = 'haupt'; return; }
    this.verfolgtNr = q && this.offen.includes(q) ? q.nr : null;
  }
}
