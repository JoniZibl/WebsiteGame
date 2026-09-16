# Talkunde

Ein Rollenspiel im Browser, von oben gesehen, auf dem Handy spielbar. Eine
endlose Welt aus Blöcken mit Dörfern, Leuten, Aufträgen und Gruften — und
allem, was darauf steht, als richtiges kleines Modell.

## Was es gibt

**Die Welt** rechnet sich aus ihren Koordinaten aus und hört nie auf. Sechs
Biome, Flusstäler, Höhlenröhren, Erz in der Tiefe. Dörfer liegen auf einem
groben Raster mit Versatz; wo eines steht, wird das Gelände eingeebnet und
bekommt Wege.

**Die Dörfer** sind gebaut, nicht gewürfelt zusammengeschoben: Häuser mit
Satteldach um einen Brunnen, Laternen am Wegkreuz, Zäune, Tannen. Vor jedem
Haus wohnt jemand mit Namen, Gewerbe und genau einem Auftrag.

**Die Geschichte** heißt *Das Erlöschen*. Im Heimatdorf sitzt ein Chronist, der
aufschreibt, was aufhört: Die Laternen brennen kürzer als früher, weil das Glimm
im Fels müde wird. Fünf Kapitel führen von fünf Glimmsteinen über ein altes
Siegel und zwei fremde Dörfer bis in den Schlund, wo jemand sitzt, der das Licht
genommen hat.

Am Ende stehen zwei Wege. Erschlagen kann man ihn immer. Reden kann man mit ihm
nur, wenn man unterwegs mindestens vier Leuten geholfen hat — und das ist der
Punkt: Was am Ende zählt, ist nicht, was du erschlagen hast, sondern ob du
gekommen bist, als jemand gefragt hat.

**Die Aufträge** schicken einen irgendwohin — eine Gruft leeren, ein Erbstück
holen, Wölfe vertreiben, Glimm graben, eine Nachricht ins Nachbardorf bringen.
Jeder Auftraggeber hat immer denselben, weil er aus seinem Saatkorn gewürfelt
wird.

**Die Gruften** liegen unter Tage: ein Schacht vom Tor nach unten, Räume auf
einem lockeren Raster, Gänge dazwischen, Räuber und Skelette darin, am Ende
ein Hauptmann und eine große Truhe. Je weiter vom Anfang, desto härter.

**Die Fertigkeiten** steigen dadurch, dass man sie benutzt — Klinge, Zähigkeit,
Magie, Spüren, Wandern. Jede Stufe gibt einen Punkt für einen Vorteil.

**Die Ausrüstung** hängt an drei Plätzen: Waffe, Rüstung, Schmuck. Fertigkeit
und Ausrüstung greifen ineinander — mit bloßen Fäusten bringt Klinge 5 wenig,
und die beste Klinge trägt sich in ungeübter Hand auch nicht von allein. Was
man anlegt, sieht man auch: Griff und Klinge in der Hand ändern Länge und Farbe.

**Die Beute** kommt aus Truhen und von Gefallenen und reicht vom Wolfsfell bis
zur Runenklinge. In jedem Dorf führt jemand einen Laden, kauft den Krempel und
verkauft Tränke, Waffen und Rüstung — das Angebot wechselt mit dem Tag.

## Steuerung

- **Ziehen** (oder **WASD**) — laufen
- **⚔️** zuschlagen *(Leertaste)* · **✨** zaubern *(K)*
- **💎** Glimmadern im Fels brechen *(E)*
- **💬 / 🧰 / 🚪** ansprechen, Truhe öffnen, Gruft betreten *(E)*
- **🧪** trinken *(H)* — erscheint, sobald du Tränke hast
- **🎒** Fertigkeiten, Beutel, Aufträge, Karte *(I)*

## Der Kniff für die Draufsicht

Ein Spiel von oben und Gruften unter der Erde vertragen sich normalerweise
nicht. Talkunde schneidet die Welt über dem Kopf weg, sobald man unter Tage
ist — die Gruft liegt als Querschnitt vor einem. Über Tage fällt zusätzlich
alles weg, was zwischen Kamera und Figur steht, damit kein Dach die Sicht
nimmt.

## Technik

- three.js (lokal unter `vendor/three/`, kein CDN, kein Build-Schritt)
- Gelände als Chunk-Welt in `Uint8Array`, flächenweises Culling, Schattierung
  und Schichtfarbe in die Vertex-Farben gebacken
- Häuser, Bäume und Figuren als Low-Poly-Modelle, je Bauart einmal gebaut und
  danach nur geklont
- Nachbearbeitung (`js/postfx.js`): Tilt-Shift wie bei Miniaturen, Bloom,
  Farbgradierung, Vignette, Korn, tiefenbasierte Konturen
- Ton komplett prozedural über WebAudio, keine Audiodateien
- Spielstand in `localStorage`: Saatkorn, Änderungen, Held und Aufträge

| Datei | wofür |
| --- | --- |
| `js/voxel.js` | Gelände, Biome, Dörfer, Höhlen, Vernetzung |
| `js/props.js` | Häuser, Bäume, Zäune, Truhen, Tore |
| `js/village.js` | Dorfgrundrisse und ihr Auf- und Abbau |
| `js/dungeon.js` | Gruften: Grundriss, Bewohner, Beute |
| `js/npc.js` | die Leute im Dorf |
| `js/quest.js` | Auftragsvorlagen und Auftragsbuch |
| `js/skills.js` | Stufen, Fertigkeiten, Vorteile |
| `js/combat.js` | Gegner und Kampf |
| `js/items.js` | Gegenstände, Beutetabellen, Beutel, Laden |
| `js/story.js` | die Hauptgeschichte in fünf Kapiteln |
| `js/main.js` | Anzeige, Steuerung, Schleife |

## Starten

```sh
python3 -m http.server 8123
```

Dann `http://localhost:8123/` öffnen.
