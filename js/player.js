import * as THREE from 'three';
import { B, BLOCKS, AIR, isSolid, HEIGHT, surfaceAt } from './voxel.js';

/* ==========================================================================
 *  Die Figur in einer Blockwelt: Schwerkraft, Stufen steigen, graben, bauen.
 * ========================================================================== */

const RADIUS = 0.32;
const BODY = 1.72;
const GRAVITY = 26;
const JUMP = 8.2;
const HUEPFER = 7.4;      // reicht knapp über eine Stufe von einem Block

export class Player {
  constructor(scene) {
    this.group = new THREE.Group();

    /* Der Lichtträger. Fast alles an ihm ist Silhouette — was man sieht, ist
       die Laterne und zwei Augen, die sie spiegeln. Bei der Größe, in der er
       auf dem Schirm steht, zählt nur die Umrisslinie. */
    /* Der Spieler muss sich auf einen Blick von den Dorfleuten abheben —
       dieselbe Bauweise, aber Stahl und Blau statt Leinen und Erdfarben. */
    /* Die Stoffe liegen am Objekt, nicht nur in der Funktion: die Figur wird
       bei der Erschaffung umgefärbt, und zwar während man zuschaut. */
    const kutte = this.matKutte = new THREE.MeshLambertMaterial({ color: '#4a6f9e', flatShading: true });
    const saum  = this.matSaum  = new THREE.MeshLambertMaterial({ color: '#33506f', flatShading: true });
    const haut  = this.matHaut  = new THREE.MeshLambertMaterial({ color: '#f0cba0', flatShading: true });
    const glas  = this.matGlas  = new THREE.MeshBasicMaterial({ color: '#ffe9b0' });
    const haar  = this.matHaar  = new THREE.MeshLambertMaterial({ color: '#6b452a', flatShading: true });
    const metall = new THREE.MeshLambertMaterial({ color: '#d8dde2', flatShading: true });
    const auge  = new THREE.MeshBasicMaterial({ color: '#3f3328' });

    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    // Rumpf: eine Kutte, unten breiter als oben
    this.torso = new THREE.Mesh(box(0.56, 0.78, 0.44), kutte);
    this.torso.position.y = 0.92;
    const rock = new THREE.Mesh(box(0.7, 0.36, 0.54), saum);
    rock.position.y = 0.36;

    // Kopf steckt in der Kapuze — nur ein Streifen Gesicht bleibt frei
    this.head = new THREE.Mesh(box(0.46, 0.4, 0.42), haut);
    this.head.position.y = 1.5;
    this.kapuze = new THREE.Mesh(box(0.56, 0.42, 0.52), kutte);
    this.kapuze.position.set(0, 1.58, -0.06);
    this.schirm = new THREE.Mesh(box(0.58, 0.12, 0.2), saum);
    this.schirm.position.set(0, 1.62, 0.2);
    const kapuze = this.kapuze, schirm = this.schirm;

    /* Ohne Kapuze sieht man das Haar. Zwei Stücke reichen: die Decke auf dem
       Kopf und ein Nacken dahinter — mehr trägt die Silhouette nicht. */
    this.haarOben = new THREE.Mesh(box(0.5, 0.16, 0.46), haar);
    this.haarOben.position.set(0, 1.68, -0.01);
    this.haarNacken = new THREE.Mesh(box(0.46, 0.26, 0.12), haar);
    this.haarNacken.position.set(0, 1.5, -0.2);
    this.haarOben.visible = false;
    this.haarNacken.visible = false;

    const augeL = new THREE.Mesh(box(0.08, 0.08, 0.04), auge);
    augeL.position.set(-0.11, 1.45, 0.22);
    const augeR = augeL.clone(); augeR.position.x = 0.11;

    // Die Laterne: das eigentliche Gesicht der Figur
    this.armR = new THREE.Mesh(box(0.16, 0.5, 0.18), kutte);
    this.armR.position.set(0.34, 0.98, 0.1);
    this.armL = new THREE.Mesh(box(0.16, 0.5, 0.18), kutte);
    this.armL.position.set(-0.34, 0.98, 0.04);

    const buegel = new THREE.Mesh(box(0.04, 0.22, 0.04), metall);
    buegel.position.set(0.42, 0.98, 0.34);
    this.laterne = new THREE.Mesh(box(0.26, 0.28, 0.26), glas);
    this.laterne.position.set(0.42, 0.74, 0.34);
    const deckel = new THREE.Mesh(box(0.32, 0.07, 0.32), metall);
    deckel.position.set(0.42, 0.91, 0.34);
    const boden = new THREE.Mesh(box(0.32, 0.07, 0.32), metall);
    boden.position.set(0.42, 0.58, 0.34);

    this.legL = new THREE.Mesh(box(0.2, 0.3, 0.22), saum);
    this.legL.position.set(-0.14, 0.15, 0);
    this.legR = new THREE.Mesh(box(0.2, 0.3, 0.22), saum);
    this.legR.position.set(0.14, 0.15, 0);

    // Die Waffe in der freien Hand. Griff und Klinge sind getrennt, damit
    // eine bessere Waffe wirklich anders aussieht und nicht nur anders zählt.
    this.griffMat = new THREE.MeshLambertMaterial({ color: '#8a5230', flatShading: true });
    this.klingeMat = new THREE.MeshLambertMaterial({ color: '#d8dde2', flatShading: true });
    this.tool = new THREE.Mesh(box(0.09, 0.3, 0.09), this.griffMat);
    this.tool.position.set(-0.4, 0.92, 0.22);
    this.head2 = new THREE.Mesh(box(0.13, 0.5, 0.06), this.klingeMat);
    this.head2.position.set(-0.4, 0.66, 0.22);
    // Ein drittes Stueck: Parierstange, Axtnacken, Wicklung - je nach Form.
    // Ohne es sieht jede Waffe aus wie ein Brett an einem Stock.
    this.zier = new THREE.Mesh(box(0.26, 0.1, 0.07), this.klingeMat);
    this.zier.position.set(-0.4, 0.79, 0.22);
    this.zier.visible = false;

    // Wo die drei Stuecke ruhen. setWaffe schreibt hier hinein, die
    // Schlaganimation rechnet von hier aus weiter.
    this.wGriffY = 0.92;
    this.wKopfX = 0; this.wKopfY = 0.66; this.wKopfKipp = 0;
    this.wZierX = 0; this.wZierY = 0.79; this.wZierKipp = 0;

    [this.torso, rock, this.head, kapuze, schirm, this.haarOben, this.haarNacken,
     augeL, augeR, this.armL, this.armR,
     buegel, this.laterne, deckel, boden, this.legL, this.legR, this.tool, this.head2,
     this.zier]
      .forEach((m) => { m.castShadow = true; this.group.add(m); });

    scene.add(this.group);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.onGround = false;
    this.inWater = false;
    this.t = 0;
    this.swing = 0;
    this.huepft = 0;
    this.tempo = 1;
    this.rolle = 0;        // wie lange die Rolle noch läuft
    this.unverwundbar = 0; // und wie lange sie noch trägt
    this.rollRichtung = { x: 0, z: 1 };
    this.bogen = false;
    this.rennt = false;
    this.schritt = 0;   // Phase der Beinarbeit, läuft mit dem Tempo mit
    this.letzterSchritt = 0;  // bei welcher Phase zuletzt ein Fuß aufkam
    this.landung = 0;         // Stauchen nach dem Aufkommen
    this.warInDerLuft = false;
  }

