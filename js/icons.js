/* ==========================================================================
 *  Die Symbole.
 *
 *  Emoji sind glänzende Fremdkörper auf einer Welt aus flachen Farbflächen —
 *  sie bringen Verläufe, Schlagschatten und einen ganz anderen Strich mit.
 *  Diese hier sind aus denselben wenigen Farben gebaut wie die Häuser: Holz,
 *  Putz, Terrakotta, Salbei. Ein Viewport von 24×24, keine Verläufe.
 * ========================================================================== */

const F = {
  holz:   '#a8743f',
  putzTief: '#efe0c6',
  holzTief: '#7d5227',
  putz:   '#fdf6e8',
  stahl:  '#d8dde2',
  stahlTief: '#9aa3ab',
  terra:  '#c9543f',
  salbei: '#7fae5e',
  gold:   '#e8a83c',
  blau:   '#5e8aa8',
  tinte:  '#4a3b30',
};

const svg = (inhalt) =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">${inhalt}</svg>`;

export const ICONS = {
  /* Ein Schwert von oben: Klinge, Parierstange, Griff, Knauf. */
  schwert: svg(`
    <path d="M12 2 L14.6 6 L14.6 14 L9.4 14 L9.4 6 Z" fill="${F.stahl}"/>
    <path d="M12 2 L14.6 6 L12 6 Z" fill="${F.stahlTief}"/>
    <rect x="6.4" y="14" width="11.2" height="2.4" rx="1.1" fill="${F.holz}"/>
    <rect x="10.7" y="16.4" width="2.6" height="4.2" fill="${F.holzTief}"/>
    <circle cx="12" cy="21" r="1.7" fill="${F.gold}"/>`),

  /* Ein gespannter Bogen mit Pfeil auf der Sehne. */
  bogen: svg(`
    <path d="M7 3 C14 7 14 17 7 21" fill="none" stroke="${F.holz}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M7 3 L7 21" fill="none" stroke="${F.putz}" stroke-width="1.1"/>
    <rect x="7" y="11.1" width="12.4" height="1.8" rx="0.7" fill="${F.stahl}"/>
    <path d="M19.4 12 L15.6 9.6 L15.6 14.4 Z" fill="${F.stahlTief}"/>`),

  /* Vier Strahlen als Funke — ohne Verlauf, nur zwei Größen. */
  /* Hell gehalten: dieser Funke sitzt auf einem blauen Knopf. */
  funke: svg(`
    <path d="M12 2 L13.6 9 L20.5 10.6 L13.6 12.2 L12 19.2 L10.4 12.2 L3.5 10.6 L10.4 9 Z" fill="${F.putz}"/>
    <path d="M12 6.4 L12.8 9.8 L16.2 10.6 L12.8 11.4 L12 14.8 L11.2 11.4 L7.8 10.6 L11.2 9.8 Z" fill="${F.gold}"/>
    <path d="M18.4 15.2 L19.2 18 L22 18.8 L19.2 19.6 L18.4 22.4 L17.6 19.6 L14.8 18.8 L17.6 18 Z" fill="${F.putz}" opacity=".85"/>`),

  /* Ein Fläschchen mit Korken. */
  trank: svg(`
    <rect x="10" y="2.2" width="4" height="3" rx="0.8" fill="${F.holz}"/>
    <path d="M10.4 5.2 h3.2 v3.4 l3.2 5.6 a4.6 4.6 0 0 1 -4 7 h-1.6 a4.6 4.6 0 0 1 -4 -7 l3.2 -5.6 Z" fill="${F.putz}"/>
    <path d="M7.9 14.6 a4.6 4.6 0 0 0 3.3 6.6 h1.6 a4.6 4.6 0 0 0 3.3 -6.6 Z" fill="${F.terra}"/>`),

  /* Sprechblase mit drei Punkten. */
  rede: svg(`
    <path d="M3.4 5.4 a2 2 0 0 1 2 -2 h13.2 a2 2 0 0 1 2 2 v8.4 a2 2 0 0 1 -2 2 H10.4 L6 20 v-4.2 H5.4 a2 2 0 0 1 -2 -2 Z" fill="${F.putz}"/>
    <circle cx="8.4" cy="9.6" r="1.3" fill="${F.tinte}"/>
    <circle cx="12" cy="9.6" r="1.3" fill="${F.tinte}"/>
    <circle cx="15.6" cy="9.6" r="1.3" fill="${F.tinte}"/>`),

  /* Truhe mit Beschlag. */
  truhe: svg(`
    <path d="M3 10 a4.2 4.2 0 0 1 4.2 -4.2 h9.6 A4.2 4.2 0 0 1 21 10 v1.2 H3 Z" fill="${F.holz}"/>
    <rect x="3" y="11.2" width="18" height="7.6" rx="1.2" fill="${F.holzTief}"/>
    <rect x="10.4" y="8.4" width="3.2" height="7" rx="0.7" fill="${F.gold}"/>
    <circle cx="12" cy="13.4" r="1.1" fill="${F.holzTief}"/>`),

  /* Ein Torbogen — der Eingang zur Gruft. */
  tor: svg(`
    <rect x="2.6" y="19" width="18.8" height="2.6" rx="0.6" fill="${F.stahlTief}"/>
    <path d="M5.6 19 V11 a6.4 6.4 0 0 1 12.8 0 v8 Z" fill="${F.putz}"/>
    <path d="M8.6 19 v-7.4 a3.4 3.4 0 0 1 6.8 0 V19 Z" fill="${F.tinte}"/>`),

  /* Kerze mit Flamme — der Wächter. */
  kerze: svg(`
    <path d="M12 2.4 c2.2 2.6 3.2 4.2 3.2 5.8 a3.2 3.2 0 0 1 -6.4 0 c0 -1.6 1 -3.2 3.2 -5.8 Z" fill="${F.gold}"/>
    <rect x="9.4" y="11" width="5.2" height="9.4" rx="1" fill="${F.putz}"/>
    <rect x="7.4" y="20" width="9.2" height="2.2" rx="0.8" fill="${F.holz}"/>`),

  /* Ein Kristall im Fels. */
  kristall: svg(`
    <path d="M12 2.4 L18.6 9 L12 21.6 L5.4 9 Z" fill="${F.gold}"/>
    <path d="M12 2.4 L18.6 9 L12 21.6 Z" fill="${F.holz}" opacity=".35"/>
    <path d="M5.4 9 H18.6" stroke="${F.putz}" stroke-width="1.1" opacity=".55"/>`),

  /* Ein Ranzen. */
  beutel: svg(`
    <path d="M8.4 6.4 V5 a3.6 3.6 0 0 1 7.2 0 v1.4" fill="none" stroke="${F.holzTief}" stroke-width="1.8"/>
    <rect x="3.6" y="6.4" width="16.8" height="14.4" rx="3" fill="${F.holz}"/>
    <rect x="3.6" y="11.6" width="16.8" height="4" fill="${F.holzTief}"/>
    <rect x="10.4" y="10.4" width="3.2" height="6.4" rx="1" fill="${F.gold}"/>`),

  /* Lautsprecher, an und aus. */
  tonAn: svg(`
    <path d="M4 9.2 h3.6 L12.4 5 v14 L7.6 14.8 H4 Z" fill="${F.tinte}"/>
    <path d="M15.4 8.6 a4.8 4.8 0 0 1 0 6.8" fill="none" stroke="${F.tinte}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M18 6 a8.4 8.4 0 0 1 0 12" fill="none" stroke="${F.tinte}" stroke-width="1.8" stroke-linecap="round" opacity=".55"/>`),
  tonAus: svg(`
    <path d="M4 9.2 h3.6 L12.4 5 v14 L7.6 14.8 H4 Z" fill="${F.tinte}"/>
    <path d="M15.6 9.4 L20.4 14.6 M20.4 9.4 L15.6 14.6" stroke="${F.tinte}" stroke-width="1.9" stroke-linecap="round"/>`),

  /* Sonne für die Grafikstufe. */
  glanz: svg(`
    <circle cx="12" cy="12" r="4.4" fill="${F.gold}"/>
    <g stroke="${F.gold}" stroke-width="1.9" stroke-linecap="round">
      <path d="M12 2.6 v2.6 M12 18.8 v2.6 M2.6 12 h2.6 M18.8 12 h2.6"/>
      <path d="M5.4 5.4 l1.9 1.9 M16.7 16.7 l1.9 1.9 M18.6 5.4 l-1.9 1.9 M7.3 16.7 l-1.9 1.9" opacity=".7"/>
    </g>`),

  /* Ein Schild — steht für alles, was man am Leib trägt. */
  schild: svg(`
    <path d="M12 2.2 L20 5 v6.6 c0 4.6 -3.2 8.4 -8 10.2 c-4.8 -1.8 -8 -5.6 -8 -10.2 V5 Z" fill="${F.stahl}"/>
    <path d="M12 2.2 L20 5 v6.6 c0 4.6 -3.2 8.4 -8 10.2 Z" fill="${F.stahlTief}"/>
    <path d="M12 6.4 L16.2 8 v3.6 c0 2.5 -1.7 4.6 -4.2 5.6 c-2.5 -1 -4.2 -3.1 -4.2 -5.6 V8 Z" fill="${F.terra}"/>`),

  /* Ein Ring mit Stein. */
  ring: svg(`
    <circle cx="12" cy="14.4" r="6.6" fill="none" stroke="${F.gold}" stroke-width="2.6"/>
    <path d="M12 2.6 L15.4 6.4 L12 10.2 L8.6 6.4 Z" fill="${F.blau}"/>`),

  /* Ein Fell. */
  fell: svg(`
    <path d="M6 4.6 c2.4 -1.6 9.6 -1.6 12 0 c1.6 3 1.2 7.2 -0.8 9.6 c-.4 3.2 .6 5 -1.2 6.4 c-2 1.6 -6 1.6 -8 0 c-1.8 -1.4 -.8 -3.2 -1.2 -6.4 C4.8 11.8 4.4 7.6 6 4.6 Z" fill="${F.holz}"/>
    <path d="M9 8.2 c1.6 -1 4.4 -1 6 0 c1 1.8 .8 4.4 -.6 5.8 c-1.4 1 -3.4 1 -4.8 0 C8.2 12.6 8 10 9 8.2 Z" fill="${F.putz}" opacity=".55"/>`),

  /* Ein Knochen. */
  knochen: svg(`
    <rect x="6" y="10.6" width="12" height="2.8" rx="1.4" transform="rotate(-28 12 12)" fill="${F.putz}"/>
    <circle cx="6.6" cy="16.4" r="2.6" fill="${F.putz}"/>
    <circle cx="8.6" cy="18.4" r="2.2" fill="${F.putz}"/>
    <circle cx="17.4" cy="7.6" r="2.6" fill="${F.putz}"/>
    <circle cx="15.4" cy="5.6" r="2.2" fill="${F.putz}"/>`),

  /* Ein Becher. */
  becher: svg(`
    <path d="M7 3.4 h10 v4.2 a5 5 0 0 1 -10 0 Z" fill="${F.stahl}"/>
    <rect x="10.8" y="12.4" width="2.4" height="4.6" fill="${F.stahlTief}"/>
    <rect x="7.4" y="17" width="9.2" height="2.6" rx="1" fill="${F.stahl}"/>
    <path d="M17 4.6 a2.8 2.8 0 0 1 0 4.6" fill="none" stroke="${F.stahlTief}" stroke-width="1.5"/>`),

  /* Ein gesiegeltes Schriftstück. */
  siegel: svg(`
    <rect x="5" y="3.4" width="14" height="15.4" rx="1.4" fill="${F.putz}"/>
    <g stroke="${F.tinte}" stroke-width="1.2" opacity=".45" stroke-linecap="round">
      <path d="M8 7.4 h8 M8 10.4 h8 M8 13.4 h5"/>
    </g>
    <circle cx="16.4" cy="17.6" r="3.6" fill="${F.terra}"/>`),

  /* Ein Auge — Spüren. */
  auge: svg(`
    <path d="M2.4 12 c3 -4.4 6.4 -6.6 9.6 -6.6 s6.6 2.2 9.6 6.6 c-3 4.4 -6.4 6.6 -9.6 6.6 S5.4 16.4 2.4 12 Z" fill="${F.putz}"/>
    <circle cx="12" cy="12" r="3.6" fill="${F.blau}"/>
    <circle cx="12" cy="12" r="1.5" fill="${F.tinte}"/>`),

  /* Ein Stiefel — Wandern. */
  stiefel: svg(`
    <path d="M8 3.2 h4.2 v7.4 l5.8 3.6 a3 3 0 0 1 1.4 2.6 v2 a1.6 1.6 0 0 1 -1.6 1.6 H5.6 A1.6 1.6 0 0 1 4 18.8 V4.8 A1.6 1.6 0 0 1 5.6 3.2 Z" fill="${F.holz}"/>
    <rect x="4" y="17.6" width="15.4" height="2.8" rx="1.2" fill="${F.holzTief}"/>`),

  /* Eine Axt von oben: Stiel, Blatt, Nacken. */
  axt: svg(`
    <rect x="10.8" y="2.6" width="2.4" height="18.8" rx="1.1" fill="${F.holz}"/>
    <path d="M13 3.6 C18.4 5 21 8.4 20.6 12.6 C18.6 11 15.8 10.4 13 10.6 Z" fill="${F.stahl}"/>
    <path d="M13 3.6 C16.2 4.5 18.4 6.2 19.6 8.4 C17.6 7.4 15.2 6.9 13 6.8 Z" fill="${F.stahlTief}"/>
    <rect x="9.6" y="9.6" width="3.6" height="2" rx="0.8" fill="${F.holzTief}"/>`),

  /* Zwei Scheite übereinander, von der Stirnseite gesehen: ein Klafter Holz. */
  holz: svg(`
    <rect x="3" y="13" width="18" height="8.4" rx="4.2" fill="${F.holz}"/>
    <circle cx="7.2" cy="17.2" r="4.2" fill="${F.putzTief}"/>
    <circle cx="7.2" cy="17.2" r="2.2" fill="${F.holzTief}"/>
    <rect x="5.6" y="2.6" width="16.4" height="8" rx="4" fill="${F.holzTief}"/>
    <circle cx="9.6" cy="6.6" r="4" fill="${F.putzTief}"/>
    <circle cx="9.6" cy="6.6" r="2.1" fill="${F.holz}"/>`),

  /* Zwei Brocken Stein, kantig gebrochen. */
  brocken: svg(`
    <path d="M3.2 14.4 L7.4 10.6 L13.4 11.4 L15 16.6 L10.4 20.4 L4.2 19 Z" fill="${F.stahlTief}"/>
    <path d="M7.4 10.6 L13.4 11.4 L10.4 14.4 Z" fill="${F.stahl}"/>
    <path d="M13.6 4.2 L18.8 3.4 L21.2 7.6 L18.4 11.2 L14 10.4 L12.6 6.8 Z" fill="${F.stahl}"/>
    <path d="M13.6 4.2 L18.8 3.4 L16.4 7 Z" fill="${F.stahlTief}"/>`),

  /* Ein Klumpen Eisen: rostrot, mit hellen Bruchflächen. */
  eisenerz: svg(`
    <path d="M4.6 12.4 L8.4 7.2 L15.2 6.4 L19.8 10.4 L18.2 17.4 L11 20.6 L5.4 18 Z" fill="#a2674a"/>
    <path d="M8.4 7.2 L15.2 6.4 L13.4 11.2 Z" fill="#c08160"/>
    <path d="M13.4 11.2 L19.8 10.4 L18.2 17.4 Z" fill="#8a5539"/>
    <circle cx="9.4" cy="14.6" r="1.5" fill="#d8a184"/>
    <circle cx="14.4" cy="16.2" r="1.1" fill="#d8a184"/>`),

  /* Schwefel: gelbe Kristallnester im Bruch. */
  schwefel: svg(`
    <path d="M3.6 14.2 L7.4 8.6 L16.4 8 L20.4 12.8 L18 19 L7.2 19.4 Z" fill="#8a7f70"/>
    <path d="M9 12.4 L11.6 8.2 L14.2 12.4 L11.6 16.2 Z" fill="#d9c04a"/>
    <path d="M11.6 8.2 L14.2 12.4 L11.6 16.2 Z" fill="#b39f32"/>
    <path d="M15 14.4 L16.8 11.6 L18.6 14.4 L16.8 17.2 Z" fill="#e8d46a"/>
    <path d="M5.8 15.2 L7.2 12.8 L8.6 15.2 L7.2 17.6 Z" fill="#e8d46a"/>`),

  /* Ein Seil, in Schlaufen aufgeschossen. */
  seil: svg(`
    <ellipse cx="12" cy="13.6" rx="8.4" ry="6.2" fill="none" stroke="${F.holz}" stroke-width="2.6"/>
    <ellipse cx="12" cy="13.6" rx="4.2" ry="2.8" fill="none" stroke="${F.holzTief}" stroke-width="2.2"/>
    <path d="M6.2 8.6 C7.6 5.2 10.4 3.4 13.2 4.2 C15.4 4.8 16.2 6.6 15.4 8"
          fill="none" stroke="${F.holz}" stroke-width="2.4" stroke-linecap="round"/>`),

  /* Eine Bahn Segeltuch, gerollt. */
  tuch: svg(`
    <path d="M3.4 6.2 C7 4.6 10 4.6 13.6 6.2 L13.6 18.6 C10 17 7 17 3.4 18.6 Z" fill="${F.putz}"/>
    <path d="M13.6 6.2 C16 5.1 18.4 4.8 20.6 5.4 L20.6 17.8 C18.4 17.2 16 17.5 13.6 18.6 Z" fill="${F.stahl}"/>
    <path d="M6.2 9 C8 8.4 9.8 8.5 11.4 9.2" fill="none" stroke="${F.holz}" stroke-width=".9" opacity=".5"/>
    <path d="M6.2 12.4 C8 11.8 9.8 11.9 11.4 12.6" fill="none" stroke="${F.holz}" stroke-width=".9" opacity=".5"/>
    <path d="M15.6 8.6 C17.2 8.1 18.6 8 19.6 8.2" fill="none" stroke="${F.holzTief}" stroke-width=".9" opacity=".45"/>`),

  /* Ein Werktisch von der Seite: Platte, Beine, eine Säge darauf. */
  werktisch: svg(`
    <path d="M4.6 8.2 L10.6 5.2 L19.8 8.6 L13.4 11.4 Z" fill="${F.stahlTief}"/>
    <path d="M6.2 7.6 L10.8 6.4 L10.4 7.6 Z" fill="${F.stahl}"/>
    <rect x="1.6" y="10.4" width="20.8" height="3" rx="1.2" fill="${F.holz}"/>
    <rect x="1.6" y="12.6" width="20.8" height="1.2" fill="${F.holzTief}"/>
    <rect x="3.4" y="13.6" width="2.6" height="7.8" rx="1" fill="${F.holzTief}"/>
    <rect x="18" y="13.6" width="2.6" height="7.8" rx="1" fill="${F.holzTief}"/>
    <rect x="5" y="16.4" width="14" height="1.8" rx=".8" fill="${F.holz}"/>`),

  /* Ein Ballon: Hülle mit Bahnen, Seile, Korb. */
  ballon: svg(`
    <path d="M12 1.6 C17.2 1.6 20.6 5.6 20.6 9.6 C20.6 13 17.6 15.6 14.6 16.8 L9.4 16.8
             C6.4 15.6 3.4 13 3.4 9.6 C3.4 5.6 6.8 1.6 12 1.6 Z" fill="${F.terra}"/>
    <path d="M12 1.6 C13.9 1.6 15.4 5.2 15.4 9.6 C15.4 12.6 14.7 15.2 13.8 16.8 L10.2 16.8
             C9.3 15.2 8.6 12.6 8.6 9.6 C8.6 5.2 10.1 1.6 12 1.6 Z" fill="${F.putz}"/>
    <path d="M9.6 16.8 L9 19.6 M14.4 16.8 L15 19.6" stroke="${F.holzTief}" stroke-width="1.1"/>
    <rect x="8.4" y="19.2" width="7.2" height="3.4" rx="1" fill="${F.holz}"/>
    <rect x="8" y="18.9" width="8" height="1.3" rx="0.6" fill="${F.holzTief}"/>`),

  /* Ein Zelt neben dem Feuer: das Lager. */
  lager: svg(`
    <path d="M9 3.8 L16.6 18.2 L1.4 18.2 Z" fill="${F.holz}"/>
    <path d="M9 3.8 L9 18.2 L1.4 18.2 Z" fill="${F.holzTief}"/>
    <rect x="1" y="18" width="16" height="2.2" rx="1" fill="${F.holzTief}"/>
    <path d="M20 11.4 L22.6 16.4 L17.4 16.4 Z" fill="${F.gold}"/>
    <path d="M20 13.6 L21.6 16.4 L18.4 16.4 Z" fill="${F.terra}"/>
    <rect x="16.4" y="16.2" width="7.2" height="2" rx="1" fill="${F.holzTief}"/>`),

  /* Ein Speer: langer Schaft, schmale Spitze, Wicklung. */
  speer: svg(`
    <rect x="11" y="6.4" width="2" height="15" rx="0.9" fill="${F.holz}"/>
    <path d="M12 1.4 L15 7.2 L12 9.2 L9 7.2 Z" fill="${F.stahl}"/>
    <path d="M12 1.4 L15 7.2 L12 9.2 Z" fill="${F.stahlTief}"/>
    <rect x="9.8" y="9.6" width="4.4" height="1.5" rx="0.7" fill="${F.holzTief}"/>
    <rect x="9.8" y="12" width="4.4" height="1.5" rx="0.7" fill="${F.holzTief}"/>`),

  /* Ein Streitkolben: Stiel und ein schwerer, gezackter Kopf. */
  kolben: svg(`
    <rect x="10.9" y="9" width="2.2" height="12.4" rx="1" fill="${F.holz}"/>
    <path d="M12 1.6 L16.6 4.2 L16.6 9.4 L12 12 L7.4 9.4 L7.4 4.2 Z" fill="${F.stahl}"/>
    <path d="M12 6.8 L16.6 4.2 L16.6 9.4 L12 12 Z" fill="${F.stahlTief}"/>
    <rect x="9.6" y="20.4" width="4.8" height="2" rx="0.9" fill="${F.holzTief}"/>`),

  /* Ein aufgeschlagenes Buch — daraus lernt man einen Zauber. */
  buch: svg(`
    <path d="M2.6 5.4 C6 4 9.4 4.2 12 6 L12 20 C9.4 18.2 6 18 2.6 19.4 Z" fill="${F.putz}"/>
    <path d="M21.4 5.4 C18 4 14.6 4.2 12 6 L12 20 C14.6 18.2 18 18 21.4 19.4 Z" fill="${F.stahl}"/>
    <path d="M11.2 5.6 h1.6 v14.8 h-1.6 Z" fill="${F.holzTief}"/>
    <path d="M4.6 8.6 C6.6 8 8.4 8.2 10 9" fill="none" stroke="${F.holz}" stroke-width="1" opacity=".55"/>
    <path d="M14 9 C15.6 8.2 17.4 8 19.4 8.6" fill="none" stroke="${F.holz}" stroke-width="1" opacity=".55"/>`),

  /* ----------------------------- Zauberzeichen -----------------------------
   * Jeder Zauber trägt sein eigenes Zeichen — auf dem Knopf sieht man, was
   * gleich passiert, ohne den Namen zu lesen.
   * ---------------------------------------------------------------------- */

  /* Steinsplitter: drei Scherben nach außen. */
  splitter: svg(`
    <path d="M12 2.4 L15.4 9.6 L12 12.6 L8.6 9.6 Z" fill="${F.stahlTief}"/>
    <path d="M4.4 12.4 L10.4 13.6 L9.4 19.4 L5 16.6 Z" fill="${F.holzTief}"/>
    <path d="M19.6 12.4 L13.6 13.6 L14.6 19.4 L19 16.6 Z" fill="${F.holzTief}"/>`),

  /* Eislanze: ein Kristallsplitter mit Frostkanten. */
  eis: svg(`
    <path d="M12 1.8 L16 10 L12 22.2 L8 10 Z" fill="#bfe4ef"/>
    <path d="M12 1.8 L16 10 L12 22.2 Z" fill="#7fb8cf"/>
    <path d="M4.4 7.4 L9.4 11 M19.6 7.4 L14.6 11" stroke="${F.putz}" stroke-width="1.5" stroke-linecap="round"/>`),

  /* Flammenhauch: eine Zunge Feuer. */
  flamme: svg(`
    <path d="M12 1.6 C16.6 6.4 19 10 19 13.8 A7 7 0 0 1 5 13.8 C5 10.6 6.6 8.4 8.4 6.6 C8.2 9 9 10.4 10.2 11 C10 7.6 10.6 4.4 12 1.6 Z" fill="#e0654b"/>
    <path d="M12 9.4 C14.4 12 15.4 13.8 15.4 15.4 A3.4 3.4 0 0 1 8.6 15.4 C8.6 13.8 10 11.8 12 9.4 Z" fill="${F.gold}"/>`),

  /* Balsam: ein Blatt mit einem Tropfen — das heilt. */
  balsam: svg(`
    <path d="M19.4 4 C11 4 5.6 7.4 5.6 13.6 C5.6 16.8 7.4 19 10 19.6 C11.4 12.8 15 8.6 19.4 4 Z" fill="${F.salbei}"/>
    <path d="M19.4 4 C15 8.6 11.4 12.8 10 19.6 C9.4 15.4 12 8.6 19.4 4 Z" fill="#5c8a42"/>
    <path d="M6.4 20.4 C4.6 18.6 4 17 4 15.6" fill="none" stroke="#5c8a42" stroke-width="1.6" stroke-linecap="round"/>`),

  /* Steinhaut: ein Schild aus Bruchstein. */
  steinhaut: svg(`
    <path d="M12 2.2 L20 5 V12 C20 17 16.6 20.4 12 21.8 C7.4 20.4 4 17 4 12 V5 Z" fill="#9aa3ab"/>
    <path d="M12 2.2 L20 5 V12 C20 17 16.6 20.4 12 21.8 Z" fill="#7d868e"/>
    <path d="M12 6.4 L15.6 9.4 L14.2 14 H9.8 L8.4 9.4 Z" fill="${F.putz}" opacity=".7"/>`),

  /* Schreckensruf: ein Mund und drei Schallringe. */
  ruf: svg(`
    <path d="M4 9.4 L8.2 9.4 L12.6 5.2 V18.8 L8.2 14.6 L4 14.6 Z" fill="${F.putz}"/>
    <path d="M15.2 8.4 C17 10.4 17 13.6 15.2 15.6" fill="none" stroke="${F.gold}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M18 5.8 C21.2 9 21.2 15 18 18.2" fill="none" stroke="${F.gold}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`),

  /* Blitzkette: der Zickzack. */
  blitz: svg(`
    <path d="M13.6 1.6 L5.6 13 H10.8 L9.4 22.4 L18.4 10.2 H12.8 Z" fill="${F.gold}"/>
    <path d="M13.6 1.6 L5.6 13 H10.8 Z" fill="${F.putz}" opacity=".8"/>`),

  /* Himmelssturm: eine Wolke, aus der es zuckt. */
  sturm: svg(`
    <path d="M6.6 13.6 A4 4 0 0 1 7.6 5.8 A5.4 5.4 0 0 1 17.6 6.8 A3.6 3.6 0 0 1 17.2 13.6 Z" fill="#8f9aa4"/>
    <path d="M12.8 12.4 L8.4 18.4 H11.4 L10.4 23 L15.4 16.4 H12.2 Z" fill="${F.gold}"/>
    <path d="M5.4 16.4 L4 19.6 M19 16.4 L17.6 19.6" stroke="#8f9aa4" stroke-width="1.6" stroke-linecap="round"/>`),

  /* Ascheregen: Körner, die fallen. */
  asche: svg(`
    <path d="M5.4 10.6 A3.6 3.6 0 0 1 6.6 3.8 A5 5 0 0 1 16 4.8 A3.2 3.2 0 0 1 15.8 10.6 Z" fill="#7d6a5e"/>
    <circle cx="7" cy="14.4" r="1.7" fill="#e0654b"/>
    <circle cx="12.4" cy="17.4" r="2.1" fill="#e0654b"/>
    <circle cx="17.6" cy="13.6" r="1.5" fill="${F.gold}"/>
    <circle cx="15" cy="21" r="1.3" fill="#e0654b" opacity=".7"/>`),

  /* Ein Anschlag mit Siegel — die Aufträge. */
  schriftrolle: svg(`
    <rect x="4.4" y="2.8" width="15.2" height="18.4" rx="2.2" fill="${F.putz}"/>
    <rect x="4.4" y="2.8" width="15.2" height="4.2" rx="2.2" fill="${F.holz}"/>
    <path d="M7.6 11 h8.8 M7.6 14.2 h8.8 M7.6 17.4 h5" stroke="${F.holzTief}" stroke-width="1.7" stroke-linecap="round"/>
    <circle cx="17.4" cy="18.4" r="3.1" fill="${F.terra}"/>`),

  /* Ein gefaltetes Kartenblatt. */
  landkarte: svg(`
    <path d="M2.6 6.2 L9 4 v14 l-6.4 2.2 Z" fill="${F.salbei}"/>
    <path d="M9 4 l6 2.2 v14 L9 18 Z" fill="${F.putz}"/>
    <path d="M15 6.2 L21.4 4 v14 L15 20.2 Z" fill="${F.holz}"/>
    <path d="M6 10.4 C8 12 9.4 13.6 10.6 16.4" fill="none" stroke="${F.putz}" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>
    <circle cx="16.8" cy="11" r="1.9" fill="${F.terra}"/>`),

  /* Eine Pranke — das Bestiarium. */
  pfote: svg(`
    <ellipse cx="12" cy="16.2" rx="5.4" ry="4.4" fill="${F.holz}"/>
    <ellipse cx="6.4" cy="11.4" rx="2.3" ry="2.8" fill="${F.holzTief}"/>
    <ellipse cx="10.2" cy="8" rx="2.2" ry="2.8" fill="${F.holzTief}"/>
    <ellipse cx="14.6" cy="8" rx="2.2" ry="2.8" fill="${F.holzTief}"/>
    <ellipse cx="18.2" cy="11.6" rx="2.2" ry="2.7" fill="${F.holzTief}"/>`),

  /* Die Windrose auf dem Kartenblatt: eine Spitze nach Norden. */
  rose: svg(`
    <circle cx="12" cy="12" r="9.4" fill="none" stroke="${F.holz}" stroke-width="1.4" opacity=".55"/>
    <path d="M12 2.6 L14.6 12 L12 21.4 L9.4 12 Z" fill="${F.putz}"/>
    <path d="M12 2.6 L14.6 12 L12 12 Z" fill="${F.terra}"/>
    <path d="M12 12 L9.4 12 L12 21.4 Z" fill="${F.holzTief}" opacity=".5"/>
    <path d="M2.6 12 h4.4 M17 12 h4.4" stroke="${F.holz}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>`),

  /* Eine Münze. */
  muenze: svg(`
    <circle cx="12" cy="12" r="9" fill="${F.gold}"/>
    <circle cx="12" cy="12" r="6.2" fill="none" stroke="${F.holzTief}" stroke-width="1.4" opacity=".5"/>`),
};

/** Setzt ein Symbol in ein Element. */
export function symbol(el, name) {
  if (!el) return;
  el.innerHTML = ICONS[name] || '';
}
