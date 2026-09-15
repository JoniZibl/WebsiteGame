// Was über einen Lauf hinaus bleibt: gesammelte Edelsteine, gekaufte
// Verbesserungen und der beste Lauf. Alles in localStorage, defensiv gelesen —
// im privaten Modus darf der Zugriff auch fehlschlagen.

const KEY = 'cozy-grove-save-1';

export const PERKS = [
  { id: 'leben',   icon: '🫀', title: 'Zähe Haut',      text: '+20 Leben zu Beginn',              max: 5, cost: (n) => 12 + n * 10 },
  { id: 'schaden', icon: '🔪', title: 'Harter Kern',    text: '+1 Grundschaden',                  max: 4, cost: (n) => 18 + n * 14 },
  { id: 'pfeil',   icon: '🏹', title: 'Zweiter Pfeil',  text: 'Ein Pfeil mehr von Anfang an',     max: 1, cost: () => 70 },
  { id: 'tempo',   icon: '🥾', title: 'Wanderstiefel',  text: '+6 % Lauftempo',                   max: 4, cost: (n) => 15 + n * 10 },
  { id: 'glueck',  icon: '🍀', title: 'Glückssteine',   text: 'Gegner lassen öfter zwei Steine fallen', max: 3, cost: (n) => 25 + n * 18 },
];

const EMPTY = { gems: 0, perks: {}, best: { level: 1, gems: 0, bosses: 0 } };

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const data = JSON.parse(raw);
    return {
      gems: Math.max(0, data.gems | 0),
      perks: data.perks && typeof data.perks === 'object' ? data.perks : {},
      best: {
        level: Math.max(1, data.best?.level | 0),
        gems: Math.max(0, data.best?.gems | 0),
        bosses: Math.max(0, data.best?.bosses | 0),
      },
    };
  } catch (err) {
    return structuredClone(EMPTY);
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (err) {
    /* kein Speicher verfügbar – das Spiel läuft trotzdem weiter */
  }
}

export function perkLevel(data, id) { return data.perks[id] | 0; }

export function perkCost(perk, data) {
  const n = perkLevel(data, perk.id);
  return n >= perk.max ? null : perk.cost(n);
}

export function buyPerk(data, perk) {
  const cost = perkCost(perk, data);
  if (cost === null || data.gems < cost) return false;
  data.gems -= cost;
  data.perks[perk.id] = perkLevel(data, perk.id) + 1;
  save(data);
  return true;
}

/** Werte eines neuen Laufs aus den gekauften Verbesserungen. */
export function applyPerks(data, stats, player) {
  player.hpMax = 100 + perkLevel(data, 'leben') * 20;
  player.hp = player.hpMax;
  stats.damage += perkLevel(data, 'schaden');
  stats.arrows += perkLevel(data, 'pfeil');
  player.speed = player.baseSpeed * (1 + perkLevel(data, 'tempo') * 0.06);
  stats.luck = perkLevel(data, 'glueck') * 0.2;
}

export function recordRun(data, level, gems, bosses) {
  data.best.level = Math.max(data.best.level, level);
  data.best.gems = Math.max(data.best.gems, gems);
  data.best.bosses = Math.max(data.best.bosses, bosses);
  save(data);
}
