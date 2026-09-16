import { B, BLOCKS } from './voxel.js';

/* ==========================================================================
 *  Werkzeuge und Rezepte.
 *
 *  Die Werkzeugstufe ist eine einzige Zahl: sie entscheidet, was der Zwerg
 *  überhaupt abbauen darf (BLOCKS[...].needs) und wie schnell er dabei ist.
 *  Eine bessere Hacke ersetzt die alte — es gibt nichts zu verwalten.
 * ========================================================================== */

export const TOOLS = [
  { name: 'Bloße Hände',     icon: '✋',  speed: 1.0 },
  { name: 'Holzspitzhacke',  icon: '🪓',  speed: 2.0 },
  { name: 'Steinspitzhacke', icon: '⛏️', speed: 3.2 },
  { name: 'Eisenspitzhacke', icon: '⚒️', speed: 4.8 },
];

/** Jedes Rezept gibt entweder Blöcke aus oder hebt die Werkzeugstufe. */
export const RECIPES = [
  { id: 'bretter', name: 'Bretter', hint: 'Baumaterial und Griff für alles Weitere',
    cost: [[B.stamm, 1]], out: [B.bretter, 4] },
  { id: 'fackel', name: 'Fackeln', hint: 'Licht, das im Stollen stehen bleibt',
    cost: [[B.kohle, 1], [B.bretter, 1]], out: [B.fackel, 4] },
  { id: 'hacke1', name: 'Holzspitzhacke', hint: 'Damit geht Stein und Kohle',
    cost: [[B.bretter, 4]], tier: 1 },
  { id: 'hacke2', name: 'Steinspitzhacke', hint: 'Damit geht Eisen',
    cost: [[B.stein, 3], [B.bretter, 3]], tier: 2 },
  { id: 'hacke3', name: 'Eisenspitzhacke', hint: 'Damit geht Gold und Kristall',
    cost: [[B.eisen, 3], [B.bretter, 3]], tier: 3 },
];

/** Welches Werkzeug ein Block mindestens verlangt, als Klartext. */
export function toolFor(block) {
  const needs = BLOCKS[block]?.needs ?? 0;
  return TOOLS[needs]?.name ?? TOOLS[0].name;
}

export function canCraft(recipe, inventory, tier) {
  if (recipe.tier !== undefined && tier >= recipe.tier) return false;
  return recipe.cost.every(([block, n]) => (inventory.get(block) || 0) >= n);
}

/* ------------------------------ Die Werkbank ------------------------------ */
export class CraftPanel {
  /**
   * @param {object} hooks  state, take, give, onTier, onClose — alles, was das
   *                        Panel von außen braucht; es kennt das Spiel sonst nicht.
   */
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks;
    this.open = false;
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
  }

  toggle() { this.open ? this.close() : this.show(); }
  close() { this.open = false; this.root.classList.add('hidden'); this.hooks.onClose?.(); }

  show() {
    this.open = true;
    this.root.classList.remove('hidden');
    this.render();
  }

  render() {
    if (!this.open) return;
    const { state } = this.hooks;
    const box = document.createElement('div');
    box.className = 'craft-box';

    const head = document.createElement('div');
    head.className = 'craft-head';
    head.innerHTML = `<b>Werkbank</b><span>${TOOLS[state.tier].icon} ${TOOLS[state.tier].name}</span>`;
    box.append(head);

    for (const r of RECIPES) {
      if (r.tier !== undefined && state.tier >= r.tier) continue;
      const ok = canCraft(r, state.inventory, state.tier);
      const row = document.createElement('button');
      row.className = 'craft-row' + (ok ? '' : ' off');
      const cost = r.cost.map(([b, n]) => {
        const have = state.inventory.get(b) || 0;
        return `<span class="${have >= n ? 'has' : 'lacks'}">${n}× ${BLOCKS[b].name}</span>`;
      }).join('');
      row.innerHTML = `<div class="craft-name">${r.name}<small>${r.hint}</small></div>`
        + `<div class="craft-cost">${cost}</div>`;
      row.addEventListener('click', () => this.make(r));
      box.append(row);
    }

    const close = document.createElement('button');
    close.className = 'craft-close';
    close.textContent = 'Zurück';
    close.addEventListener('click', () => this.close());
    box.append(close);

    this.root.replaceChildren(box);
  }

  make(recipe) {
    const { state, take, give, onTier, onFail } = this.hooks;
    if (!canCraft(recipe, state.inventory, state.tier)) { onFail?.(recipe); return; }
    for (const [block, n] of recipe.cost) take(block, n);
    if (recipe.tier !== undefined) onTier(recipe.tier);
    else give(recipe.out[0], recipe.out[1]);
    this.render();
  }
}
