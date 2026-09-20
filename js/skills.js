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

/* Fünf Stufen je Fertigkeit statt zwei. Die ersten beiden bekommt man
   nebenbei, die letzte ist ein Ziel für viele Stunden — und weil jede
   Fertigkeit eigene Stufen verlangt, kann man nicht alles auf einmal
   haben. `stufe` ist die Fertigkeitsstufe, die der Vorteil voraussetzt. */
export const VORTEILE = [
  /* ------------------------------- Klinge -------------------------------- */
  { id: 'klinge2',  fert: 'klinge',  stufe: 2, name: 'Schwerer Hieb',
    text: '+6 Schaden auf jeden Treffer' },
  { id: 'klinge3',  fert: 'klinge',  stufe: 3, name: 'Schnelle Hand',
    text: 'Der Hieb lädt ein Fünftel schneller nach' },
  { id: 'klinge4',  fert: 'klinge',  stufe: 4, name: 'Doppelschlag',
    text: 'Trifft einen zweiten Gegner daneben' },
  { id: 'klinge6',  fert: 'klinge',  stufe: 6, name: 'Blutrausch',
    text: 'Nach einem Tötungsschlag fünf Atemzüge lang +30%' },
  { id: 'klinge8',  fert: 'klinge',  stufe: 8, name: 'Meisterhieb',
    text: 'Jeder fünfte Treffer zählt doppelt' },

  /* ------------------------------ Zähigkeit ------------------------------ */
  { id: 'zaehe2',   fert: 'zaehe',   stufe: 2, name: 'Dickes Fell',
    text: '+15 Leben und ein Fünftel weniger Schaden' },
  { id: 'zaehe3',   fert: 'zaehe',   stufe: 3, name: 'Fester Stand',
    text: 'Ein Sturz tut nur halb so weh' },
  { id: 'zaehe4',   fert: 'zaehe',   stufe: 4, name: 'Zweiter Atem',
    text: 'Heilt nach dem Kampf deutlich schneller' },
  { id: 'zaehe6',   fert: 'zaehe',   stufe: 6, name: 'Eisenhaut',
    text: 'Rüstung schützt bis zu 72% statt 60%' },
  { id: 'zaehe8',   fert: 'zaehe',   stufe: 8, name: 'Letzter Wille',
    text: 'Einmal am Tag überlebst du den tödlichen Hieb' },

  /* -------------------------------- Magie -------------------------------- */
  { id: 'magie2',   fert: 'magie',   stufe: 2, name: 'Feuerfunke',
    text: 'Zauber treffen um 10 härter' },
  { id: 'magie3',   fert: 'magie',   stufe: 3, name: 'Sparsam',
    text: 'Jeder Spruch kostet ein Fünftel weniger' },
  { id: 'magie4',   fert: 'magie',   stufe: 4, name: 'Quelle',
    text: '+20 Magicka, und sie füllt sich schneller' },
  { id: 'magie6',   fert: 'magie',   stufe: 6, name: 'Nachhall',
    text: 'Zauber sind viel schneller wieder bereit' },
  { id: 'magie8',   fert: 'magie',   stufe: 8, name: 'Erzmagier',
    text: 'Alle Sprüche wirken um ein Drittel stärker' },

  /* -------------------------------- Spüren ------------------------------- */
  { id: 'spuren2',  fert: 'spuren',  stufe: 2, name: 'Scharfes Auge',
    text: 'Zeigt Truhen aus größerer Entfernung' },
  { id: 'spuren3',  fert: 'spuren',  stufe: 3, name: 'Sammler',
    text: 'Jede vierte Beute fällt doppelt an — auch Holz und Stein' },
  { id: 'spuren4',  fert: 'spuren',  stufe: 4, name: 'Grabräuber',
    text: 'Deutlich mehr Gold aus Truhen' },
  { id: 'spuren6',  fert: 'spuren',  stufe: 6, name: 'Feilscher',
    text: 'Händler zahlen 65% statt 45%' },
  { id: 'spuren8',  fert: 'spuren',  stufe: 8, name: 'Glückspilz',
    text: 'Truhen führen besseres Zeug als sie sollten' },

  /* ------------------------------- Wandern ------------------------------- */
  { id: 'wandern2', fert: 'wandern', stufe: 2, name: 'Leichter Schritt',
    text: '+20% Tempo' },
  { id: 'wandern3', fert: 'wandern', stufe: 3, name: 'Ruhiger Atem',
    text: 'Die Puste kommt halb so langsam zurück' },
  { id: 'wandern4', fert: 'wandern', stufe: 4, name: 'Langer Atem',
    text: 'Ausdauer hält doppelt so lange' },
  { id: 'wandern6', fert: 'wandern', stufe: 6, name: 'Windschritt',
    text: 'Rennen trägt dich spürbar weiter' },
  { id: 'wandern8', fert: 'wandern', stufe: 8, name: 'Unermüdlich',
    text: 'Rennen zehrt kaum noch an der Puste' },
];

/** Die Vorteile einer Fertigkeit, in der Reihenfolge ihrer Stufen. */
export const vorteileVon = (fertId) => VORTEILE.filter((v) => v.fert === fertId);

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
    schliff: {},              // wie oft ein Stück an der Esse war
    magicka: 60, magickaMax: 60,
    zauber: new Set(),        // welche Sprüche er gelernt hat
    aktiverZauber: 'funkenschlag',
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

/* Was die nächste Stufe kostet. Flacher als früher: mit fünf Vorteilen je
   Fertigkeit muss auch die achte Stufe erreichbar bleiben, sonst steht der
   halbe Baum nur zur Zierde da. */
export const stufenziel = (stufe) => Math.round(10 * Math.pow(1.5, stufe - 1));

/** Fertigkeit steigt durch Gebrauch — langsam, aber stetig. */
export function uebung(held, fert, menge = 1) {
  held.fertXp = held.fertXp || {};
  held.fertXp[fert] = (held.fertXp[fert] || 0) + menge;
  const ziel = stufenziel(held.fert[fert]);
  if (held.fertXp[fert] >= ziel) {
    held.fertXp[fert] -= ziel;
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
  zauber: (h) => (14 + h.fert.magie * 5 + (h.vorteile.has('magie2') ? 10 : 0))
    * (h.vorteile.has('magie8') ? 1.35 : 1),
  sicht: (h) => 16 + h.fert.spuren * 3 + (h.vorteile.has('spuren2') ? 14 : 0),
  beute: (h) => 1 + h.fert.spuren * 0.1 + (h.vorteile.has('spuren4') ? 0.6 : 0),
  /** Wie viel Rüstung überhaupt durchkommt — Eisenhaut hebt den Deckel. */
  panzerdeckel: (h) => (h.vorteile.has('zaehe6') ? 0.72 : 0.6),
  lebenMax: (h) => h.hpMax + boni(h).leben,
  magickaMax: (h) => h.magickaMax + boni(h).magicka,
};
