/* ==========================================================================
 *  Die Hauptgeschichte: Das Erlöschen.
 *
 *  Sie hat einen eigenen kleinen Zähler statt eines Auftrags im Buch. Die
 *  Auftragsvorlagen sind für Wiederholbares gebaut; eine Geschichte läuft
 *  einmal durch, prüft von Kapitel zu Kapitel andere Dinge und darf am Ende
 *  zwei Wege haben. Das ineinanderzuzwängen hätte beides verbogen.
 *
 *  Der Gedanke dahinter: Am Ende zählt nicht, was du erschlagen hast, sondern
 *  ob du dich um die Leute gekümmert hast. Wer nur gekämpft hat, kann den
 *  Wächter nur erschlagen. Wer geholfen hat, kann mit ihm reden.
 * ========================================================================== */

export const NOETIGE_HILFE = 4;      // so viele Nebenaufträge öffnen den zweiten Weg

export const KAPITEL = [
  {
    id: 0,
    titel: 'Das Erlöschen',
    ziel: 'Bring dem Chronisten 5 Glimmsteine',
    rede: 'Setzt Euch. Nein — bleibt ruhig stehen, wenn Ihr lieber steht.\n\n'
        + 'Seht Ihr die Laternen? Sie brennen kürzer als vor zehn Jahren. Ich schreibe '
        + 'das auf, seit ich hier bin, und die Striche werden jedes Jahr kürzer. '
        + 'Das Glimm im Fels wird müde.\n\n'
        + 'Bringt mir fünf Steine davon. Dann zeige ich Euch, was ich meine.',
    art: 'glimm', menge: 5,
    abschluss: 'Da. Haltet einen ins Licht.\n\n'
        + 'Seht Ihr? Er ist nicht ausgegangen. Er ist fortgegangen — irgendwohin. '
        + 'Etwas zieht daran.',
  },
  {
    id: 1,
    titel: 'Ein Zeichen im Stein',
    ziel: 'Finde das Siegel in {gruft}',
    rede: 'Vor Jahren brachte mir ein Mann ein Siegel aus einer Gruft. Ein Zeichen darauf, '
        + 'das ich nirgends sonst gesehen habe. Er wollte es zurückholen und kam nicht wieder.\n\n'
        + 'Es liegt in {gruft}. In einer Truhe, sagte er. Holt es mir.',
    art: 'truhe', menge: 1,
    abschluss: 'Das ist es. Dasselbe Zeichen.\n\n'
        + 'Ich kenne es nicht. Aber ich bin nicht der einzige alte Mensch auf der Welt.',
  },
  {
    id: 2,
    titel: 'Andere Stimmen',
    ziel: 'Frag in 2 anderen Dörfern nach',
    rede: 'Geht in zwei andere Dörfer. Fragt nach dem Zeichen. Man wird Euch ansehen, '
        + 'als wärt Ihr verrückt, und dann wird jemand blass.\n\n'
        + 'Kommt zurück, wenn Ihr genug gehört habt.',
    art: 'doerfer', menge: 2,
    abschluss: 'Alle sagen dasselbe, nicht wahr. Ein Loch im Osten, aus dem nichts zurückkommt.\n\n'
        + 'Dann ist es kein Gerede mehr.',
  },
  {
    id: 3,
    titel: 'Der Schlund',
    ziel: 'Steig in den Schlund hinab',
    rede: 'Es sammelt sich an einem Ort. {richtung} von hier liegt ein Schlund, '
        + 'tiefer als alles, was ich kenne.\n\n'
        + 'Ich kann Euch nicht sagen, was unten ist. Ich kann Euch nur sagen, dass '
        + 'ich zu alt bin, um es selbst nachzusehen. Geht hinunter.',
    art: 'schlund', menge: 1,
    abschluss: '',
  },
  {
    id: 4,
    titel: 'Der Wächter',
    ziel: 'Stell dich dem, was im Schlund sitzt',
    rede: '',
    art: 'waechter', menge: 1,
    abschluss: '',
  },
];

export function neueGeschichte() {
  return {
    kapitel: 0,
    gestartet: false,
    ziel: 0,              // Fortschritt im laufenden Kapitel
    gruftId: null,        // die Gruft aus Kapitel 1
    gruftName: null,
    doerfer: [],          // welche Dörfer schon befragt wurden
    fertig: false,
    ende: null,           // 'klinge' oder 'wort'
  };
}

export const aktuell = (st) => (st.fertig ? null : KAPITEL[st.kapitel] || null);

/** Setzt {gruft} und {richtung} im Text ein. */
export function fuellen(text, st, richtung) {
  return (text || '')
    .replaceAll('{gruft}', st.gruftName || 'der alten Gruft')
    .replaceAll('{richtung}', richtung || 'weit draußen');
}

/** Meldet ein Ereignis an die Geschichte. Gibt zurück, ob das Kapitel fällt. */
export function melden(st, art, daten = {}) {
  const k = aktuell(st);
  if (!k || !st.gestartet || k.art !== art) return false;

  if (art === 'truhe' && daten.gruftId !== st.gruftId) return false;
  if (art === 'doerfer') {
    if (!daten.ort || st.doerfer.includes(daten.ort)) return false;
    st.doerfer.push(daten.ort);
    st.ziel = st.doerfer.length;
    return st.ziel >= k.menge;
  }

  st.ziel = Math.min(k.menge, st.ziel + (daten.menge || 1));
  return st.ziel >= k.menge;
}

export const kapitelFertig = (st) => {
  const k = aktuell(st);
  return !!k && st.gestartet && st.ziel >= k.menge;
};

/** Weiter zum nächsten Kapitel. */
export function weiter(st) {
  st.kapitel++;
  st.ziel = 0;
  if (st.kapitel >= KAPITEL.length) { st.fertig = true; st.kapitel = KAPITEL.length - 1; }
}

/** Darf man mit dem Wächter reden statt zu kämpfen? */
export const darfReden = (held) => (held.hilfen || 0) >= NOETIGE_HILFE;
