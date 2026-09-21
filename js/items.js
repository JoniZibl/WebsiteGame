import { mulberry32 } from './noise.js';

/* ==========================================================================
 *  Was man findet, trägt und verkauft.
 *
 *  Drei Sorten zählen im Kampf — Waffe, Rüstung, Schmuck —, dazu Tränke und
 *  Krempel, der nur einen Preis hat. Jeder Gegenstand steht genau einmal in
 *  dieser Tabelle; Schaden, Wert und Fundtiefe hängen an derselben Stelle,
 *  damit sich das Gleichgewicht an einem Ort nachziehen lässt.
 * ========================================================================== */

/* Vier Stufen. Sie färben den Namen, stehen im Beutel und im Laden, und sie
   sagen einem auf einen Blick, ob ein Fund etwas taugt. Der Faktor ist keine
   Rechenregel, sondern die Erwartung: ein sagenhaftes Stück ist ungefähr
   doppelt so gut wie ein gemeines desselben Rangs. */
export const SELTENHEIT = {
  gemein:    { name: 'gemein',    farbe: '#8a7f70' },
  selten:    { name: 'selten',    farbe: '#4f7fa8' },
  episch:    { name: 'episch',    farbe: '#8a6bb0' },
  sagenhaft: { name: 'sagenhaft', farbe: '#d9902a' },
};

