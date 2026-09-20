// Alle Geräusche werden zur Laufzeit synthetisiert — keine einzige Audiodatei.
// Das passt zum Rest: nichts nachzuladen, alles über Zahlen einstellbar.

const SCALE = [0, 2, 4, 7, 9, 12, 14];      // Pentatonik: klingt nie falsch
const BASE = 196;                            // G3

/* Die Gegenden klingen verschieden: das Grasland hell und offen, der Bruch
   tief und schwebend, das Firnfeld dünn und hoch, die Düne karg. */
const STIMMUNGEN = {
  warm:   { grund: 1,    leiter: [0, 2, 4, 7, 9, 12], klang: 'triangle', pause: 9 },
  wald:   { grund: 0.75, leiter: [0, 3, 5, 7, 10],    klang: 'triangle', pause: 11 },
  kalt:   { grund: 1.5,  leiter: [0, 2, 7, 9, 14],    klang: 'sine',     pause: 13 },
  karg:   { grund: 0.67, leiter: [0, 1, 5, 7, 8],     klang: 'sawtooth', pause: 15 },
  dunkel: { grund: 0.5,  leiter: [0, 3, 6, 7, 10],    klang: 'sine',     pause: 12 },
  fels:   { grund: 0.84, leiter: [0, 5, 7, 12],       klang: 'triangle', pause: 14 },
};

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ready = false;
    this.padTimer = 6;
    this.fireGain = null;
    this.noise = null;
  }

  /** Browser erlauben Ton erst nach einer Geste — von einem Klick aus aufrufen. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx();
    } catch (err) {
      return;
    }

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);

    // ein Rauschpuffer für Wind, Knistern und Schläge
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this._startWind();
    this._startFire();
    this._startWetter();
    this.ready = true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
  }

  _noiseSource(loop = false) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = loop;
    return src;
  }

  /** Grundrauschen: leiser Wind, der langsam an- und abschwillt. */
  _startWind() {
    const src = this._noiseSource(true);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.035;

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.022;
    lfo.connect(lfoGain).connect(gain.gain);

    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    lfo.start();
  }

  /* Wetter: ein zweites Rauschen, dessen Filter entscheidet, ob es nach
     Regen (hell und dicht), Schnee (fast nichts) oder Sandwind (dumpf und
     böig) klingt. Eine Quelle für alles — nur Frequenz und Pegel wandern. */
  _startWetter() {
    const src = this._noiseSource(true);
    this.wetterFilter = this.ctx.createBiquadFilter();
    this.wetterFilter.type = 'bandpass';
    this.wetterFilter.frequency.value = 1400;
    this.wetterFilter.Q.value = 0.4;
    this.wetterGain = this.ctx.createGain();
    this.wetterGain.gain.value = 0;
    src.connect(this.wetterFilter).connect(this.wetterGain).connect(this.master);
    src.start();
  }

  /** Was gerade vom Himmel kommt, und wie stark. */
  setWetter(art, staerke) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const [freq, pegel] = art === 'regen' ? [2200, 0.13]
      : art === 'sand' ? [700, 0.11]
      : art === 'schnee' ? [900, 0.02]
      : art === 'nebel' ? [400, 0.02]
      : [1200, 0];
    this.wetterFilter.frequency.setTargetAtTime(freq, t, 0.6);
    this.wetterGain.gain.setTargetAtTime(pegel * staerke, t, 0.8);
  }

  /** Lagerfeuer: dauerhaft vorhanden, aber nur in der Nähe hörbar. */
  _startFire() {
    const src = this._noiseSource(true);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    this.fireGain = this.ctx.createGain();
    this.fireGain.gain.value = 0;
    src.connect(filter).connect(this.fireGain).connect(this.master);
    src.start();
  }

  /** Lautstärke des Feuers aus der Entfernung. */
  setFireDistance(d) {
    if (!this.ready) return;
    const near = d === null ? 0 : Math.max(0, 1 - d / 11);
    this.fireGain.gain.setTargetAtTime(near * near * 0.16, this.ctx.currentTime, 0.25);
  }

  /** Kurzer Ton mit Hüllkurve. */
  _blip(type, freq, { dur = 0.18, peak = 0.2, glide = 0, delay = 0 } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + glide), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Gefilterter Rauschstoß — für alles, was schlägt oder zischt. */
  _thump(freq, { dur = 0.2, peak = 0.25, type = 'lowpass' } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const src = this._noiseSource();
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.4), t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------------- Effekte
  shoot()    { this._blip('triangle', 520, { dur: 0.12, peak: 0.12, glide: -260 }); }

  /** Schmatzen: je größer der Bissen, desto tiefer und satter. */
  chomp(food = 1) {
    const f = Math.max(0.2, Math.min(3, food));
    this._thump(380 / f, { dur: 0.1 + f * 0.03, peak: 0.22, type: 'lowpass' });
    this._blip('square', 190 / Math.sqrt(f), { dur: 0.1, peak: 0.07, glide: -50 });
    this._blip('sine', 520 / Math.sqrt(f), { dur: 0.14, peak: 0.08, glide: 120, delay: 0.04 });
  }

  /** Am Ende wird es dumpf — als hielte die Welt den Atem an. */
  setMuffled(on) {
    if (!this.ready) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : (on ? 0.22 : 0.7), this.ctx.currentTime, 0.4);
  }
  hit()      { this._thump(1400, { dur: 0.09, peak: 0.16, type: 'bandpass' }); }
  kill()     { this._thump(700, { dur: 0.18, peak: 0.22 }); this._blip('sine', 330, { dur: 0.22, peak: 0.1, glide: 180, delay: 0.03 }); }
  hurt()     { this._thump(260, { dur: 0.26, peak: 0.3 }); this._blip('sawtooth', 150, { dur: 0.2, peak: 0.08, glide: -60 }); }
  spit()     { this._thump(600, { dur: 0.22, peak: 0.12, type: 'bandpass' }); }
  /* Ein Schritt klingt nach dem, worauf man tritt: Gras dumpf, Stein hart,
     Wasser platschend. Die Höhe schwankt leicht, sonst klingt Laufen wie
     eine Maschine. */
  step(stark = 1, grund = 'gras') {
    const t = { gras: [150, 'lowpass'], stein: [340, 'bandpass'], sand: [110, 'lowpass'],
                holz: [260, 'lowpass'], wasser: [520, 'bandpass'] }[grund] || [180, 'lowpass'];
    const streu = 0.88 + Math.random() * 0.24;
    this._thump(t[0] * streu, { dur: 0.07, peak: 0.035 + stark * 0.045, type: t[1] });
    if (grund === 'wasser') {
      this._blip('sine', 900 * streu, { dur: 0.09, peak: 0.05 * stark, glide: -300 });
    }
  }

  /** Edelstein: steigt bei schnellem Sammeln in der Tonhöhe. */
  gem(streak = 0) {
    const semi = SCALE[Math.min(streak, SCALE.length - 1)];
    const f = BASE * 2 * Math.pow(2, semi / 12);
    this._blip('sine', f, { dur: 0.3, peak: 0.16 });
    this._blip('sine', f * 2, { dur: 0.2, peak: 0.06, delay: 0.01 });
  }

  levelUp() {
    [0, 4, 7, 12].forEach((semi, i) => {
      this._blip('triangle', BASE * 2 * Math.pow(2, semi / 12), { dur: 0.5, peak: 0.13, delay: i * 0.09 });
    });
  }

  bossWake() {
    this._blip('sawtooth', 70, { dur: 1.4, peak: 0.16, glide: 40 });
    this._thump(300, { dur: 0.9, peak: 0.26 });
  }

  bossSlam() {
    this._thump(180, { dur: 0.5, peak: 0.42 });
    this._blip('sine', 90, { dur: 0.45, peak: 0.2, glide: -40 });
  }

  bossDown() {
    this._thump(400, { dur: 1.1, peak: 0.3 });
    [12, 7, 4, 0].forEach((semi, i) => {
      this._blip('sine', BASE * 2 * Math.pow(2, semi / 12), { dur: 0.6, peak: 0.13, delay: i * 0.12 });
    });
  }

  /* Ab und zu ein ruhiger Akkordton als Untermalung — aber nicht überall
     derselbe. Jede Gegend bekommt ihre eigene Tonart und ihr eigenes Tempo,
     und nachts rückt alles eine Oktave tiefer und wird seltener. Das ist
     keine Musik, aber es klingt an jedem Ort anders. */
  ambient(dt, stimmung = 'warm', nacht = false) {
    if (!this.ready || this.muted) return;
    const s = STIMMUNGEN[stimmung] || STIMMUNGEN.warm;
    this.padTimer -= dt;
    if (this.padTimer > 0) return;
    this.padTimer = (s.pause + Math.random() * s.pause * 0.8) * (nacht ? 1.5 : 1);

    const t = this.ctx.currentTime;
    const leiter = s.leiter;
    const semi = leiter[(Math.random() * leiter.length) | 0];
    const freq = BASE * s.grund * Math.pow(2, semi / 12) * (nacht ? 0.5 : 1);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 1.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
    gain.connect(this.master);

    for (const detune of [-4, 4]) {
      const osc = this.ctx.createOscillator();
      osc.type = s.klang;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 5.7);
    }
  }
}
