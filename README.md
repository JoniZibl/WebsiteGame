# Glut

> Du bist ein Gartenzwerg mit einer Laterne in der Hand. Ihre Flamme ist
> Leben, Munition und Licht — alles in einem einzigen Balken. Jeder Schuss
> kostet dich Helligkeit. Jedes Feuer, das du entzündest, holt ein Stück
> Welt aus dem Dunkel zurück — und dort bleibt es grün.

Ein Top-Down-Spiel im Browser, prozedural erzeugt, in einer Welt, die bleibt.
Gebaut mit [three.js](https://threejs.org) als reine statische Seite. Kein
Build-Schritt, kein npm install, kein CDN: three.js liegt mit im Repo unter
`vendor/`.

## Die eine Regel

Es gibt keinen Lebensbalken, keine Munition und keine Ausdauer — nur die
Flamme in deiner Laterne.

| | |
| --- | --- |
| **Schießen** | kostet Flamme; je voller die Laterne, desto stärker die Pfeile |
| **Getroffen werden** | kostet Flamme |
| **Dunkelheit** | zehrt sie aus — je finsterer, desto schneller |
| **Tageslicht** | speist sie langsam |
| **Feuer** | füllt sie schnell wieder auf |
| **Glut einsammeln** | gibt einen Schluck zurück |
| **Flamme leer** | du erlischst und wachst in deinem Zelt wieder auf |

Daraus entsteht die eigentliche Frage des Spiels: *Schieße ich noch einmal —
oder reicht mein Licht dann nicht mehr bis zum Lager?*

## Die Dunkelheit ist der Gegner

Weit weg von jedem Feuer verliert die Welt ihre Farben, der Nebel zieht zu,
das Bild wird kalt und eng. Dort werden Schatten geboren, und dort zehrt die
Laterne am schnellsten. Im hellen Feuerlicht dagegen **zerfallen Schatten von
selbst** — sie meiden es schon beim Erscheinen.

Damit ist das Lager keine Verzierung, sondern die Waffe: Ein Lagerfeuer
befriedet seine Umgebung dauerhaft, eine Laterne sichert einen Weg. Man
gewinnt nicht, indem man mehr trifft, sondern indem man mehr Licht in die
Welt setzt.

## Steuerung

| Aktion | Handy | Desktop |
| --- | --- | --- |
| Laufen | irgendwo auf dem Bildschirm ziehen (Joystick erscheint unter dem Finger) | `WASD` / Pfeiltasten |
| Angreifen | Finger loslassen → automatisches Zielen & Schießen (kostet Flamme) | Tasten loslassen |
| Grafik umschalten | ✨-Knopf oben rechts (Schatten an/aus) | ✨-Knopf |

## Lokal starten

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Am Handy im gleichen WLAN: `http://<IP-des-Rechners>:8000`.

## Am Handy testen (GitHub Pages)

Der Workflow `.github/workflows/pages.yml` veröffentlicht den Stand automatisch.
Einmalig nötig: in GitHub unter **Settings → Pages → Build and deployment → Source**
auf **GitHub Actions** stellen (der Workflow kann Pages nicht selbst einschalten —
das darf nur ein Mensch mit Admin-Rechten). Danach den Workflow unter **Actions →
Deploy to GitHub Pages → Run workflow** einmal starten. Danach liegt das Spiel unter
`https://jonizibl.github.io/WebsiteGame/` und lässt sich am Handy wie eine App
zum Startbildschirm hinzufügen.

## Die Figur

Fünf Teile, mehr nicht: Zipfelmütze, Kopf, Bart, Kittel — und die Laterne in
der Hand. Von oben erkennt man ihn an der roten Spitze und dem weißen Bart,
der zugleich zeigt, wohin er schaut. Die Laterne ist keine Verzierung,
sondern die Anzeige: Sie schrumpft, verliert ihre Wärme und rötet sich,
während die Flamme sinkt, pendelt beim Laufen in der Hand und wirft dabei
echtes Licht in die Welt.

Damit die Figur nachts nicht mit der Welt verblasst, verschont der
Dunkelheits-Pass helle Stellen: Je heller ein Bildpunkt, desto weniger
entfärbt und verdunkelt er. Laterne, Feuer und Glut behalten so ihre Wärme,
während alles andere grau und kalt wird — das ist das Bild, von dem das Spiel
lebt.

## Spielgefühl

Das Wichtigste an einem Spiel ist nicht, wie viele Systeme es hat, sondern
was passiert, wenn man etwas trifft. `js/juice.js` kümmert sich darum:

| Mittel | Wofür |
| --- | --- |
| **Bildruck** | 40–160 ms Stillstand bei Treffern, Toden und dem Schlag des Wächters |
| **Kamerawackeln** | Ausschlag mit schnellem Abklingen, gestaffelt nach Wucht |
| **Rückstoß** | Pfeile schubsen Schatten sichtbar weg |
| **Stauchen** | Schatten platten beim Treffer, der Zwerg federt im Schritt |
| **Schockwellen** | flache Ringe bei Tod, Stufenaufstieg und Wächterschlag |
| **Zahlen** | aufsteigende Treffer- und Beutewerte als HTML über der Szene |

Der Bildruck läuft über eine Zeitskala: `juice.update()` bekommt die echte
Bildzeit und gibt die zurück, die das Spiel sehen darf. Die Darstellung läuft
weiter, die Welt steht kurz still.

## Konturlinien

Der Composite-Pass liest die Tiefentextur der Szene und zeichnet dort eine
dunkle Linie, wo die Tiefe springt — also an jeder Silhouette. Die Schwelle
wächst mit der Entfernung, sonst wird die Ferne ein Strichgewirr, und in
unscharfen Bereichen verschwindet die Linie mit der Unschärfe. Das kostet
vier zusätzliche Texturzugriffe und macht aus einer 3D-Szene ein gezeichnetes
Bild.

## Die Schatten

Sie tragen ein Gesicht, das einmal auf ein Canvas gemalt und als Textur
benutzt wird — ein Mesh statt vier Würfelaugen. Es gibt drei: wach,
zugekniffen (getroffen) und panisch. Im Licht wechseln sie auf Panik, suchen
sich mit vier Stichproben die dunkelste Richtung und rennen zappelnd dorthin,
bis sie mit einem „puff!" zerfallen. Beim Tod werden sie platt gedrückt und
trudeln weg.

## Der Kaltstart

Beim Start fällt die Kamera aus der Höhe ein, der Zwerg wacht mit einer
Schockwelle auf, und drei Schatten schieben sich sofort aus dem Boden. Die
ersten zwanzig Sekunden entscheiden bei einem Handyspiel alles — vorher
stand man in einer leeren Wiese.

## Aufbau

```
index.html          Seite, Import-Map, HUD & Menüs
css/style.css       cozy UI (abgerundet, cremefarben, safe-area-tauglich)
js/noise.js         deterministisches Value-Noise + fbm (gleiche Koordinate = gleicher Wert)
js/world.js         Höhenfeld, Chunk-Streaming, Gelände-Mesh, Bäume/Häuser/Steinkreise
js/input.js         Touch-Joystick + Tastatur
js/entities.js      Laternenkind, Schatten, Wächter, Pfeile, Geschosse, Glut, Partikel
js/upgrades.js      Upgrade-Karten, Erfahrungskurve
js/audio.js         synthetisierter Klang (Wind, Feuer, Effekte, Untermalung)
js/villagers.js     Dorfbewohner und Krämerstand
js/critters.js      Rehe, Hasen, Falter und Glühwürmchen
js/camp.js          eigenes Lager: Feuer, Zelt, Laterne, Zaun
js/meshkit.js       verschmilzt Figuren zu je einem Mesh (spart Draw Calls)
js/juice.js         Bildruck, Kamerawackeln, Schockwellen, aufsteigende Zahlen
js/save.js          Spielstand, dauerhafte Verbesserungen, Bestwerte
js/postfx.js        Tilt-Shift (Miniatureffekt) als eigener Render-Pass
js/main.js          Szene, Licht, Kamera, Spielschleife, Kampf-Regel
vendor/three/       three.js (MIT) lokal eingebunden
```

### Wie die Welt entsteht

`heightAt(x, z)` ist eine reine Funktion aus Noise — dieselbe Koordinate ergibt immer
dieselbe Höhe. Dadurch passen Chunks ohne Nahtstellen aneinander und die Welt ist
beliebig groß. Rund um die Figur werden 5×5 Chunks à 56 m gehalten, pro Frame höchstens
einer neu gebaut (~1–5 ms), weiter entfernte werden wieder entsorgt. Bäume, Felsen,
Blumen, Dörfer und Steinkreise streut ein pro Chunk gesäter Zufallsgenerator, alle
Meshes eines Chunks werden pro Material zu einem Mesh zusammengefasst —
im Schnitt ~70 Draw Calls für die ganze sichtbare Welt.

### Schwimmen

Wasser sperrt nichts ab: ab 15 cm Tiefe watet man (72 % Tempo), ab 90 cm
schwimmt man (55 %, träger) und treibt an der Oberfläche, mit Wellenring statt
Schatten. Damit sitzt man nie auf einer Insel fest. Gegner bleiben am Ufer
stehen — eine Insel ist also auch ein sicherer Platz.

### Sammeln und Bauen

In jedem Chunk liegen bis zu neun **Fundstellen**: Birken (Holz), Findlinge
(Stein) und Beerenbüsche. Sie liegen getrennt von den verschmolzenen
Requisiten, damit eine einzelne davon verschwinden kann — beim letzten Schlag
wird das Mesh des Chunks neu gebaut (ein paar Millisekunden). Ihre Meshes
existieren nur im 3×3-Umfeld des Spielers; weiter draußen bleiben nur die
Daten, das spart rund 85 Draw Calls.

Aus dem Material baut man sein **Lager**: Lagerfeuer (4 Holz) heilt und
leuchtet, Zelt (8 Holz, 2 Stein) ist der Platz zum Aufwachen, Laterne und
Zaun halten Licht und Gegner. Alles Gebaute steht in der Welt und im
Spielstand.

### Eine Welt, die bleibt

Jeder Spielstand hat genau einen Welt-Seed. Die Welt ist also immer dieselbe,
das Lager steht beim nächsten Mal noch da, und nach einer Niederlage wacht man
im eigenen Zelt auf statt in einer neuen Welt.

### Lebendige Welt

Rehe und Hasen ziehen in der Nähe umher und fliehen, wenn man auf neun Meter
herankommt. Tagsüber flattern Falter, nachts glimmen Glühwürmchen — dieselbe
Instanz-Wolke, nur anders gefärbt. Die Blätter wiegen sich im Wind: ein
einziger Zeitwert treibt einen Vertex-Shader, der jeden Punkt nach seiner Höhe
im Baum verschiebt (`aSway`).

### Miniatureffekt

`js/postfx.js` zeichnet die Szene in ein Render-Target, weichzeichnet eine halb
aufgelöste Kopie zweimal separabel (horizontal/vertikal) und mischt beides über
eine Maske, die nur ein schmales, leicht geneigtes Band in Bildmitte scharf lässt —
genau der Trick, der echte Landschaften wie Modellbau aussehen lässt. Dazu eine
Spur mehr Sättigung. Die Unschärfe läuft in halber Auflösung, auf dem Handy mit
einem Durchgang statt zwei.

### Facetten ja, Karomuster nein

Der Boden ist bewusst facettiert — jede Kachel hat ihre eigene Normale und
ihre eigene Farbe, die Flächen sollen sichtbar bleiben. Damit daraus kein
Karomuster wird, greifen drei Dinge ineinander:

- die Farbe variiert nur sehr langsam über die Landschaft (Noise-Wellenlänge
  rund 80 m statt 30 m) und die Helligkeit pro Kachel schwankt nur um ±2,5 %
- die Diagonale jeder Kachel kippt abwechselnd, damit keine Richtung im
  Relief dominiert
- das Höhenfeld ist im Detail ruhig gehalten, damit große Flächen als klare
  Ebenen lesen statt als Geflimmer

### Bildlook statt Geometrie

Das Weiche kommt aus dem Post-Processing, nicht aus der Geometrie. Der
Composite-Pass in `js/postfx.js` macht in einem Durchgang:

| Schritt | Wirkung |
| --- | --- |
| Tilt-Shift | scharfes Band in der Mitte, alles andere weich (Miniatureffekt) |
| Bloom aus demselben Unschärfe-Puffer | lässt harte Facettenkanten sanft ineinander laufen |
| Belichtung + Rolloff | Lichter laufen weich aus statt abzuschneiden |
| S-Kurve und Sättigung | gibt den Spielzeugfarben Biss |
| Lift/Gain | leicht angehobene Schatten, warme Lichter — Filmlook |
| Vignette und feines Korn | die Anmutung einer Aufnahme vom Modell |

Dazu ein hoher Anteil Umgebungslicht: die Facetten unterscheiden sich in der
Helligkeit nur wenig, wirken dadurch weich, bleiben aber sichtbar.

### Zwei Materialien für alles

Jedes zusätzliche Material kostet ein Mesh pro Chunk. Deshalb tragen die
Requisiten ihre Farbe in den Eckpunkten: `push()` backt die Farbe aus
`PALETTE` ein und sortiert das Teil nur noch nach „ruhend" oder „im Wind".
Ein Chunk zeichnet damit zwei Meshes statt bis zu zehn — in dichter Gegend
sind das rund 120 Draw Calls statt 230.

### Farbpalette

Bilderbuch statt Tarnfarben: kräftige Wiesengrüne (`#6cba5e` → `#2a6338`),
warmer Sand `#e9d29b`, Türkiswasser `#3f9b95`, Holz `#a9713f`. Häuser tragen
hellen Putz `#f6e6c6` mit rotem Ziegeldach `#c9563f` und cremefarbenem Zierrat
— dieselbe Rolle hat Rot bei Pilzen, Zelten und Gegnern. Der Himmel ist ein
warmes Creme `#ece0c0`, wie der Hintergrund einer Modellbau-Aufnahme.

Häuser bestehen aus Einzelteilen statt aus Kiste plus Kegel: Sockel, Putzwand,
Eckbalken, zwei geneigte Dachflächen mit Firstbalken, Holztür mit Stufe,
Fenster und Kamin. Dörfer bekommen Trittsteinwege vom Platz zu jedem Haus und
ein paar Zäune.

### Regionen

Statt harter Biomgrenzen gibt es zwei weiche Felder: `drynessAt` und
`woodinessAt`. Trockenheit zieht dasselbe Grün ins Goldene, lichtet den Wald
und streut mehr Steine; Bewaldung verdichtet ihn und verschiebt die Nadeln ins
Dunkle. Daraus ergeben sich Wiesen, Hain, Tiefer Wald, Heide und Trockenwald —
der Name der Gegend steht im HUD.

### Fortschritt

Jeder eingesammelte Edelstein ist ein Erfahrungspunkt. Bei einem Stufenaufstieg
hält das Spiel an und bietet drei zufällige Karten an: Doppelschuss, Schnelle
Hand, Scharfe Spitzen, Durchschlag, Weitsicht, Zäh, Leichte Schuhe,
Sammlerglück oder Warme Suppe. Jede Karte hat ein Maximum und stapelt bis
dahin. Mit jeder Stufe werden auch die Gegner zäher.

### Wächter der Steinkreise

Steinkreise senden eine schmale Lichtsäule nach oben — von Weitem das einzige
Ziel in der Landschaft. Im Kreis schläft ein Wächter, zusammengesunken und
unverwundbar, bis jemand auf 15 m herankommt. Dann richtet er sich auf und
kämpft: Er geht schwer auf einen zu, kündigt seinen Schlag mit einem
wachsenden Ring an (wer im Ring steht, kassiert ihn) und ruft ab und zu zwei
Hüpfer zu Hilfe. Sein schmaler Kollisionsradius lässt ihn zwischen den eigenen
Steinen hindurch.

Besiegt lässt er sieben Edelsteine, Heilung und eine sofortige Stufe fallen.
Welche Kreise erledigt sind, merkt sich der Lauf über einen Schlüssel aus den
Koordinaten — ein toter Wächter bleibt tot, auch wenn der Chunk zwischendurch
entladen wird.

### Dorfleben und Handel

Nähert man sich einem Dorf auf 80 m, besetzt `js/villagers.js` es mit fünf
Bewohnern, die zwischen den Häusern umherschlendern, und einem Krämer mit
Stand (cremefarbene Plane, Waren auf dem Tisch, darüber ein schwebendes
Zeichen). Der Krämer dreht sich zu einem hin. Steht man vor dem Stand,
erscheint der Handeln-Knopf.

Im Laden kauft man mit gesammelten Edelsteinen **dauerhafte** Verbesserungen:
Zähe Haut (+20 Startleben), Harter Kern (+1 Grundschaden), Zweiter Pfeil,
Wanderstiefel (+6 % Tempo) und Glückssteine (Gegner lassen öfter zwei Steine
fallen). Gekauftes wirkt sofort, nicht erst im nächsten Lauf.

### Spielstand

`js/save.js` legt Vorrat, gekaufte Verbesserungen und den besten Lauf in
localStorage ab — alles defensiv gelesen, im privaten Modus darf der Zugriff
auch fehlschlagen. Jeder eingesammelte Edelstein wandert sofort in den Vorrat,
gespeichert wird alle zwölf Sekunden sowie beim Verlassen der Seite. Ein
abgebrochener Lauf verliert also nichts — wichtig auf dem Handy.

### Tag und Nacht

Ein voller Umlauf dauert gut fünf Minuten. Zwischen sechs Stützstellen werden
Himmel, Nebel, Sonnenfarbe, Sonnenstärke und Umgebungslicht interpoliert, die
Sonne wandert dabei von Ost nach West. Nachts ist es blaugrau und dämmrig,
Lagerfeuer leuchten spürbar stärker, und es sind mehr Gegner unterwegs. Die
Tageszeit steht im HUD.

### Feuer brauchen Holz

Ein Lagerfeuer und eine Laterne haben Brennstoff. Tagsüber zehren sie kaum,
nachts spürbar, und am schnellsten, wenn Schatten daneben stehen. Ein
erloschenes Feuer bleibt stehen, gibt aber kein Licht mehr — bis man mit
einem Scheit Holz nachlegt (der Aktionsknopf zeigt dann den Füllstand).
Damit hat das Holzsammeln auch nach dem Bau noch einen Grund, und ein Lager
ist etwas, das man pflegt.

### Lichtinseln

Wo einmal ein Feuer stand, erinnert sich das Land daran: Der Boden wird
satter und wärmer, und es blüht dichter — dauerhaft, auch wenn das Feuer
später ausgeht. Die Zonen stehen im Spielstand; wird eine neue angelegt,
baut `world.refreshArea()` die betroffenen Chunks neu auf, damit die
Veränderung sofort sichtbar ist.

### Lichtkarte

Der 🗺️-Knopf öffnet eine Karte, die **nur zeigt, was du erhellt hast**:
jede Lichtinsel als warmer Schein, dein Lager als Punkte (erloschene Feuer
grau), besiegte Wächter als Ringe und dich selbst als Pfeil mit
Blickrichtung. Der Ausschnitt passt sich an, der Maßstab steht unten links.
Eine Karte, die man sich erst erspielt.

### Lagerfeuer

Zelte und einzelne Feuerstellen sind Rastplätze: In 4 m Umkreis heilt man
16 Leben pro Sekunde, das HUD zeigt „Du rastest". Ein einziges wanderndes
Punktlicht sitzt immer auf der nächstgelegenen Feuerstelle — deshalb glimmen
Lager schon von Weitem warm, ohne dass es Dutzende Lichter kostet.

### Lichtkarte

`fireLightAt()` fragt, wie viel **echtes Feuerlicht** an einer Stelle ankommt
(gebaute Feuer und Laternen, Feuerstellen der Welt, zur Hälfte die eigene
Laterne). Daran hängen die Regeln: Schatten zerfallen ab 0,5 und erscheinen
nur unter 0,45.

`ambientAt()` fragt, wie hell es **wirkt** (Tageslicht plus Feuer, die eigene
Laterne nur zu einem Sechstel). Daran hängen Farbe, Nebel und die Brennrate.
Die Trennung ist wichtig: sonst würde die eigene Laterne die Nacht wegleuchten
und das Bild nie dunkel werden.

### Kampf

Stehen bleiben → nach 0,1 s zielt die Figur automatisch auf den nächsten Gegner in
Reichweite und schießt. Sobald man wieder läuft, hört das Schießen auf.

Drei Gegnersorten, die zu unterschiedlichem Verhalten zwingen:

| Sorte | Verhalten |
| --- | --- |
| **Hüpfer** | rennt stur heran und beißt |
| **Brocken** | langsam, zäh, trifft hart |
| **Spucker** | hält 11 m Abstand, bläht sich vorm Schuss sichtbar auf und spuckt — dagegen hilft nur Laufen |

Gegner werden in 17–28 m Entfernung nachgeschoben; je weiter man vom Startpunkt
wegläuft und je höher die eigene Stufe, desto mehr und zähere kommen.

## Klang

`js/audio.js` erzeugt jeden Ton zur Laufzeit mit der Web Audio API — es gibt
keine einzige Audiodatei. Ein Rauschpuffer trägt Wind, Lagerfeuerknistern und
alle Schläge; kurze Oszillatoren mit Hüllkurve machen Bogen, Treffer und
Geschosse. Edelsteine klingen beim schnellen Einsammeln eine Pentatonik
aufwärts, der Stufenaufstieg ist ein Dreiklang, und alle 9–16 Sekunden liegt
ein ruhiger Akkordton darunter. Das Feuer wird aus der Entfernung geregelt, ist
also von selbst räumlich. Browser lassen Ton erst nach einer Geste zu — der
Startknopf schaltet ihn frei, der 🔊-Knopf schaltet ihn stumm (wird gemerkt).

## Nächste Ideen

- Kleine Aufträge der Dorfbewohner („bring mir zehn Steine")
- Wetter: Regen, Nebelbänke, Schnee in kalten Regionen
- Mehr Wächtersorten mit eigenen Angriffsmustern
- Ausrüstung mit Fundstücken statt nur Werten
- Eine Karte, die schon besuchte Gegenden zeigt