  spawn(world, x, z) {
    // Auf den gewachsenen Boden, nicht auf ein Blaetterdach - world.surfaceY
    // zaehlt Baeume mit und setzte den Zwerg schon mal in eine Baumkrone.
    const y = surfaceAt(x, z) + 1;
    for (let dy = 0; dy < 3; dy++) {
      const b = world.get(x, y + dy, z);
      if (b === B.laub || b === B.stamm || b === B.pilz) world.set(x, y + dy, z, AIR);
    }
    this.pos.set(x + 0.5, y, z + 0.5);
    this.vel.set(0, 0, 0);
  }

  /* --------------------------- Kollision ---------------------------------- */
  blocked(world, x, y, z) {
    const y0 = Math.floor(y + 0.05), y1 = Math.floor(y + BODY - 0.1);
    for (let by = y0; by <= y1; by++) {
      for (const [dx, dz] of [[-RADIUS, -RADIUS], [RADIUS, -RADIUS], [-RADIUS, RADIUS], [RADIUS, RADIUS]]) {
        if (isSolid(world.get(Math.floor(x + dx), by, Math.floor(z + dz)))) return true;
      }
    }
    return false;
  }

  /* Die Rolle: ein kurzer Satz zur Seite, währenddessen geht nichts durch.
     Sie ist der Grund, warum ein Kampf mehr ist als Schläge zählen — wer den
     richtigen Moment trifft, nimmt keinen Schaden. */
  rollen(move) {
    if (this.rolle > 0 || !this.onGround) return false;
    const l = Math.hypot(move.x, move.y);
    if (l > 0.2) this.rollRichtung = { x: move.x / l, z: move.y / l };
    else this.rollRichtung = { x: Math.sin(this.facing), z: Math.cos(this.facing) };
    this.rolle = 0.42;
    this.unverwundbar = 0.34;
    this.facing = Math.atan2(this.rollRichtung.x, this.rollRichtung.z);
    return true;
  }

