# Grabwelt

Ein Survival-Spiel im Blockstil, von oben gesehen — im Browser, ohne Installation,
auf dem Handy spielbar.

Du bist ein Gartenzwerg mit einer Laterne. Über Tage liegt eine prozedural
erzeugte Welt aus Wiesen, Wäldern, Wüsten, Schnee, Bergen und Sümpfen. Darunter
liegt alles, was interessanter ist: Höhlen, Kohle, Eisen, Gold, Kristall.

## Der Kniff: die Deckenschnitt-Ansicht

Ein Spiel von oben und ein Spiel, in dem man sich eingräbt, vertragen sich
normalerweise nicht — sobald du unter der Erde bist, siehst du nur noch Erde.
Grabwelt schneidet deshalb die Welt über dir weg: eine Schnittebene folgt dir
nach unten, sodass dein Stollen immer wie ein Querschnitt vor dir liegt. Über
Tage fällt außerdem alles weg, was zwischen Kamera und Zwerg steht — kein
Blätterdach verdeckt dich mehr.

## Überleben

Leben und Sättigung stehen oben links. Die Sättigung hält rund sieben Minuten,
danach zieht der Hunger am Leben — gegessen werden Pilze, die in Höhlen und
Sümpfen wachsen. Stürze ab vier Metern tun weh, unter Wasser geht die Luft aus,
und im Dunkeln laufen Höhlenschleime und Steinbeißer herum.

Die Werkzeugstufe entscheidet, was überhaupt abbaubar ist: Holz → Bretter →
Holzspitzhacke → Stein → Steinspitzhacke → Eisen → Eisenspitzhacke → Gold und
Kristall. Gebaut wird an der Werkbank (⚒️).

Der Spielstand liegt im Browser: nur das Saatkorn und deine Änderungen, ein paar
Kilobyte. Beim nächsten Öffnen gräbst du weiter, wo du aufgehört hast.

## Steuerung

- **Ziehen** (oder **WASD**) — laufen
- **⛏️** — vor dir abbauen, **⬇️** — nach unten graben, **⬆️** — nach oben
- **🧱** — den gewählten Block setzen
- **🦘** — springen
- **⚒️** — Werkbank, **🍄** — essen
- Die **Leiste unten** wählt aus, was du in der Hand hast
- Steht ein Wesen in Reichweite, schlägt **⛏️** zu statt zu graben

## Technik

- three.js (lokal unter `vendor/three/`, kein CDN, kein Build-Schritt)
- Chunk-Welt in `Uint8Array`, flächenweises Culling, Schattierung direkt in die
  Vertex-Farben gebacken — zwei Materialien pro Chunk
- Nachbearbeitung (`js/postfx.js`): Tilt-Shift wie bei Miniaturen, Bloom,
  Farbgradierung, Vignette, Korn und tiefenbasierte Konturen
- Ton komplett prozedural über WebAudio, keine Audiodateien

## Starten

```sh
python3 -m http.server 8123
```

Dann `http://localhost:8123/` öffnen.