export const DINGE = {
  /* --------------------------------- Waffen -------------------------------
   * `form` sagt, wie die Waffe in der Hand aussieht — eine Axt ist kein
   * Schwert mit anderer Zahl. `sym` ist ihr Zeichen im Beutel.
   * ---------------------------------------------------------------------- */
  knueppel:    { name: 'Knüppel',        art: 'waffe', sym: 'schwert', form: 'kolben',
                 schaden: 3,  wert: 18,  rang: 0, guete: 'gemein',
                 klinge: '#9a6138', griff: '#7a4a2e',
                 text: 'Ein Ast mit Entschlossenheit.' },
  beil:        { name: 'Handbeil',       art: 'waffe', sym: 'axt', form: 'axt',
                 schaden: 5,  wert: 42,  rang: 0, guete: 'gemein',
                 klinge: '#b9aa98', griff: '#8a5230',
                 text: 'Eigentlich für Holz. Eigentlich.' },
  kurzschwert: { name: 'Kurzschwert',    art: 'waffe', sym: 'schwert', form: 'klinge',
                 schaden: 7,  wert: 70,  rang: 1, guete: 'gemein',
                 klinge: '#d8dde2', griff: '#8a5230',
                 text: 'Handlich. Tut, was man von ihm erwartet.' },
  holzspeer:   { name: 'Holzspeer',      art: 'waffe', sym: 'speer', form: 'speer',
                 schaden: 6,  wert: 55,  rang: 1, guete: 'gemein', reichweite: 0.6,
                 klinge: '#c3b79c', griff: '#a8743f',
                 text: 'Man bleibt damit gern auf Abstand.' },

  streitkolben:{ name: 'Streitkolben',   art: 'waffe', sym: 'kolben', form: 'kolben',
                 schaden: 11, wert: 150, rang: 2, guete: 'selten',
                 klinge: '#b9aa98', griff: '#5e4634',
                 text: 'Gegen Knochen besonders überzeugend.' },
  kriegsbeil:  { name: 'Kriegsbeil',     art: 'waffe', sym: 'axt', form: 'axt',
                 schaden: 14, wert: 230, rang: 2, guete: 'selten',
                 klinge: '#cfd6dd', griff: '#6a4a30',
                 text: 'Zwei Hände wären besser, eine reicht.' },
  langschwert: { name: 'Langschwert',    art: 'waffe', sym: 'schwert', form: 'klinge',
                 schaden: 16, wert: 320, rang: 3, guete: 'selten',
                 klinge: '#e6ecf2', griff: '#4a3b30',
                 text: 'Reichweite ist die halbe Miete.' },
  jagdspiess:  { name: 'Jagdspieß',     art: 'waffe', sym: 'speer', form: 'speer',
                 schaden: 13, wert: 260, rang: 2, guete: 'selten', reichweite: 0.8,
                 klinge: '#d8dde2', griff: '#8a5230',
                 text: 'Der Keiler kommt bis hierher und nicht weiter.' },

  mondsichel:  { name: 'Mondsichel',     art: 'waffe', sym: 'schwert', form: 'sichel',
                 schaden: 20, wert: 520, rang: 3, guete: 'episch',
                 klinge: '#dfe7ee', griff: '#3f3a52',
                 text: 'Die Schneide liegt auf der falschen Seite. Trotzdem schneidet sie.' },
  rabenschnabel:{ name: 'Rabenschnabel', art: 'waffe', sym: 'axt', form: 'picke',
                 schaden: 22, wert: 610, rang: 3, guete: 'episch',
                 klinge: '#9aa3ab', griff: '#2f2b3f',
                 text: 'Sucht sich die Lücke im Panzer allein.' },
  runenklinge: { name: 'Runenklinge',    art: 'waffe', sym: 'schwert', form: 'klinge',
                 schaden: 24, wert: 760, rang: 4, guete: 'episch',
                 klinge: '#9fd8e8', griff: '#3f3a52',
                 text: 'Die Zeichen darauf liest niemand mehr.' },

  glimmklinge: { name: 'Glimmklinge',    art: 'waffe', sym: 'schwert', form: 'klinge',
                 schaden: 31, wert: 1450, rang: 4, guete: 'sagenhaft',
                 klinge: '#f5c451', griff: '#7d5227', leuchtet: true,
                 text: 'Sie war einmal eine Laterne. Jemand hat sie umgeschmiedet.' },
  aschespalter:{ name: 'Aschespalter',   art: 'waffe', sym: 'axt', form: 'axt',
                 schaden: 35, wert: 1700, rang: 4, guete: 'sagenhaft',
                 klinge: '#e0654b', griff: '#4e3520', leuchtet: true,
                 text: 'Aus dem Roten Grund. Sie ist dort nicht zufällig gelegen.' },
  firnspeer:   { name: 'Firnspeer',      art: 'waffe', sym: 'speer', form: 'speer',
                 schaden: 28, wert: 1380, rang: 4, guete: 'sagenhaft', reichweite: 0.9,
                 klinge: '#bfdfe4', griff: '#93aec4', leuchtet: true,
                 text: 'Die Spitze taut nicht auf.' },

  /* --------------------------------- Bögen --------------------------------
   * `fern` macht aus dem Schlagknopf einen Schussknopf. Bögen tragen weniger
   * Schaden als Klingen desselben Rangs — sie bezahlen ihn mit Abstand.
   * ---------------------------------------------------------------------- */
  jagdbogen:   { name: 'Jagdbogen',      art: 'waffe', sym: 'bogen', form: 'bogen',
                 schaden: 5,  wert: 85,  rang: 1, guete: 'gemein',
                 fern: 'pfeil', klinge: '#a8743f', griff: '#f0e7d2',
                 text: 'Zieht leicht. Trifft, wenn du ruhig stehst.' },
  hornbogen:   { name: 'Hornbogen',      art: 'waffe', sym: 'bogen', form: 'bogen',
                 schaden: 11, wert: 290, rang: 2, guete: 'selten',
                 fern: 'pfeil', klinge: '#8a5230', griff: '#f6ead6',
                 text: 'Aus Horn und Sehne. Knackt beim Spannen.' },
  langbogen:   { name: 'Langbogen',      art: 'waffe', sym: 'bogen', form: 'bogen',
                 schaden: 18, wert: 680, rang: 3, guete: 'episch',
                 fern: 'pfeil', klinge: '#6a4a30', griff: '#fdf6e8',
                 text: 'So hoch wie du. Er will beide Arme.' },
  sturmbogen:  { name: 'Sturmbogen',     art: 'waffe', sym: 'bogen', form: 'bogen',
                 schaden: 26, wert: 1520, rang: 4, guete: 'sagenhaft',
                 fern: 'pfeil', klinge: '#9fd8e8', griff: '#ffffff', leuchtet: true,
                 text: 'Der Pfeil ist fort, bevor die Sehne zurück ist.' },

  /* ------------------------------ Rüstungen ------------------------------ */
  kutte:       { name: 'Wollkutte',      art: 'ruestung', sym: 'schild', panzer: 0.04, wert: 26,  rang: 0, guete: 'gemein',
                 text: 'Besser als nichts, und das ist alles, was sie behauptet.' },
  wams:        { name: 'Lederwams',      art: 'ruestung', sym: 'schild', panzer: 0.07, wert: 55,  rang: 1, guete: 'gemein',
                 text: 'Hält den Wind ab und manchmal mehr.' },
  kettenhemd:  { name: 'Kettenhemd',     art: 'ruestung', sym: 'schild', panzer: 0.14, wert: 170, rang: 2, guete: 'selten',
                 text: 'Schwer, laut, sein Geld wert.' },
  hornpanzer:  { name: 'Hornpanzer',     art: 'ruestung', sym: 'schild', panzer: 0.18, wert: 280, rang: 2, guete: 'selten',
                 text: 'Geschient mit dem, was der Keiler nicht mehr braucht.' },
  schuppen:    { name: 'Schuppenpanzer', art: 'ruestung', sym: 'schild', panzer: 0.22, wert: 420, rang: 3, guete: 'episch',
                 text: 'Woher die Schuppen stammen, sagt der Händler nicht.' },
  wyrmleder:   { name: 'Wyrmlederrock',  art: 'ruestung', sym: 'schild', panzer: 0.26, wert: 640, rang: 3, guete: 'episch',
                 text: 'Es wird warm darin, sobald es kalt wird.' },
  grabharnisch:{ name: 'Grabharnisch',   art: 'ruestung', sym: 'schild', panzer: 0.3,  wert: 880, rang: 4, guete: 'sagenhaft',
                 text: 'Jemand hat ihn lange getragen. Sehr lange.' },
  firnharnisch:{ name: 'Firnharnisch',   art: 'ruestung', sym: 'schild', panzer: 0.34, wert: 1560, rang: 4, guete: 'sagenhaft',
                 text: 'Er klirrt leise, auch wenn niemand sich bewegt.' },

  /* ------------------------------- Schmuck ------------------------------- */
  glasperle:   { name: 'Glasperle',         art: 'schmuck', sym: 'ring', magicka: 12, wert: 60,  rang: 0, guete: 'gemein',
                 text: 'Ein Marktstück. Trotzdem wird der Kopf etwas klarer.' },
  hasenpfote:  { name: 'Hasenpfote',        art: 'schmuck', sym: 'ring', tempo: 0.06, wert: 70,  rang: 1, guete: 'gemein',
                 text: 'Dem Hasen hat sie weniger geholfen als dir.' },
  kraftamulett:{ name: 'Amulett der Kraft', art: 'schmuck', sym: 'ring', schaden: 5,  wert: 190, rang: 2, guete: 'selten',
                 text: 'Der Arm wird nicht müder, nur überzeugter.' },
  lebensring:  { name: 'Ring des Atems',    art: 'schmuck', sym: 'ring', leben: 30,   wert: 220, rang: 2, guete: 'selten',
                 text: 'Man steht ein wenig länger.' },
  magiestein:  { name: 'Quellstein',        art: 'schmuck', sym: 'ring', magicka: 35, wert: 210, rang: 2, guete: 'selten',
                 text: 'Kalt, auch in der Sonne.' },
  wanderschuh: { name: 'Schuhe des Boten',  art: 'schmuck', sym: 'stiefel', tempo: 0.18, wert: 240, rang: 3, guete: 'episch',
                 text: 'Sie kennen den Weg besser als du.' },
  wolfskette:  { name: 'Zahnkette',         art: 'schmuck', sym: 'ring', schaden: 11, wert: 520, rang: 3, guete: 'episch',
                 text: 'Neun Zähne, neun Wölfe. Man hört sie noch klappern.' },
  ahnenring:   { name: 'Ring der Ahnen',    art: 'schmuck', sym: 'ring', schaden: 14, leben: 40, wert: 1400, rang: 4, guete: 'sagenhaft',
                 text: 'Er sitzt sofort, als hätte er auf diese Hand gewartet.' },
  sternenreif: { name: 'Sternenreif',       art: 'schmuck', sym: 'ring', magicka: 90, wert: 1250, rang: 4, guete: 'sagenhaft',
                 text: 'Nachts sieht man darin mehr Licht, als ringsum ist.' },

  /* -------------------------------- Tränke ------------------------------- */
  heiltrank:   { name: 'Heiltrank',      art: 'trank', sym: 'trank', heilt: 50, wert: 40, rang: 1, guete: 'gemein',
                 text: 'Schmeckt nach Eisen und Minze.' },
  magietrank:  { name: 'Quelltrank',     art: 'trank', sym: 'trank', magie: 45, wert: 35, rang: 1, guete: 'gemein',
                 text: 'Prickelt hinter der Stirn.' },
  grossHeil:   { name: 'Großer Heiltrank', art: 'trank', sym: 'trank', heilt: 130, wert: 120, rang: 3, guete: 'selten',
                 text: 'Ein halber Liter. Man trinkt ihn nicht nebenbei.' },
  grossMagie:  { name: 'Tiefe Quelle',   art: 'trank', sym: 'trank', magie: 120, wert: 110, rang: 3, guete: 'selten',
                 text: 'Danach summt es eine Weile in den Fingern.' },

  /* ------------------------------- Die Lehren -----------------------------
   * Zauber liegen als Bücher in Truhen. Wer eines liest, kann den Spruch für
   * immer — sofern seine Magie weit genug ist. Sonst legt er es zurück und
   * übt erst einmal.
   * ---------------------------------------------------------------------- */
  lehreSplitter: { name: 'Vom Splittern der Steine', art: 'lehre', sym: 'buch',
                   lehrt: 'steinsplitter', wert: 90,  rang: 1, guete: 'gemein',
                   text: 'Eine Seite lang, der Rest sind Kritzeleien.' },
  lehreEis:      { name: 'Das kalte Wort',           art: 'lehre', sym: 'buch',
                   lehrt: 'eislanze',     wert: 320, rang: 2, guete: 'selten',
                   text: 'Der Einband ist feucht, obwohl es hier nicht regnet.' },
  lehreFlamme:   { name: 'Atem und Zunder',          art: 'lehre', sym: 'buch',
                   lehrt: 'flammenhauch', wert: 340, rang: 2, guete: 'selten',
                   text: 'An den Rändern angekokelt. Von innen.' },
  lehreBalsam:   { name: 'Kräuter für Wunden',       art: 'lehre', sym: 'buch',
                   lehrt: 'balsam',       wert: 360, rang: 2, guete: 'selten',
                   text: 'Halb Rezeptbuch, halb Spruch. Beides hilft.' },
  lehreStein:    { name: 'Der graue Panzer',         art: 'lehre', sym: 'buch',
                   lehrt: 'steinhaut',    wert: 720, rang: 3, guete: 'episch',
                   text: 'So schwer, dass man es kaum trägt. Das ist Absicht.' },
  lehreRuf:      { name: 'Was sie fürchten',         art: 'lehre', sym: 'buch',
                   lehrt: 'schreckensruf', wert: 700, rang: 3, guete: 'episch',
                   text: 'Jemand hat jede zweite Zeile durchgestrichen.' },
  lehreBlitz:    { name: 'Die springende Naht',      art: 'lehre', sym: 'buch',
                   lehrt: 'blitzkette',   wert: 860, rang: 3, guete: 'episch',
                   text: 'Die Schließe ist geschmolzen.' },
  lehreSturm:    { name: 'Vom Himmel herab',         art: 'lehre', sym: 'buch',
                   lehrt: 'himmelssturm', wert: 1900, rang: 4, guete: 'sagenhaft',
                   text: 'Nur drei Worte darin. Man braucht Jahre für sie.' },
  lehreAsche:    { name: 'Der Rote Grund spricht',   art: 'lehre', sym: 'buch',
                   lehrt: 'ascheregen',   wert: 1800, rang: 4, guete: 'sagenhaft',
                   text: 'Es färbt die Finger und lässt sich nicht abwaschen.' },

  /* ------------------------------- Baustoffe ------------------------------
   * Nichts davon liegt in einer Truhe. Holz und Stein holt man sich selbst —
   * mit dem Abbauknopf am Baum, am Findling oder an der Felswand. Sie sind
   * der Grund, warum man unterwegs stehen bleibt, statt nur durchzulaufen.
   * ---------------------------------------------------------------------- */
  holz:        { name: 'Holz',           art: 'stoff', sym: 'holz', wert: 4, rang: 0,
                 baustoff: true,
                 text: 'Ein Klafter, grob gespalten. Das Lager fängt hiermit an.' },
  stein:       { name: 'Stein',          art: 'stoff', sym: 'brocken', wert: 5, rang: 0,
                 baustoff: true,
                 text: 'Schwer, kantig, brauchbar. Mehr muss ein Stein nicht sein.' },
  eisen:       { name: 'Eisenklumpen',  art: 'stoff', sym: 'eisenerz', wert: 16, rang: 1,
                 baustoff: true,
                 text: 'Rostrot gesprenkelt. Liegt erst ein paar Meter unter dem Gras.' },
  schwefel:    { name: 'Schwefel',      art: 'stoff', sym: 'schwefel', wert: 34, rang: 2,
                 baustoff: true,
                 text: 'Gelb, bröselig, riecht nach Streichholz. Er liegt ganz unten.' },
  seil:        { name: 'Seil',          art: 'stoff', sym: 'seil', wert: 22, rang: 1,
                 baustoff: true, gemacht: true,
                 text: 'Aus Fell gedreht. Hält mehr aus, als es aussieht.' },
  tuch:        { name: 'Segeltuch',     art: 'stoff', sym: 'tuch', wert: 48, rang: 2,
                 baustoff: true, gemacht: true,
                 text: 'Dicht gewebt und mit Fett getränkt. Es lässt keine Luft durch.' },

  /* -------------------------------- Krempel ------------------------------ */
  wolfsfell:   { name: 'Wolfsfell',      art: 'beute', sym: 'fell', wert: 14, rang: 0,
                 text: 'Der Kürschner nimmt es.' },
  knochen:     { name: 'Alter Knochen',  art: 'beute', sym: 'knochen', wert: 9,  rang: 0,
                 text: 'Von jemandem, der nicht mehr fragt.' },
  glimmstein:  { name: 'Glimmstein',     art: 'beute', sym: 'kristall', wert: 30, rang: 1,
                 text: 'Leuchtet noch schwach.' },
  becher:      { name: 'Silberbecher',   art: 'beute', sym: 'becher', wert: 65, rang: 2,
                 text: 'Ein Wappen darauf, das keiner kennt.' },
  siegel:      { name: 'Altes Siegel',   art: 'beute', sym: 'siegel', wert: 120, rang: 3,
                 text: 'Hier stand einmal ein Name.' },

  /* --------------------------- Was vom Getier bleibt ---------------------
   * `wild` heißt: fällt nur bei dem Wesen an, das es trägt, und liegt nie in
   * einer Truhe. So sagt die Beute einem, wo man gewesen ist.
   * ---------------------------------------------------------------------- */
  balg:        { name: 'Weicher Balg',   art: 'beute', sym: 'fell', wert: 10, rang: 0, wild: true,
                 text: 'Wärmt eine Nacht lang.' },
  wolle:       { name: 'Rohwolle',       art: 'beute', sym: 'fell', wert: 12, rang: 0, wild: true,
                 text: 'Riecht nach Regen und Weide.' },
  hauer:       { name: 'Keilerhauer',    art: 'beute', sym: 'knochen', wert: 22, rang: 1, wild: true,
                 text: 'Er hat ihn nicht freiwillig hergegeben.' },
  krummhorn:   { name: 'Krummhorn',      art: 'beute', sym: 'knochen', wert: 26, rang: 1, wild: true,
                 text: 'Gedreht wie ein alter Weg.' },
  falterstaub: { name: 'Falterstaub',    art: 'beute', sym: 'glanz', wert: 18, rang: 1, wild: true,
                 text: 'Leuchtet noch an den Fingern.' },
  giftstachel: { name: 'Giftstachel',    art: 'beute', sym: 'knochen', wert: 42, rang: 2, wild: true,
                 text: 'Vorsichtig einpacken.' },
  dickfell:    { name: 'Dickfell',       art: 'beute', sym: 'fell', wert: 58, rang: 2, wild: true,
                 text: 'Schwer, warm, und niemand fragt, woher.' },
  frostbalg:   { name: 'Firnbalg',       art: 'beute', sym: 'fell', wert: 48, rang: 2, wild: true,
                 text: 'Bleibt kalt, egal wie warm es ist.' },
  irrlichtkern:{ name: 'Irrlichtkern',   art: 'beute', sym: 'kerze', wert: 55, rang: 2, wild: true,
                 text: 'Im Beutel ist es nie ganz dunkel.' },
  felsschuppe: { name: 'Felsschuppe',    art: 'beute', sym: 'schild', wert: 62, rang: 3, wild: true,
                 text: 'Schwerer, als ein Ding ihrer Größe sein sollte.' },
  moosherz:    { name: 'Moosherz',       art: 'beute', sym: 'kristall', wert: 72, rang: 3, wild: true,
                 text: 'Es schlägt noch. Langsam.' },
  nachtauge:   { name: 'Nachtauge',      art: 'beute', sym: 'auge', wert: 95, rang: 3, wild: true,
                 text: 'Es sieht dich an, auch im Beutel.' },
  wyrmschuppe: { name: 'Wyrmschuppe',    art: 'beute', sym: 'kristall', wert: 140, rang: 4, wild: true,
                 text: 'Warm wie ein Stein in der Sonne.' },
  riesenzahn:  { name: 'Riesenzahn',     art: 'beute', sym: 'knochen', wert: 155, rang: 4, wild: true,
                 text: 'So groß wie deine Hand. Mindestens.' },
};

