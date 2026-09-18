import { boni } from './items.js';

/* ==========================================================================
 *  Stufen und Fertigkeiten.
 *
 *  Nach Skyrim-Art: Fertigkeiten steigen dadurch, dass man sie benutzt, und
 *  jede Stufe gibt einen Punkt für einen Vorteil. Keine Klassen — wer viel
 *  schlägt, wird ein Kämpfer, wer viel sucht, wird ein Späher.
 * ========================================================================== */

export const FERTIGKEITEN = {
  klinge:   { name: 'Klinge',   sym: 'schwert', hinweis: 'Schaden im Nahkampf' },
  zaehe:    { name: 'Zähigkeit', sym: 'schild', hinweis: 'Leben und Rüstung' },
  magie:    { name: 'Magie',    sym: 'funke', hinweis: 'Zauberkraft und Magicka' },
  spuren:   { name: 'Spüren',   sym: 'auge', hinweis: 'Beute, Erz und Geheimnisse' },
  wandern:  { name: 'Wandern',  sym: 'stiefel', hinweis: 'Tempo und Ausdauer' },
};

export const VORTEILE = [
  { id: 'klinge2',  fert: 'klinge',  stufe: 2, name: 'Schwerer Hieb',   text: '+40% Schaden' },
  { id: 'klinge4',  fert: 'klinge',  stufe: 4, name: 'Doppelschlag',    text: 'Trifft zwei Gegner' },
  { id: 'zaehe2',   fert: 'zaehe',   stufe: 2, name: 'Dickes Fell',     text: '−25% Schaden' },
  { id: 'zaehe4',   fert: 'zaehe',   stufe: 4, name: 'Zweiter Atem',    text: 'Heilt nach dem Kampf' },
  { id: 'magie2',   fert: 'magie',   stufe: 2, name: 'Feuerfunke',      text: 'Zauber trifft härter' },
  { id: 'magie4',   fert: 'magie',   stufe: 4, name: 'Quelle',          text: 'Magicka füllt schneller' },
  { id: 'spuren2',  fert: 'spuren',  stufe: 2, name: 'Scharfes Auge',   text: 'Zeigt Truhen weiter weg' },
  { id: 'spuren4',  fert: 'spuren',  stufe: 4, name: 'Grabräuber',      text: 'Mehr Gold aus Truhen' },
  { id: 'wandern2', fert: 'wandern', stufe: 2, name: 'Leichter Schritt', text: '+20% Tempo' },
  { id: 'wandern4', fert: 'wandern', stufe: 4, name: 'Langer Atem',     text: 'Ausdauer hält doppelt' },
];

export function neuerHeld() {
  return {
    stufe: 1,
    xp: 0,
    xpZiel: 100,
    punkte: 0,
    gold: 0,
    hp: 100, hpMax: 100,
    ausdauer: 100, ausdauerMax: 100,
    orte: new Set(),          // welche Schreine schon geantwortet haben
    gesehen: new Set(),       // welche Wesen im Bestiarium stehen
    erlegt: {},               // und wie viele davon je erlegt wurden
    magicka: 60, magickaMax: 60,
    fert: { klinge: 1, zaehe: 1, magie: 1, spuren: 1, wandern: 1 },
    vorteile: new Set(),
    getoetet: 0,
    hilfen: 0,                // erledigte Nebenaufträge — sie zählen am Ende
    dungeons: new Set(),      // welche Truhen schon offen sind
    beutel: {},               // id -> Anzahl
    rue: { waffe: null, ruestung: null, schmuck: null },
  };
}

/** Erfahrung gutschreiben. Gibt zurück, ob eine Stufe dazugekommen ist. */
export function xpGeben(held, menge) {
  held.xp += menge;
  let auf = false;
  while (held.xp >= held.xpZiel) {
    held.xp -= held.xpZiel;
    held.stufe++;
    held.punkte++;
    held.xpZiel = Math.round(held.xpZiel * 1.35);
    held.hpMax += 8;
    held.ausdauerMax += 5;
    held.magickaMax += 4;
    held.hp = werte.lebenMax(held);
    auf = true;
  }
  return auf;
}

export function vorteilNehmen(held, id) {
  const v = VORTEILE.find((x) => x.id === id);
  if (!v || held.vorteile.has(id)) return false;
  if (held.punkte <= 0) return false;
  if (held.fert[v.fert] < v.stufe) return false;
  held.punkte--;
  held.vorteile.add(id);
  if (id === 'zaehe2') held.hpMax += 15;
  if (id === 'magie4') held.magickaMax += 20;
  return true;
}

/** Fertigkeit steigt durch Gebrauch — langsam, aber stetig. */
export function uebung(held, fert, menge = 1) {
  held.fertXp = held.fertXp || {};
  held.fertXp[fert] = (held.fertXp[fert] || 0) + menge;
  const ziel = 12 * Math.pow(1.6, held.fert[fert] - 1);
  if (held.fertXp[fert] >= ziel) {
    held.fertXp[fert] = 0;
    held.fert[fert]++;
    return true;
  }
  return false;
}

/* ------------------------- Was die Werte bewirken --------------------------
 * Fertigkeit und Ausrüstung greifen an derselben Stelle ineinander: mit
 * bloßen Fäusten bringt Klinge 5 wenig, und die beste Klinge trägt sich in
 * ungeübter Hand auch nicht von allein.
 * -------------------------------------------------------------------------- */
export const werte = {
  schaden: (h) => 6 + h.fert.klinge * 3 + boni(h).schaden * (1 + h.fert.klinge * 0.12)
    + (h.vorteile.has('klinge2') ? 6 : 0),
  ruestung: (h) => (h.vorteile.has('zaehe2') ? 0.2 : 0) + h.fert.zaehe * 0.025 + boni(h).panzer,
  tempo: (h) => 1 + h.fert.wandern * 0.035 + boni(h).tempo
    + (h.vorteile.has('wandern2') ? 0.2 : 0),
  zauber: (h) => 14 + h.fert.magie * 5 + (h.vorteile.has('magie2') ? 10 : 0),
  sicht: (h) => 16 + h.fert.spuren * 3 + (h.vorteile.has('spuren2') ? 14 : 0),
  beute: (h) => 1 + h.fert.spuren * 0.1 + (h.vorteile.has('spuren4') ? 0.6 : 0),
  lebenMax: (h) => h.hpMax + boni(h).leben,
  magickaMax: (h) => h.magickaMax + boni(h).magicka,
};
