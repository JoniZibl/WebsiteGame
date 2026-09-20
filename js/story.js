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
 *
 *  Zwei Stellen fragen zurück, und die Antwort bleibt stehen: was man den
 *  Dörfern gesagt hat, und was man mit dem Zeichen gemacht hat. Beides kommt
 *  im Schlund wieder. Eine Geschichte, die sich nicht erinnert, ist ein
 *  Vortrag.
 * ========================================================================== */

export const NOETIGE_HILFE = 4;      // so viele Nebenaufträge öffnen den zweiten Weg

/* Was ganz am Anfang über dem dunklen Bild steht. Drei Sätze, mehr nicht —
   wer vier Sätze braucht, hat den ersten nicht scharf genug gemacht. */
export const VORSPANN = [
  'Zehn Jahre lang ist jede Nacht ein wenig dunkler geworden.',
  'Niemand hat es bemerkt. So etwas bemerkt man nicht — man gewöhnt sich.',
  'Einer hat mitgeschrieben.',
];

export const KAPITEL = [
  {
    id: 0,
    titel: 'Das Erlöschen',
    ziel: 'Bring dem Chronisten 5 Glimmsteine',
    wo: 'Glimm sitzt im Fels — in Gruften, Höhlen und Klüften.',
    rede: 'Ihr seid der Erste seit Wochen, der stehen bleibt.\n\n'
        + 'Seht Ihr die Laternen dort? Ich messe sie. Seit zehn Jahren, jeden Abend, '
        + 'einen Strich für jede Stunde, die eine brennt. Die Striche werden kürzer. '
        + 'Nicht plötzlich — Jahr für Jahr ein Fingerbreit.\n\n'
        + 'Aber zuerst: wer seid Ihr eigentlich?',
    aufgabe: 'Das Glimm im Fels wird müde. Bringt mir fünf Steine davon, frisch '
        + 'gebrochen, nicht vom Händler. Dann zeige ich Euch, was ich meine.',
    art: 'glimm', menge: 5,
    abschluss: 'Da. Haltet einen ins Licht — nein, näher.\n\n'
        + 'Seht Ihr? Er ist nicht ausgegangen. Er ist noch warm. Er ist fort'
        + 'gegangen, irgendwohin, und hat den Stein zurückgelassen wie eine leere '
        + 'Hülse.\n\nEtwas zieht daran. Und es zieht seit zehn Jahren.',
  },
  {
    id: 1,
    titel: 'Ein Zeichen im Stein',
    ziel: 'Finde das Siegel in {gruft}',
    wo: 'In einer Truhe in {gruft}.',
    rede: 'Vor Jahren brachte mir ein Mann ein Siegel aus einer Gruft. Ein Zeichen '
        + 'darauf, das ich nirgends sonst gesehen habe — und ich habe viel gesehen.\n\n'
        + 'Er wollte es zurückbringen, wo es herkam. Er ist nicht wiedergekommen.\n\n'
        + 'Es liegt in {gruft}. Holt es mir. Und geht nicht bei Nacht hinein.',
    art: 'truhe', menge: 1,
    abschluss: 'Das ist es. Dasselbe Zeichen, derselbe krumme Strich in der Mitte.\n\n'
        + 'Ich kenne es nicht. Aber ich bin nicht der einzige alte Mensch auf dieser '
        + 'Welt, und die anderen sitzen in anderen Dörfern.',
  },
  {
    id: 2,
    titel: 'Andere Stimmen',
    ziel: 'Frag in 2 anderen Dörfern nach',
    wo: 'Irgendein Dorf außer diesem. Sprich einfach jemanden an.',
    rede: 'Geht in zwei andere Dörfer. Fragt nach dem Zeichen, fragt nach den '
        + 'Laternen. Man wird Euch ansehen, als wärt Ihr verrückt — und dann wird '
        + 'einer blass und redet.\n\nKommt zurück, wenn Ihr genug gehört habt.',
    art: 'doerfer', menge: 2,
    abschluss: 'Alle sagen dasselbe, nicht wahr. Ein Loch im Osten, aus dem nichts '
        + 'zurückkommt. Eine Nacht, in der es zu früh dunkel wurde.\n\n'
        + 'Dann ist es kein Gerede mehr, sondern ein Bericht.',
    /* Erste Frage, die stehen bleibt. */
    frage: 'Eines noch. Was habt Ihr den Leuten dort gesagt?',
    wahlen: [
      { id: 'warnen',   label: 'Die Wahrheit. Sie sollen es wissen.',
        unten: 'Angst macht wach.',
        antwort: 'Gut. Dann schlafen sie schlecht und zählen ihre Laternen. '
               + 'Vielleicht rettet sie das.' },
      { id: 'schweigen', label: 'Nichts. Sie haben genug Sorgen.',
        unten: 'Ruhe ist auch etwas wert.',
        antwort: 'Auch gut. Wer nichts weiß, arbeitet weiter. Ich hoffe nur, '
               + 'Ihr müsst es ihnen nicht später und in Eile sagen.' },
    ],
  },
  {
    id: 3,
    titel: 'Die Schreine schweigen',
    ziel: 'Lege an 3 Schreinen die Hand auf',
    wo: 'Wegzeichen und alte Schreine stehen draußen im Land — die Karte zeigt sie als goldene Punkte.',
    rede: 'Es gibt Steine draußen, an denen man die Hand auflegt. Wegzeichen, '
        + 'Schreine, wie Ihr wollt. Früher haben sie geantwortet — man ging etwas '
        + 'aufrechter weiter.\n\n'
        + 'Ein Bote hat mir erzählt, seiner habe geschwiegen. Ich will wissen, ob das '
        + 'an ihm lag. Legt an dreien die Hand auf und merkt Euch, was passiert.',
    art: 'schrein', menge: 3,
    abschluss: 'Drei von drei, und alle haben noch geantwortet. Schwächer, sagt Ihr.\n\n'
        + 'Dann ist es nicht fort. Es ist nur woanders. Etwas sammelt es ein, wie '
        + 'man Korn einsammelt, und irgendwo liegt der Speicher.',
  },
  {
    id: 4,
    titel: 'Der Gezeichnete',
    ziel: 'Erlege ein gezeichnetes Wesen',
    wo: 'Gezeichnete tragen einen Beinamen und einen goldenen Ring um sich. '
      + 'Sie laufen nachts und in den rauen Gegenden.',
    rede: 'Und noch etwas: Es gibt Getier, das falsch aussieht. Größer, heller, '
        + 'mit einem Schein um sich, den kein Tier hat.\n\n'
        + 'Die Jäger nennen sie die Gezeichneten und gehen ihnen aus dem Weg. Ich '
        + 'glaube, sie sind voll von dem, was den Steinen fehlt.\n\n'
        + 'Bringt mir Gewissheit. Legt eines.',
    art: 'gezeichnet', menge: 1,
    abschluss: 'Ihr seht mitgenommen aus. Und Ihr habt recht: es hat geleuchtet, '
        + 'als es fiel.\n\nDas Glimm geht nicht verloren. Es wird verteilt — an alles, '
        + 'was in die Nähe von dem kommt, was es einsammelt.',
    frage: 'Habt Ihr etwas mitgenommen? Ein Stück von ihm?',
    wahlen: [
      { id: 'zeigen',   label: 'Hier. Seht Euch das an.',
        unten: 'Wissen ist mehr wert als Andacht.',
        antwort: 'Danke. Ich schreibe es auf, und wenn ich morgen tot umfalle, '
               + 'weiß es wenigstens das Papier.' },
      { id: 'begraben', label: 'Ich habe es begraben.',
        unten: 'Es war einmal ein Tier.',
        antwort: 'Ihr seid ein sonderbarer Mensch. Ich hätte es aufgeschnitten.\n\n'
               + 'Vielleicht ist Eure Art die richtige. Meine hat zehn Jahre nichts '
               + 'gebracht.' },
    ],
  },
  {
    id: 5,
    titel: 'Der Schlund',
    ziel: 'Steig in den Schlund hinab',
    wo: '{richtung} von hier. Von außen ein Loch, von innen eine Gruft ohne Boden.',
    rede: 'Dann wissen wir, wohin. {richtung} von hier liegt ein Schlund, tiefer '
        + 'als alles, was ich kenne. Dorthin zeigen die Steine, dorthin zeigen die '
        + 'Boten, dorthin zeigt jedes Gerede.\n\n'
        + 'Ich bin zu alt, um selbst nachzusehen. Das ist keine Ausrede, das ist '
        + 'eine Tatsache, und sie ärgert mich mehr als alles andere.\n\n'
        + 'Geht hinunter. Und wenn Ihr unten etwas findet, das reden kann — redet.',
    art: 'schlund', menge: 1,
    abschluss: '',
  },
  {
    id: 6,
    titel: 'Der Wächter',
    ziel: 'Stell dich dem, was im Schlund sitzt',
    wo: 'Ganz unten im Schlund.',
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
    schreine: [],         // welche Schreine schon geantwortet haben
    wahl: {},             // was man geantwortet hat — bleibt bis zum Ende stehen
    vorgestellt: false,   // hat man dem Chronisten gesagt, wer man ist?
    fertig: false,
    ende: null,           // 'klinge' oder 'wort'
  };
}