  update(dt, move, world) {
    this.t += dt;
    if (this.swing > 0) this.swing -= dt;
    if (this.rolle > 0) this.rolle -= dt;
    if (this.unverwundbar > 0) this.unverwundbar -= dt;

    const feet = world.get(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.2), Math.floor(this.pos.z));
    this.inWater = feet === B.wasser;

    if (this.rolle > 0) {
      // Während der Rolle zählt nur der Schwung, nicht der Knüppel
      const schwung = 13 * Math.max(0.35, this.rolle / 0.42);
      this.vel.x = this.rollRichtung.x * schwung;
      this.vel.z = this.rollRichtung.z * schwung;
    } else {
      const speed = (this.inWater ? 3.4 : 5.4) * (this.tempo || 1) * move.strength;
      const wishX = move.x * speed;
      const wishZ = move.y * speed;
      this.vel.x += (wishX - this.vel.x) * Math.min(1, dt * 14);
      this.vel.z += (wishZ - this.vel.z) * Math.min(1, dt * 14);
    }

    // Schwerkraft, im Wasser gebremst
    this.vel.y -= (this.inWater ? GRAVITY * 0.28 : GRAVITY) * dt;
    if (this.inWater) this.vel.y = Math.max(this.vel.y, -2.4);

    /* Waagerecht bewegen. Steht eine Stufe von einem Block im Weg, wird sie
       nicht mehr übersprungen, indem die Figur einen Meter nach oben gesetzt
       wird - das sah aus wie ein Fehler. Stattdessen hüpft sie: ein Stoß nach
       oben, und die Schwerkraft macht den Rest. Oben angekommen greift die
       waagerechte Bewegung von allein wieder. */
    const huepfenWenn = (frei) => {
      if (!this.onGround || !frei) return false;
      this.vel.y = HUEPFER;
      this.onGround = false;
      this.huepft = 0.36;          // fürs Anwinkeln der Beine
      return true;
    };

    /* In der Luft wird der Schwung nicht genommen: wer gegen die Kante hüpft,
       drückt weiter dagegen und rutscht oben drüber, sobald Platz ist. Nur wer
       am Boden vor einer echten Wand steht, bleibt stehen. */
    const stepX = this.vel.x * dt;
    if (!this.blocked(world, this.pos.x + stepX, this.pos.y, this.pos.z)) {
      this.pos.x += stepX;
    } else if (!huepfenWenn(!this.blocked(world, this.pos.x + stepX, this.pos.y + 1.05, this.pos.z))) {
      if (this.onGround) this.vel.x = 0;
    }

    const stepZ = this.vel.z * dt;
    if (!this.blocked(world, this.pos.x, this.pos.y, this.pos.z + stepZ)) {
      this.pos.z += stepZ;
    } else if (!huepfenWenn(!this.blocked(world, this.pos.x, this.pos.y + 1.05, this.pos.z + stepZ))) {
      if (this.onGround) this.vel.z = 0;
    }

