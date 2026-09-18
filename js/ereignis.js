/* ==========================================================================
 *  Was einem zustößt.
 *
 *  Bisher passierte nur, was man selbst anfing: hingehen, zuschlagen, weiter.
 *  Hier kommt die Welt einem entgegen — ein Hinterhalt an der Straße, ein
 *  Rudel, das die Fährte aufnimmt, ein Dorf, das nachts überfallen wird.
 *
 *  Diese Datei entscheidet nur, *wann* etwas losgeht und *was* daraus wird.
 *  Gespawnt wird draußen, über die Haken — so muss sie nichts von Gelände,
 *  Szene oder Gegnern wissen.
 * ========================================================================== */

export const EREIGNISSE = {
  hinterhalt: {
    name: 'Hinterhalt',
    text: 'Sie haben hier auf jemanden gewartet.',
    farbe: '#c9543f',
    dauer: 75,
  },
  jagd: {
    name: 'Das Rudel hat dich',
    text: 'Etwas hat deine Fährte aufgenommen.',
    farbe: '#96392a',
    dauer: 90,
  },
  ueberfall: {
    name: 'Das Dorf wird angegriffen',
    text: 'Von draußen kommt, was drinnen niemand aufhält.',
    farbe: '#c9543f',
    dauer: 150,
  },
  wanderer: {
    name: 'Ein Zug zieht vorbei',
    text: 'Sie haben es eilig und schauen nicht nach links.',
    farbe: '#7fae5e',
    dauer: 60,
  },
};

/* Wie lange es höchstens ruhig bleibt. Kurz genug, dass man unterwegs
   immer wieder etwas erlebt — lang genug, dass es nicht zur Hatz wird. */
const PAUSE_MIN = 40;
const PAUSE_SPANNE = 55;

export class Ereignisse {
  constructor(haken) {
    this.haken = haken;        // { spawn, meldung, banner, ort, nacht, gefahr, imDorf, imDungeon }
    this.wartet = 25;
    this.laufend = null;       // { id, rest, feinde:[], dorf }
    this.zuletzt = null;
  }

  get aktiv() { return this.laufend; }

  /** Was gerade läuft — für die Anzeige. */
  anzeige() {
    if (!this.laufend) return null;
    const e = EREIGNISSE[this.laufend.id];
    const uebrig = this.laufend.feinde.filter((f) => f.hp > 0).length;
    return { name: e.name, farbe: e.farbe, uebrig, rest: Math.ceil(this.laufend.rest) };
  }

  abbrechen() {
    this.laufend = null;
    this.wartet = PAUSE_MIN;
  }

  update(dt, lage) {
    if (this.laufend) { this.laufendPflegen(dt, lage); return; }
    if (lage.imDungeon) return;

    this.wartet -= dt;
    if (this.wartet > 0) return;
    this.wartet = PAUSE_MIN + Math.random() * PAUSE_SPANNE;

    const id = this.waehlen(lage);
    if (!id) return;
    this.starten(id, lage);
  }

  /* Was hier passieren kann, hängt an Ort und Zeit: im Dorf nachts ein
     Überfall, draußen nachts die Jagd, tagsüber an der Straße der Hinterhalt.
     Zweimal dasselbe hintereinander gibt es nicht. */
  waehlen(lage) {
    const moeglich = [];
    if (lage.imDorf && lage.nacht) moeglich.push(['ueberfall', 3]);
    if (!lage.imDorf) {
      if (lage.nacht) moeglich.push(['jagd', 3]);
      moeglich.push(['hinterhalt', lage.gefahr >= 3 ? 3 : 1.5]);
      moeglich.push(['wanderer', 1]);
    }
    const topf = moeglich.filter(([id]) => id !== this.zuletzt);
    const wahl = topf.length ? topf : moeglich;
    if (!wahl.length) return null;
    let summe = 0;
    for (const [, g] of wahl) summe += g;
    let w = Math.random() * summe;
    for (const [id, g] of wahl) { w -= g; if (w <= 0) return id; }
    return wahl[0][0];
  }

  starten(id, lage) {
    const feinde = this.haken.spawn(id, lage) || [];
    if (!feinde.length && id !== 'wanderer') return;
    this.laufend = { id, rest: EREIGNISSE[id].dauer, feinde, dorf: lage.dorf || null };
    this.zuletzt = id;
    const e = EREIGNISSE[id];
    this.haken.banner(e.name, e.text, e.farbe);
  }

  laufendPflegen(dt, lage) {
    const l = this.laufend;
    l.rest -= dt;
    const uebrig = l.feinde.filter((f) => f.hp > 0).length;

    if (l.id !== 'wanderer' && l.feinde.length && uebrig === 0) {
      this.haken.geschafft(l.id, l.feinde.length);
      this.laufend = null;
      this.wartet = PAUSE_MIN + Math.random() * PAUSE_SPANNE;
      return;
    }
    if (l.rest <= 0) {
      this.laufend = null;
      this.wartet = PAUSE_MIN + Math.random() * PAUSE_SPANNE;
    }
  }
}
