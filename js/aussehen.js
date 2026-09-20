/* ==========================================================================
 *  Wer man ist.
 *
 *  Ein Held, den man selbst zusammengestellt hat, ist ein anderer Held. Hier
 *  steht, woraus man wählen kann: Gewand, Haut, Haar, die Farbe der Laterne
 *  — und eine Herkunft, die nicht nur ein Wort ist, sondern Ausrüstung,
 *  eine Fertigkeit und einen Satz, den nur dieser Held sagen kann.
 *
 *  Die Laterne ist die wichtigste Wahl: sie färbt das Licht, das man nachts
 *  und unter Tage um sich herum wirft. Zwei Spieler mit derselben Welt
 *  sehen sie in verschiedenen Farben.
 * ========================================================================== */

export const GEWAENDER = [
  { id: 'blau',    name: 'Blaumantel',  kutte: '#4a6f9e', saum: '#33506f' },
  { id: 'terra',   name: 'Ziegelrot',   kutte: '#b5573f', saum: '#8a3e2c' },
  { id: 'moos',    name: 'Moosgrün',    kutte: '#5f8552', saum: '#44633a' },
  { id: 'nacht',   name: 'Nachtblau',   kutte: '#3c3f63', saum: '#2a2c48' },
  { id: 'sand',    name: 'Sandleinen',  kutte: '#c9ad7a', saum: '#9c8154' },
  { id: 'wein',    name: 'Weinrot',     kutte: '#7d3b52', saum: '#5a2a3b' },
  { id: 'asche',   name: 'Aschgrau',    kutte: '#6f6b66', saum: '#4e4b47' },
  { id: 'firn',    name: 'Firnweiß',    kutte: '#dfe3e6', saum: '#a9b2b8' },
];

export const HAUT = [
  { id: 'h1', farbe: '#f3d5b0' }, { id: 'h2', farbe: '#e8bd8e' },
  { id: 'h3', farbe: '#cf9a68' }, { id: 'h4', farbe: '#a9703f' },
  { id: 'h5', farbe: '#7c4d2a' }, { id: 'h6', farbe: '#52341f' },
];

export const HAAR = [
  { id: 'schwarz', farbe: '#2f2a26' }, { id: 'braun', farbe: '#6b452a' },
  { id: 'blond',   farbe: '#d8b168' }, { id: 'rot',   farbe: '#a8502c' },
  { id: 'grau',    farbe: '#9a958e' }, { id: 'weiss', farbe: '#e6e2d8' },
];

export const LATERNEN = [
  { id: 'warm',  name: 'Talglicht',  glas: '#ffe9b0', licht: '#ffbe72' },
  { id: 'kalt',  name: 'Firnlicht',  glas: '#cfe8f5', licht: '#8fc4e8' },
  { id: 'gruen', name: 'Moorlicht',  glas: '#cdf0c2', licht: '#8fd982' },
  { id: 'rot',   name: 'Glutlicht',  glas: '#ffc2a2', licht: '#ff8e5c' },
  { id: 'lila',  name: 'Irrlicht',   glas: '#ddc8f5', licht: '#b98fe0' },
];

/* -------------------------------- Herkunft --------------------------------
 * Jede gibt Ausrüstung, eine Fertigkeit und — wichtiger — einen Satz. Der
 * Chronist antwortet darauf, und der Wächter am Ende erinnert sich daran.
 * -------------------------------------------------------------------------- */
export const HERKUNFT = [
  {
    id: 'koehler',
    name: 'Köhlerhütte',
    text: 'Im Rauch groß geworden, mit einem Beil in der Hand.',
    gabe: 'Handbeil · 2 Heiltränke · Klinge 2',
    fert: 'klinge',
    sachen: { beil: 1, heiltrank: 2 },
    gold: 20,
    wort: 'Ich habe Meiler gehütet, bevor ich laufen konnte. Feuer, das nicht ausgehen darf.',
    antwort: 'Dann wisst Ihr, was es heißt, eine Glut die ganze Nacht zu halten. '
           + 'Genau darum geht es hier.',
  },
  {
    id: 'kraemer',
    name: 'Krämerladen',
    text: 'Rechnen konntest du, bevor du lesen konntest.',
    gabe: '260 Gold · Lederwams · Spüren 2',
    fert: 'spuren',
    sachen: { wams: 1, heiltrank: 1 },
    gold: 260,
    wort: 'Ich habe hinter einer Theke gestanden. Man lernt, wer die Wahrheit sagt.',
    antwort: 'Gut. Dann werdet Ihr merken, wenn Euch jemand belügt — und das wird '
           + 'jemand tun, ehe das hier vorbei ist.',
  },
  {
    id: 'kloster',
    name: 'Klosterschule',
    text: 'Man hat dir Buchstaben beigebracht, bis du sie hasstest.',
    gabe: 'Steinsplitter · 2 Quelltränke · Magie 2',
    fert: 'magie',
    sachen: { magietrank: 2, kutte: 1 },
    gold: 40,
    zauber: 'steinsplitter',
    wort: 'Ich habe Bücher abgeschrieben, die keiner mehr liest. Auch die über das Glimm.',
    antwort: 'Dann habt Ihr womöglich schon gelesen, was ich Euch gleich erzähle. '
           + 'Hört trotzdem zu — die Bücher irren sich.',
  },
  {
    id: 'wildwald',
    name: 'Wildwald',
    text: 'Der Wald hat dich durchgefüttert. Der Förster hat dich nie erwischt.',
    gabe: 'Jagdbogen · Hasenpfote · Wandern 2',
    fert: 'wandern',
    sachen: { jagdbogen: 1, hasenpfote: 1, heiltrank: 1 },
    gold: 30,
    wort: 'Ich war selten in Dörfern. Draußen ist mehr Platz und weniger Gerede.',
    antwort: 'Dann seid Ihr der Erste seit langem, der weiß, wie weit es bis zum '
           + 'nächsten Licht ist. Merkt Euch das Gefühl.',
  },
];

export const NAMEN = [
  'Anka', 'Bero', 'Cille', 'Doran', 'Elva', 'Falk', 'Gerda', 'Halvar',
  'Ilse', 'Joris', 'Kara', 'Lenn', 'Mira', 'Nils', 'Orla', 'Pelle',
  'Quirin', 'Rune', 'Silke', 'Tammo', 'Ulla', 'Veit', 'Wanda', 'Yrsa',
];

/** Ein zufälliges Aussehen — der Vorschlag, den man beim Aufschlagen sieht. */
export function neuesAussehen(rand = Math.random) {
  const zieh = (liste) => liste[Math.floor(rand() * liste.length)];
  return {
    name: zieh(NAMEN),
    gewand: zieh(GEWAENDER).id,
    haut: zieh(HAUT).id,
    haar: zieh(HAAR).id,
    laterne: LATERNEN[0].id,
    kapuze: rand() < 0.6,
    herkunft: zieh(HERKUNFT).id,
  };
}

const finde = (liste, id) => liste.find((x) => x.id === id) || liste[0];

/** Die Farben zu einem Aussehen, fertig zum Anlegen. */
export function farbenVon(a = {}) {
  const g = finde(GEWAENDER, a.gewand);
  const l = finde(LATERNEN, a.laterne);
  return {
    kutte: g.kutte, saum: g.saum,
    haut: finde(HAUT, a.haut).farbe,
    haar: finde(HAAR, a.haar).farbe,
    glas: l.glas, licht: l.licht,
    kapuze: a.kapuze !== false,
  };
}

export const herkunftVon = (id) => finde(HERKUNFT, id);