export const aktuell = (st) => (st.fertig ? null : KAPITEL[st.kapitel] || null);

/** Setzt {gruft} und {richtung} im Text ein. */
export function fuellen(text, st, richtung) {
  return (text || '')
    .replaceAll('{gruft}', st.gruftName || 'der alten Gruft')
    .replaceAll('{richtung}', richtung || 'Weit draußen');
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
  if (art === 'schrein') {
    // Derselbe Stein zählt nur einmal, sonst wäre das Kapitel ein Klopfspiel
    if (!daten.id || st.schreine.includes(daten.id)) return false;
    st.schreine.push(daten.id);
    st.ziel = st.schreine.length;
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

/** Die offene Frage eines Kapitels — oder nichts, wenn schon geantwortet. */
export function frageVon(st) {
  const k = aktuell(st);
  if (!k || !k.frage || !k.wahlen) return null;
  if (st.wahl[k.id]) return null;
  return k;
}

/** Was auf eine Frage geantwortet wurde. */
export function antworten(st, kapitelId, wahlId) {
  st.wahl[kapitelId] = wahlId;
}

export const wahlVon = (st, kapitelId) => st.wahl && st.wahl[kapitelId];

/** Darf man mit dem Wächter reden statt zu kämpfen? */
export const darfReden = (held) => (held.hilfen || 0) >= NOETIGE_HILFE;