    // Senkrecht
    const stepY = this.vel.y * dt;
    if (!this.blocked(world, this.pos.x, this.pos.y + stepY, this.pos.z)) {
      this.pos.y += stepY;
      this.onGround = false;
    } else {
      if (this.vel.y < 0) {
        this.pos.y = Math.floor(this.pos.y + stepY) + 1;
        this.onGround = true;
      }
      this.vel.y = 0;
    }
    if (this.pos.y < 1) { this.pos.y = 1; this.onGround = true; this.vel.y = 0; }

    if (this.rolle <= 0 && move.active && move.strength > 0.05) {
      this.facing = Math.atan2(move.x, move.y);
    }

    // Animation
    const sp = Math.hypot(this.vel.x, this.vel.z);
    // Die Beine gehen im Takt der Geschwindigkeit — beim Rennen sichtbar schneller
    this.schritt += dt * Math.min(22, sp * 1.9);
    const stride = Math.sin(this.schritt);

    /* Jeder Nulldurchgang der Schrittphase ist ein Fuß, der aufkommt. Daran
       hängen Ton und Staub — vorher lief die Figur lautlos wie ein Papierbild
       über die Wiese. */
    this.fussAuf = null;
    if (sp > 0.6 && this.onGround && this.rolle <= 0) {
      const halb = Math.floor(this.schritt / Math.PI);
      if (halb !== this.letzterSchritt) {
        this.letzterSchritt = halb;
        this.fussAuf = { stark: Math.min(1, sp / 7), links: halb % 2 === 0 };
      }
    }

    // Landung: einmal in die Knie gehen
    if (!this.onGround) this.warInDerLuft = true;
    else if (this.warInDerLuft) {
      this.warInDerLuft = false;
      this.landung = 0.22;
      this.fussAuf = { stark: 1, links: false, landung: true };
    }
    if (this.landung > 0) this.landung -= dt;
    const walking = sp > 0.4;
    const weit = this.rennt && walking ? 0.85 : 0.55;
    if (this.huepft > 0) this.huepft -= dt;

    // Beim Hüpfen ziehen sich die Beine an, statt weiterzulaufen
    if (this.rolle > 0) {
      const k = this.rolle / 0.42;
      this.legL.rotation.x = -1.5 * k;
      this.legR.rotation.x = -1.2 * k;
      this.group.rotation.x = -Math.sin(k * Math.PI) * 0.9;
    } else if (this.group.rotation.x) {
      this.group.rotation.x = 0;
    }
    if (this.huepft > 0 || !this.onGround) {
      const k = Math.min(1, Math.max(0, this.huepft / 0.36));
      this.legL.rotation.x = -0.75 * k;
      this.legR.rotation.x = -0.45 * k;
    } else {
      this.legL.rotation.x = walking ? stride * weit : 0;
      this.legR.rotation.x = walking ? -stride * weit : 0;
    }

    // Die Laterne bleibt ruhig - sie ist das Einzige, was er nicht schwenkt.
    this.armR.rotation.x = walking ? stride * (this.rennt ? 0.3 : 0.12) : 0;

    // Mit dem Bogen wird gezogen, nicht geschlagen — also kleinerer Ausschlag
    const swingK = Math.max(0, this.swing / 0.25) * (this.bogen ? 0.45 : 1);
    this.armL.rotation.x = -swingK * 1.5 + (walking ? -stride * 0.4 : 0);
    this.tool.rotation.x = -swingK * 1.5;
    this.tool.position.set(-0.4, this.wGriffY - swingK * 0.22, 0.22 + swingK * 0.2);
    this.head2.rotation.x = -swingK * 1.5;
    this.head2.rotation.z = this.wKopfKipp;
    this.head2.position.set(-0.4 + this.wKopfX, this.wKopfY - swingK * 0.44,
      0.22 + swingK * 0.36);
    if (this.zier.visible) {
      this.zier.rotation.x = -swingK * 1.5;
      this.zier.rotation.z = this.wZierKipp;
      this.zier.position.set(-0.4 + this.wZierX, this.wZierY - swingK * 0.32,
        0.22 + swingK * 0.28);
    }