export const TRAGBAR = ['waffe', 'ruestung', 'schmuck'];

/** Was ein Gegenstand beim Verkauf bringt — Händler zahlen nie den vollen Preis. */
export const verkaufswert = (id) => Math.max(1, Math.round(DINGE[id].wert * 0.45));

/* ------------------------------ Beutetabellen ------------------------------ */
const NACH_RANG = {};
for (const [id, d] of Object.entries(DINGE)) {
  if (d.wild) continue;        // Getierbeute gibt es nur beim Getier
  if (d.baustoff) continue;    // Holz und Stein holt man sich selbst
  (NACH_RANG[d.rang] ||= []).push(id);
}

/** Zieht einen Gegenstand passend zur Gefahr des Orts. */
export function beuteZiehen(rand, stufe, nurKrempel = false) {
  // Meist etwas vom eigenen Rang, manchmal eine Stufe darüber
  let rang = Math.min(4, Math.max(0, stufe - 1 + (rand() < 0.25 ? 1 : 0)));
  if (rand() < 0.2) rang = Math.max(0, rang - 1);
  let topf = NACH_RANG[rang] || NACH_RANG[0];
  if (nurKrempel) {
    topf = topf.filter((id) => DINGE[id].art === 'beute' || DINGE[id].art === 'trank');
    if (!topf.length) return 'knochen';
  }
  return topf[Math.floor(rand() * topf.length)];
}

