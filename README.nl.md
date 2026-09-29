# SoapUI Viewer

[English](README.md) · [Viewer downloaden](https://github.com/shako/soapui-viewer/releases/latest/download/SoapUI-Viewer.html)

Een lokale viewer voor **SoapUI XML-projecten**, met zoeken over meerdere projecten en een boom van project → testsuite → testcase → teststep. Voor gebruik is geen SoapUI-installatie, ReadyAPI, Node.js, server of internetverbinding nodig.

De interface is in het Engels. De onderstaande knopnamen komen overeen met de viewer.

## Openen op je Mac

1. Download **[SoapUI-Viewer.html](https://github.com/shako/soapui-viewer/releases/latest/download/SoapUI-Viewer.html)** en dubbelklik erop in Finder. Het bestand opent in je browser. Gebruik een recente Safari, Chrome, Edge of Firefox. Heb je de broncode gedownload, open dan `dist/index.html`.
2. Sleep één of meerdere volledige SoapUI XML-projecten op het venster, of kies **Open projects**.
3. Typ bijvoorbeeld `CRL`. De boom toont de onderdelen met matches en hun bovenliggende projecten, suites en cases.
4. Selecteer een onderdeel. Rechts zie je het volledige pad, het bronbestand en de velden waarin de term voorkomt. Selecteer bijvoorbeeld `config / script` voor een Groovy-script.
5. Gebruik **Show all … steps** om ook de stappen zonder match in die testcase te zien. Die blijven selecteerbaar voor context. Met **Include fields without matches** bekijk je de overige inhoud van een onderdeel.

Met **Search in** beperk je de zoekactie tot **All text**, **Names** (namen van projecten, suites, cases en steps), **Properties** (custom propertynamen en -waarden op projecten, suites, cases en in stepconfiguraties) of **Content** (scripts, requests en overige velden, behalve die namen en properties). De boom, aantallen en markeringen volgen dezelfde filter. Andere velden blijven bereikbaar via **Include fields without matches**.

In de keuzelijst **Content** staan tijdens het zoeken de velden met de meeste matches bovenaan, met het aantal vóór de veldnaam. Velden met en zonder matches staan in aparte groepen. Bij het openen van een onderdeel wordt het veld met de meeste matches gekozen. Het gekozen veld krijgt een gele achtergrond als het matches bevat; kleuren binnen de open keuzelijst hangen af van de browser.

**Try an example with CRL** opent twee kleine fictieve projecten. Zo kun je de viewer uitproberen zonder klantgegevens.

De samenvatting bovenaan toont in hoeveel projecten, suites, cases en steps matches gevonden zijn. Elk onderdeel telt één keer, ook als de match in een onderliggende stap zit. De aantallen onderaan de boom blijven de totalen van alle geladen onderdelen.

Het getal bij een tak telt alle matches in die tak, inclusief onderliggende onderdelen. De labels **name**, **properties** en **content**, eventueel gecombineerd, geven aan waar het geselecteerde onderdeel zelf matcht. Een suite krijgt geen eigen match doordat een step eronder matcht.

De pijlen boven de tekst springen naar de vorige of volgende match in het gekozen veld. Grote velden worden in opeenvolgende fragmenten getoond; de volledige inhoud en alle matches blijven bereikbaar. `⌘K` / `Ctrl+K` focust het zoekvak. In de boom werken de pijltjestoetsen en Home/End.

Sleep de scheidingslijn tussen de projectboom en de inhoud om de linkerkolom breder te maken. De breedte wordt onthouden in deze browser. Je kunt de scheidingslijn ook met Tab focussen en met links/rechts aanpassen. De knop **Collapse / Expand** wisselt automatisch en bedient de volledige zichtbare boom; bij een zoekterm blijven alleen relevante takken en gekozen testcasecontext zichtbaar.

Klik ergens op een project-, suite- of caserij om die open of dicht te klappen en de inhoud te bekijken. Een stap zonder onderliggende items toont alleen de inhoud.

Bij hover verschijnt **Copy** om de volledige naam te kopiëren, zonder de selectie of uitgeklapte takken te wijzigen. Op een aanraakscherm is de knop altijd zichtbaar. Via het toetsenbord: selecteer een rij met de pijltjestoetsen, druk Tab om **Copy** te bereiken en Enter of spatie om te kopiëren.

## Twee versies vergelijken

De huidige broncode en lokale `dist/index.html` bevatten de nieuwe modus **Compare**, naast **Viewer**. Een eerder gedownloade release kan nog ouder zijn.

1. Open **Compare**. Instellingen, filters en aantallen staan in de linkerkolom; rechts krijgt de XML-diff de beschikbare hoogte. Sleep één volledig XML-project op **Before** en één op **After**. Met **Choose XML** kan het ook. Controleer de bestandsnamen; **⇄** wisselt de twee kanten.
2. Klik **Compare**. **Comparison setup** klapt daarna automatisch dicht; klik erop om opnieuw versies te kiezen. Standaard staat **Only changes** aan: je ziet alleen gewijzigde takken. Zet dit uit om ook ongewijzigde onderdelen te bekijken.
3. Klik een suite, case of step. Je ziet wat toegevoegd, verwijderd of gewijzigd is, inclusief wijzigingen in de volgorde van steps. De status van een parent telt wijzigingen in de children mee.
4. **Include formatting changes** staat standaard uit. Zet dit aan om ook attribuutvolgorde, inspringing, quotes, CDATA-schrijfwijze en lege-elementnotatie te vergelijken. Takken met alleen zulke verschillen krijgen **≈ Formatting**. De bestanden worden hiervoor niet opnieuw ingelezen.
5. Rechts staat de geformatteerde XML naast elkaar, met rood voor vóór en groen voor na. **Show unchanged XML lines** toont alle context. Grote fragmenten hebben pagina's; **↳** vervolgt een lange regel. Er wordt geen inhoud afgekapt. De XML scrolt apart; paginaknoppen blijven onderaan. Extra uitleg en child-links staan onder **Details and changed children**.

Bij een suite/case/project toont de XML-weergave de **eigen** properties, attributen, scripts en instellingen. Onderliggende suites/cases/steps staan apart in de boom en de lijst met gewijzigde children. Bij een step zie je de volledige XML van die step. De fragmenten zijn bedoeld om te lezen, niet als export of patch. **Show original XML (including formatting)** toont de originele gedecodeerde XML van dat onderdeel en staat automatisch aan bij **≈ Formatting**. Spaties, tabs en carriage returns worden zichtbaar als **·**, **⇥** en **␍**. Onderliggende hierarchy-items blijven apart; XML-declaraties en commentaar buiten de projectroot worden niet vergeleken. Werkelijke waarden, ID's en scriptspaties blijven standaard significant.

**Try an example** toont fictieve wijzigingen. De bestanden voor Compare blijven alleen in het geheugen; **Clear** sluit ze. Ze worden niet toegevoegd aan Recent. Je kunt tussen Viewer en Compare wisselen zonder hun toestand kwijt te raken.

Matching gebruikt eerst unieke SoapUI-ID's en daarna unieke namen onder dezelfde parent. Hernoemingen met een stabiel ID blijven één gewijzigd onderdeel. Bij onduidelijke dubbele namen, een hernoeming zonder ID of een verplaatsing naar een andere parent kan iets als verwijderd en toegevoegd verschijnen. XML-inspringing en attribuutvolgorde worden genegeerd; scriptspaties en tekstwaarden blijven significant. Zie de [Engelse handleiding](README.md#compare-two-project-versions) voor de precieze normalisatie en beperkingen.

De schaaltest vergelijkt twee synthetische bestanden van elk **27,9 MiB**, met 12.000 steps per versie. Dit is een functionele Node-test, geen browserbenchmark.

## Git-versies vergelijken (optioneel)

Start de lokale Git-helper vanuit de SoapUI Viewer-repositorymap:

```sh
npm run compare:git
```

De browser opent de vergelijker. Vul bij **Git repository folder** jouw Git-map in en klik **Open**. Slepen of vooraf bestanden exporteren is niet nodig. Je kunt de map ook bij het starten meegeven:

```sh
npm run compare:git -- "/volledig/pad/naar/jouw-gitmap"
```

Hiervoor zijn **Node.js 22+ en Git** nodig. Met de meegeleverde HTML hoef je niet te builden of `npm install` uit te voeren. Een XML-bestand als startargument blijft ook werken en selecteert dat bestand vooraf.

- Kies onder **Before** en **After** elk een **Version**: HEAD, de opgeslagen werkversie, een lokale branch, een reeds aanwezige remote branch of een tag. In een featurebranch wordt aanvankelijk main/master tegenover die featurebranch voorgesteld; anders HEAD tegenover de werkversie.
- Bij **Project file** kies of typ je het XML-pad binnen de repository. De suggesties komen uit de gekozen versie. Maak het veld leeg of typ een deel van de naam om andere bestanden te vinden. Ook bestanden die alleen op een andere branch bestaan zijn zo bereikbaar.
- **Use the same file path on both sides** staat standaard aan. De rechterkant volgt het linker bestandspad. Ontbreekt het bestand op de andere branch, dan krijg je een melding; vergelijken toont de toevoeging/verwijdering.
- Wil je een hernoemd of ander bestand vergelijken, zet die optie uit en kies elk pad afzonderlijk. **Swap** wisselt branches én bestandspaden. Er wordt niet automatisch geraden naar hernoemingen.
- Klik **Compare**. De ingelezen Git-versies tonen hun commit-hash in de instellingen. Open dezelfde repository opnieuw om de branchlijst te vernieuwen, of voer een andere map in.

De werkversie bevat opgeslagen bestanden, inclusief niet-gecommitte XML die niet door Git wordt genegeerd. Genegeerde XML kun je via een expliciet pad kiezen. De bestandslijst bevat XML-kandidaten; bij vergelijken wordt gecontroleerd of het volledige SoapUI-projecten zijn. Dit blijft een vergelijking van twee gekozen bestanden, geen directorycompare.

De repository wordt niet gewijzigd: geen checkout, fetch of uitvoering van scripts. Stop met **Ctrl+C**. De helper luistert alleen op `127.0.0.1` met een tijdelijke poort en sessielink. Alleen reguliere XML-bestanden binnen de gekozen repository kunnen gelezen worden (tot 256 MiB); symlinks, paden buiten de repository en `.git` zijn uitgesloten. De losse HTML zonder helper blijft werken met handmatig gekozen bestanden.

## Recente bestanden heropenen

Via **Recent** open je de laatste 10 projecten opnieuw, ook na het sluiten en opnieuw openen van de viewer.

- **Reopen** leest het originele bestand opnieuw wanneer de browser directe bestandstoegang ondersteunt. De browser kan opnieuw om leestoegang vragen. Dit werkt via een bestandshandle uit de bestandskiezer of slepen, wanneer beschikbaar.
- **Open copy** opent de versie die op de getoonde datum lokaal in de browser is bewaard. Dit is de terugval wanneer directe bestandstoegang niet beschikbaar is. Ook boven de geopende inhoud staat dat het een kopie is. Gebruik **Choose files** voor een nieuwere versie van het oorspronkelijke XML-bestand.
- Een project dat nog geopend is, staat als **Open** in de lijst. Sluit de geopende projecten om het opnieuw in te lezen.
- **Remove** en **Clear recent list** verwijderen de betreffende verwijzingen en kopieën uit de browseropslag. De geopende weergave en oorspronkelijke bestanden worden niet gewijzigd. De voorbeelden komen niet in de recente lijst.

Deze opslag hoort bij de browser en de locatie van de viewer. Een andere browser, verplaatsen/hernoemen van het HTML-bestand, privémodus of browsergegevens wissen kan de lijst onbeschikbaar maken. Als browseropslag geblokkeerd of vol is, blijft handmatig openen werken en meldt de viewer dat bewaren niet gelukt is. Er wordt geen blijvende opslag afgedwongen en er is geen synchronisatie met een server.

## Bestanden en privacy

- Zoeken en uitlezen gebeuren in het geheugen van de browser. Voor **Recent** bewaart de viewer een bestandsverwijzing of een lokale kopie in IndexedDB. De viewer verstuurt geen data en heeft geen externe scripts, fonts, analytics of API's. De ingebouwde Content Security Policy van de losse HTML blokkeert netwerkverbindingen. De optionele Git-starter laat alleen zijn lokale oorsprong toe.
- De viewer leest bestanden en voert geen Groovy-scripts of requests uit. Je oorspronkelijke XML-bestanden worden niet gewijzigd.
- Je kunt meerdere projecten tegelijk openen of later toevoegen. **Close** sluit alle geopende projecten; de recente lijst blijft behouden. Na herladen kun je bestanden opnieuw kiezen of via **Recent** heropenen.
- Eén volledig XML-bestand per project wordt ondersteund. Composite projecten met losse bestanden per suite/case moeten eerst als één volledig XML-project geëxporteerd worden. Versleutelde projecten moeten eerst ontsleuteld worden. XML met DTD's wordt afgewezen.
- Zoeken is letterlijk, standaard niet hoofdlettergevoelig, zonder regex. Namen, XML-attribuutwaarden, tekstwaarden, CDATA en XML-commentaar worden doorzocht. Dat omvat scripts, requests, properties, assertions en setup/teardown-inhoud op elk niveau. XML-elementnamen en namespace-declaraties zijn geen zoekvelden. Uitgeschakelde steps worden meegenomen.
- De getoonde XML-regel verwijst naar de openingstag van het onderdeel (bij een openingstag over meerdere regels: de laatste regel daarvan). **From text line** boven een fragment verwijst naar de regel binnen dat veld. Ook XML-projecten die vrijwel volledig op één regel staan zijn bruikbaar.

## Grote projecten

De XML-parser leest bestanden in blokken van 256 KiB in een Web Worker. De inhoud blijft in die worker; de interface ontvangt alleen structuur, zoekresultaten en het gekozen tekstfragment. De boom toont alleen de rijen rond het zichtbare venster.

De automatische schaaltest opent twee gegenereerde projecten van elk 29,7 MiB (circa 31 MB), samen 24.000 steps, en controleert alle 2.400 verwachte zoekmatches en hun paden. Dit is een functionele test in Node.js, geen gemeten browserprestatie of test van jouw klantproject. Geheugengebruik hangt af van de inhoud en is groter dan de bestandsgrootte; er is geen harde bestandsgroottelimiet ingebouwd.

## Delen

Geef alleen **`dist/index.html`** door. Je mag het bestand hernoemen naar bijvoorbeeld **`SoapUI Viewer.html`**. Alle benodigde code en de licenties van meegeleverde bibliotheken zitten erin. De klantprojecten en recente lijst zitten uitsluitend in jouw browseropslag en worden niet in het gedeelde HTML-bestand opgenomen.

De broncode en releases staan op [GitHub](https://github.com/shako/soapui-viewer). Gebruik voor eventuele lokale klantbestanden de genegeerde map `private-projects/`. Deel geen klantprojecten of gevoelige gegevens in publieke issues of pull requests.

## Zelf bouwen

Voor ontwikkeling en de optionele Git-starter is Node.js 22 of hoger nodig. Om zelf te bouwen:

```sh
npm ci
npm test
npm run build
```

De uitvoer is opnieuw één zelfstandig bestand: `dist/index.html`. De runtime gebruikt saxes 6.0.0, xmlchars 2.2.0 en jsdiff 8.0.4; esbuild is uitsluitend een bouwafhankelijkheid.

`src/core.js` bevat de parser en zoeklogica; `src/worker.js` de achtergrondtaak; `src/app.js` de interface; `src/recents.js` de recente bestanden; `src/splitter.js` de kolombreedte. De tests controleren onder andere namespaces, streaming, encodings, CDATA, correcte toewijzing aan suites/cases/steps, grote bestanden en de worker in het gebouwde HTML-bestand. De recente opslag wordt getest met fake-indexeddb (alleen een testafhankelijkheid), inclusief heropenen in een nieuwe sessie, bewaren van een kopie groter dan 23 MB, deduplicatie en verwijderen. Browserafhankelijke toestemming voor originele bestanden is getest met gesimuleerde handles; daadwerkelijke browserrechten zijn niet automatisch geverifieerd.

Browsers die de experimentele WebMCP-interface aanbieden krijgen optioneel dezelfde zoekactie als tool. Dat is geen vereiste voor de viewer. Deze optionele integratie is niet in een ondersteunde WebMCP-browsercontext geverifieerd.

## Toekomstige richting

Viewer en Compare zitten in dezelfde repository en HTML, met aparte modules voor de vergelijking. Mogelijke vervolgstappen zijn een tekstrapport voor PR's, kiezen uit de commitgeschiedenis, matching van verplaatsingen tussen parents en filters voor automatisch gegenereerde metadata.

## Licentie

[MIT](LICENSE). De licenties van de viewer en de meegeleverde bibliotheken zitten ook in het HTML-bestand. Dit is een onafhankelijke tool, geen officieel product van SmartBear.