    // Das Laternenglas atmet mit dem Licht
    const puls = 0.94 + Math.sin(this.t * 4.5) * 0.06;
    this.laterne.scale.setScalar(puls);

    /* Der Oberkörper lehnt sich in die Laufrichtung und wippt mit den
       Schritten, die Kapuze folgt versetzt. Ohne das gleitet die Figur nur
       über den Boden, statt zu laufen. */
    const lehnen = Math.min(0.22, sp * 0.028) * (this.rennt ? 1.5 : 1);
    const wippe = walking ? Math.abs(Math.sin(this.schritt)) * (this.rennt ? 0.07 : 0.045) : 0;
    const knick = this.landung > 0 ? (this.landung / 0.22) : 0;

    this.torso.rotation.x = this.rolle > 0 ? 0 : lehnen;
    this.torso.position.y = 0.92 + wippe - knick * 0.12;
    this.head.position.y = 1.5 + wippe * 0.8 - knick * 0.16;
    this.head.rotation.x = -lehnen * 0.4 + Math.sin(this.schritt * 0.5) * 0.02;
    this.group.scale.set(1 + knick * 0.08, 1 - knick * 0.14, 1 + knick * 0.08);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.facing;
  }

  /** Färbt die Figur um. `f` kommt aus aussehen.js/farbenVon(). */
  setAussehen(f) {
    if (!f) return;
    this.matKutte.color.set(f.kutte);
    this.matSaum.color.set(f.saum);
    this.matHaut.color.set(f.haut);
    this.matHaar.color.set(f.haar);
    this.matGlas.color.set(f.glas);
    this.kapuze.visible = f.kapuze;
    this.schirm.visible = f.kapuze;
    this.haarOben.visible = !f.kapuze;
    this.haarNacken.visible = !f.kapuze;
  }

  /** Was in der Hand steckt, richtet sich nach dem, was angelegt ist. */
  setWaffe(d) {
    if (!d) {
      this.tool.visible = false;
      this.head2.visible = false;
      this.zier.visible = false;
      return;
    }
    this.tool.visible = true;
    this.head2.visible = true;
    this.bogen = !!d.fern;
    this.klingeMat.color.set(d.klinge || '#d8dde2');
    this.griffMat.color.set(d.griff || '#8a5230');
    // Sagenhaftes glimmt von selbst - das sieht man schon von weitem
    this.klingeMat.emissive.set(d.leuchtet ? (d.klinge || '#f5c451') : '#000000');
    this.klingeMat.emissiveIntensity = d.leuchtet ? 0.55 : 0;

    // Grundstellung; jede Form schiebt danach nur, was sie braucht
    this.tool.scale.set(1, 1, 1);
    this.wGriffY = 0.92;
    this.wKopfX = 0; this.wKopfY = 0.66; this.wKopfKipp = 0;
    this.wZierX = 0; this.wZierY = 0.79; this.wZierKipp = 0;
    this.zier.visible = false;
    this.zier.scale.set(1, 1, 1);

    const wucht = d.schaden || 0;

    switch (d.form || (d.fern ? 'bogen' : 'klinge')) {
      case 'bogen': {
        // Ein Bogen ist hoch und schmal, kein Blatt - und die Sehne ist hell
        this.head2.scale.set(0.5, 1.9, 1.6);
        this.tool.scale.set(0.35, 1.6, 0.35);
        this.wKopfY = 0.72;
        break;
      }
      case 'kolben': {
        // Kurzer Stiel, schwerer Klotz am Ende
        this.tool.scale.set(1.15, 1.25, 1.15);
        this.wGriffY = 0.95;
        this.head2.scale.set(1.5 + wucht * 0.02, 0.5 + wucht * 0.012, 2.6);
        this.wKopfY = 0.6;
        break;
      }
      case 'axt': {
        // Stiel lang, Blatt zur Seite, kleiner Nacken dagegen
        this.tool.scale.set(0.95, 1.7, 0.95);
        this.wGriffY = 0.88;
        this.head2.scale.set(1.9 + wucht * 0.02, 0.62, 1.3);
        this.wKopfX = -0.13; this.wKopfY = 0.56; this.wKopfKipp = 0.12;
        this.zier.visible = true;
        this.zier.scale.set(0.38, 0.85, 0.9);
        this.wZierX = 0.08; this.wZierY = 0.58;
        break;
      }
      case 'picke': {
        // Schmaler Schnabel, weit nach vorn - sucht die Luecke
        this.tool.scale.set(0.9, 1.5, 0.9);
        this.wGriffY = 0.9;
        this.head2.scale.set(0.45, 0.4, 3.4);
        this.wKopfX = -0.05; this.wKopfY = 0.6; this.wKopfKipp = 0.5;
        this.zier.visible = true;
        this.zier.scale.set(0.34, 0.9, 0.7);
        this.wZierX = 0.07; this.wZierY = 0.6;
        break;
      }
      case 'speer': {
        // Langer Schaft, kleine Spitze oben, zwei Wicklungen
        this.tool.scale.set(0.8, 3.4, 0.8);
        this.wGriffY = 0.9;
        this.head2.scale.set(0.62, 0.46, 1.1);
        this.wKopfY = 1.52;
        this.zier.visible = true;
        this.zier.scale.set(0.42, 0.22, 0.9);
        this.wZierY = 1.22;
        break;
      }
      case 'sichel': {
        // Die Schneide liegt schraeg - zwei Stuecke, die sich biegen
        this.tool.scale.set(1, 1.1, 1);
        const l = 0.34 + wucht * 0.02;
        this.head2.scale.set(0.9, l / 0.5, 1);
        this.wKopfX = -0.08; this.wKopfY = 0.68; this.wKopfKipp = 0.55;
        this.zier.visible = true;
        this.zier.scale.set(0.5, 1.5, 0.9);
        this.wZierX = -0.17; this.wZierY = 0.5; this.wZierKipp = 1.05;
        break;
      }
      default: {
        // Klinge: laenger und breiter, je mehr sie austeilt, dazu die Stange
        const laenge = 0.34 + wucht * 0.026;
        const breite = 0.1 + wucht * 0.006;
        this.head2.scale.set(breite / 0.13, laenge / 0.5, 1);
        this.zier.visible = true;
        this.zier.scale.set(0.8 + wucht * 0.012, 1, 1);
        this.wZierY = 0.8;
        break;
      }
    }
  }

  jump() {
    if (this.onGround || this.inWater) {
      this.vel.y = this.inWater ? JUMP * 0.55 : JUMP;
      this.onGround = false;
    }
  }

  /** Auf welchen Block zielt die Figur gerade? */
  aim(world, mode) {
    const bx = Math.floor(this.pos.x);
    const bz = Math.floor(this.pos.z);
    const by = Math.floor(this.pos.y);

    if (mode === 'down') return { x: bx, y: by - 1, z: bz };

    const fx = Math.round(Math.sin(this.facing));
    const fz = Math.round(Math.cos(this.facing));
    // erst auf Bauchhöhe, sonst auf Fußhöhe, sonst darüber
    for (const dy of [0, 1, -1]) {
      const t = { x: bx + fx, y: by + dy, z: bz + fz };
      if (isSolid(world.get(t.x, t.y, t.z))) return t;
    }
    return { x: bx + fx, y: by, z: bz + fz };
  }

  /** Wohin würde ein gesetzter Block kommen? */
  placeTarget(world, mode) {
    const bx = Math.floor(this.pos.x), by = Math.floor(this.pos.y), bz = Math.floor(this.pos.z);
    if (mode === 'down') return { x: bx, y: by - 1, z: bz };
    const fx = Math.round(Math.sin(this.facing));
    const fz = Math.round(Math.cos(this.facing));

    // Erst in Blickrichtung, dann ringsum, zuletzt ueber den Kopf. Ohne den
    // letzten Ausweg liesse sich im engen Stollen keine Fackel setzen.
    const spots = [];
    for (const dy of [0, 1, 2]) spots.push({ x: bx + fx, y: by + dy, z: bz + fz });
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const dy of [0, 1]) spots.push({ x: bx + ox, y: by + dy, z: bz + oz });
    }
    spots.push({ x: bx, y: by + 2, z: bz });

    for (const t of spots) if (!isSolid(world.get(t.x, t.y, t.z))) return t;
    return null;
  }
}