/** Der Inhalt einer Truhe: immer derselbe für dieselbe Truhe. */
export function truhenInhalt(saat, stufe, gross) {
  const rand = mulberry32(saat >>> 0);
  const stuecke = [];
  const anzahl = gross ? 2 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 2);
  for (let i = 0; i < anzahl; i++) stuecke.push(beuteZiehen(rand, stufe + (gross ? 1 : 0)));
  const gold = Math.round((gross ? 110 : 40) * (1 + stufe * 0.35) * (0.7 + rand() * 0.6));
  return { stuecke, gold };
}

/* ------------------------------- Der Beutel -------------------------------- */
export function nehmen(held, id, n = 1) {
  held.beutel[id] = (held.beutel[id] || 0) + n;
}

export function ablegen(held, id, n = 1) {
  const da = held.beutel[id] || 0;
  if (da < n) return false;
  if (da === n) delete held.beutel[id];
  else held.beutel[id] = da - n;
  return true;
}

/** Anlegen. Was vorher an dem Platz hing, wandert zurück in den Beutel. */
export function anlegen(held, id) {
  const d = DINGE[id];
  if (!d || !TRAGBAR.includes(d.art)) return false;
  if (!ablegen(held, id)) return false;
  const alt = held.rue[d.art];
  if (alt) nehmen(held, alt);
  held.rue[d.art] = id;
  return true;
}

