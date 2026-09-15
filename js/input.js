// Ein Eingabe-Objekt für Touch und Tastatur.
// Wichtig für das Archero-Gefühl: solange `active` true ist, läuft man –
// sobald losgelassen wird, greift die Spielfigur automatisch an.

export class Input {
  constructor() {
    this.dir = { x: 0, y: 0 };   // normalisierte Laufrichtung (Bildschirmachsen)
    this.strength = 0;           // 0..1
    this.active = false;
    this.keys = new Set();

    this.el = document.getElementById('stick');
    this.base = document.getElementById('stickBase');
    this.nub = document.getElementById('stickNub');
    this.pointerId = null;
    this.origin = { x: 0, y: 0 };
    this.maxRadius = 58;

    this._bind();
  }

  _bind() {
    const canvas = document.getElementById('scene');

    const down = (e) => {
      if (this.pointerId !== null) return;
      if (e.target.closest('button')) return;
      this.pointerId = e.pointerId;
      this.origin.x = e.clientX;
      this.origin.y = e.clientY;
      this._place(e.clientX, e.clientY, e.clientX, e.clientY);
      this.el.classList.remove('hidden');
      canvas.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    };

    const move = (e) => {
      if (e.pointerId !== this.pointerId) return;
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const len = Math.hypot(dx, dy);

      // Stick "mitziehen", wenn der Finger weit rausläuft
      if (len > this.maxRadius) {
        this.origin.x += dx * (1 - this.maxRadius / len);
        this.origin.y += dy * (1 - this.maxRadius / len);
        dx *= this.maxRadius / len;
        dy *= this.maxRadius / len;
      }

      const dead = 6;
      const l2 = Math.hypot(dx, dy);
      if (l2 > dead) {
        this.dir.x = dx / l2;
        this.dir.y = dy / l2;
        this.strength = Math.min(1, (l2 - dead) / (this.maxRadius - dead));
        this.active = true;
      } else {
        this.strength = 0;
        this.active = false;
      }
      this._place(this.origin.x, this.origin.y, this.origin.x + dx, this.origin.y + dy);
      e.preventDefault();
    };

    const up = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.active = false;
      this.strength = 0;
      this.el.classList.add('hidden');
    };

    canvas.addEventListener('pointerdown', down, { passive: false });
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.key.toLowerCase());
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { this.keys.clear(); this.active = false; this.strength = 0; });
  }

  _place(bx, by, nx, ny) {
    this.base.style.left = bx + 'px';
    this.base.style.top = by + 'px';
    this.nub.style.left = nx + 'px';
    this.nub.style.top = ny + 'px';
  }

  // Tastatur einmischen und Ergebnis zurückgeben
  read() {
    const k = this.keys;
    let kx = 0, ky = 0;
    if (k.has('a') || k.has('arrowleft')) kx -= 1;
    if (k.has('d') || k.has('arrowright')) kx += 1;
    if (k.has('w') || k.has('arrowup')) ky -= 1;
    if (k.has('s') || k.has('arrowdown')) ky += 1;

    if (kx || ky) {
      const l = Math.hypot(kx, ky);
      return { x: kx / l, y: ky / l, strength: 1, active: true };
    }
    if (this.active) return { x: this.dir.x, y: this.dir.y, strength: this.strength, active: true };
    return { x: 0, y: 0, strength: 0, active: false };
  }
}
