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

  /* Zwei Bogenspuren und ein Abdruck: ein Satz zur Seite. */
  rolle: svg(`
    <path d="M4 15 C7 9 12 7 18 8" fill="none" stroke="${F.putz}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M6 20 C9 14 14 12 20 13" fill="none" stroke="${F.putz}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>
    <circle cx="18" cy="8" r="3.2" fill="${F.putz}"/>`),

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