export function ausziehen(held, art) {
  const id = held.rue[art];
  if (!id) return false;
  held.rue[art] = null;
  nehmen(held, id);
  return true;
}

/** Summe aller Boni aus dem, was gerade am Körper hängt. */
export function boni(held) {
  const b = { schaden: 0, panzer: 0, leben: 0, magicka: 0, tempo: 0 };
  for (const art of TRAGBAR) {
    const id = held.rue[art];
    if (!id) continue;
    const d = DINGE[id];
    // Der Schliff zählt wie ein Teil des Stücks
    const w = schliffWirkung(id, (held.schliff && held.schliff[id]) || 0);
    b.schaden += (d.schaden || 0) + w.schaden;
    b.panzer += (d.panzer || 0) + w.panzer;
    b.leben += d.leben || 0;
    b.magicka += d.magicka || 0;
    b.tempo += d.tempo || 0;
  }
  return b;
}

/* --------------------------------- Die Esse --------------------------------
 * Was man dem Getier abnimmt, soll nicht nur einen Preis haben. An der Esse
 * wird daraus eine bessere Klinge: fünf Stufen, und jede verlangt Stoff aus
 * einer anderen Gegend. Wer die vierte Stufe will, muss ins Firnfeld und in
 * die Düne; wer die fünfte will, war im Roten Grund und hat eine Nacht
 * überstanden. So hängen Jagd, Landkarte und Ausrüstung an einem Faden.
 * -------------------------------------------------------------------------- */
