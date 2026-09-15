// Beim Stufenaufstieg wählt man aus drei zufälligen Karten eine aus.
// Jede Karte darf mehrfach kommen, bis ihr Maximum erreicht ist.

export const UPGRADES = [
  {
    id: 'doppelschuss', icon: '🏹', max: 2,
    title: 'Doppelschuss',
    text: 'Ein Pfeil mehr pro Schuss',
    apply: (s) => { s.arrows += 1; },
  },
  {
    id: 'schnellehand', icon: '⚡', max: 4,
    title: 'Schnelle Hand',
    text: 'Du schießt 15 % schneller',
    apply: (s) => { s.fireRate *= 0.85; },
  },
  {
    id: 'spitzen', icon: '🔪', max: 4,
    title: 'Scharfe Spitzen',
    text: 'Jeder Pfeil macht mehr Schaden',
    apply: (s) => { s.damage += 1; },
  },
  {
    id: 'durchschlag', icon: '💥', max: 2,
    title: 'Durchschlag',
    text: 'Pfeile fliegen durch einen Gegner hindurch',
    apply: (s) => { s.pierce += 1; },
  },
  {
    id: 'weitsicht', icon: '👁️', max: 3,
    title: 'Weitsicht',
    text: 'Du zielst 3 m weiter',
    apply: (s) => { s.range += 3; },
  },
  {
    id: 'zaeh', icon: '🏮', max: 4,
    title: 'Tiefe Laterne',
    text: '25 mehr Fassungsvermögen, sofort gefüllt',
    apply: (s, player) => { player.hpMax += 25; player.hp = player.hpMax; },
  },
  {
    id: 'schuhe', icon: '🥾', max: 3,
    title: 'Leichte Schuhe',
    text: 'Du läufst 10 % schneller',
    apply: (s, player) => { player.speed *= 1.1; },
  },
  {
    id: 'magnet', icon: '🧲', max: 2,
    title: 'Sammlerglück',
    text: 'Glut fliegt dir weiter entgegen',
    apply: (s) => { s.magnet += 3; },
  },
  {
    id: 'rast', icon: '🍯', max: 99,
    title: 'Lampenöl',
    text: 'Füllt deine Laterne sofort um 50 auf',
    apply: (s, player) => { player.hp = Math.min(player.hpMax, player.hp + 50); },
  },
];

export function freshStats() {
  return {
    level: 1,
    xp: 0,
    xpNeed: 4,
    arrows: 1,
    spread: 0.17,
    fireRate: 0.42,
    damage: 1,
    pierce: 0,
    range: 17,
    magnet: 4.5,
    taken: {},
  };
}

export function pickThree(stats) {
  const pool = UPGRADES.filter((u) => (stats.taken[u.id] || 0) < u.max);
  const out = [];
  while (out.length < 3 && pool.length) {
    out.push(pool.splice((Math.random() * pool.length) | 0, 1)[0]);
  }
  return out;
}

export function applyUpgrade(up, stats, player) {
  stats.taken[up.id] = (stats.taken[up.id] || 0) + 1;
  up.apply(stats, player);
}

// Erfahrung bis zur nächsten Stufe – wächst ruhig, nicht explosiv.
export function xpForLevel(level) {
  return 4 + Math.round(level * 2.6);
}