export const SCHLIFF_MAX = 5;

export const SCHLIFF = [
  { gold: 40,  stoff: { wolfsfell: 2, balg: 1 },
    wort: 'Ausgebeult und nachgezogen.' },
  { gold: 95,  stoff: { hauer: 2, krummhorn: 1 },
    wort: 'Mit Horn beschlagen.' },
  { gold: 190, stoff: { frostbalg: 2, giftstachel: 1 },
    wort: 'In Firn gehärtet.' },
  { gold: 360, stoff: { moosherz: 1, felsschuppe: 2 },
    wort: 'Mit Fels unterlegt.' },
  { gold: 650, stoff: { wyrmschuppe: 1, nachtauge: 1, riesenzahn: 1 },
    wort: 'Etwas darin ist jetzt wach.' },
];

/** Was eine Stufe Schliff an einem Stück ausmacht. */
export function schliffWirkung(id, stufe) {
  const d = DINGE[id];
  if (!d || !stufe) return { schaden: 0, panzer: 0 };
  if (d.art === 'waffe') return { schaden: (2 + (d.rang || 0)) * stufe, panzer: 0 };
  if (d.art === 'ruestung') return { schaden: 0, panzer: 0.025 * stufe };
  return { schaden: 0, panzer: 0 };
}

/** Lässt sich das überhaupt schärfen? */
export const schleifbar = (id) => {
  const d = DINGE[id];
  return !!d && (d.art === 'waffe' || d.art === 'ruestung');
};

/** Fehlt etwas für die nächste Stufe? Gibt die Lücken zurück. */
export function schliffPruefen(held, id) {
  const stufe = (held.schliff && held.schliff[id]) || 0;
  if (stufe >= SCHLIFF_MAX) return { fertig: true };
  const r = SCHLIFF[stufe];
  const fehlt = [];
  for (const [stoff, n] of Object.entries(r.stoff)) {
    const da = held.beutel[stoff] || 0;
    if (da < n) fehlt.push({ id: stoff, braucht: n, da });
  }
  return { stufe, rezept: r, fehlt, gold: held.gold >= r.gold };
}

/** Schmiedet eine Stufe drauf. Gibt false, wenn etwas fehlt. */
export function schleifen(held, id) {
  const pr = schliffPruefen(held, id);
  if (pr.fertig || pr.fehlt.length || !pr.gold) return false;
  held.gold -= pr.rezept.gold;
  for (const [stoff, n] of Object.entries(pr.rezept.stoff)) ablegen(held, stoff, n);
  held.schliff = held.schliff || {};
  held.schliff[id] = pr.stufe + 1;
  return true;
}

/* -------------------------------- Der Laden -------------------------------- */
/** Was eine Händlerin führt. Hängt am Dorf, wechselt mit dem Tag. */
export function warenFuer(dorfSaat, tag, stufe) {
  const rand = mulberry32(((dorfSaat ^ (tag * 7919)) >>> 0));
  const waren = new Set(['heiltrank', 'heiltrank', 'magietrank']);
  const liste = ['heiltrank', 'magietrank'];
  for (let i = 0; i < 5; i++) {
    const id = beuteZiehen(rand, Math.min(4, stufe + 1));
    if (DINGE[id].art === 'beute') continue;
    if (!liste.includes(id)) liste.push(id);
  }
  return liste;
}
