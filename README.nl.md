# SoapUI Viewer

[English](README.md) · [Huidige versie downloaden (ZIP)](https://github.com/shako/soapui-viewer/archive/refs/heads/main.zip) · [Releases](https://github.com/shako/soapui-viewer/releases)

Doorzoek grote **SoapUI XML-projecten** of vergelijk twee versies via een boom van project → testsuite → testcase → teststep. Een SoapUI-installatie of ReadyAPI-licentie is niet nodig.

De interface is in het Engels. De onderstaande knopnamen komen overeen met de viewer.

| Wat wil je doen? | Wat heb je nodig? |
| --- | --- |
| Projecten doorzoeken of twee XML-bestanden vergelijken | Open `dist/index.html` in je browser. Na het downloaden is geen installatie, server of internetverbinding nodig. |
| Je werkbestand vergelijken met een Git-branch of tag | Download of clone deze repository, installeer Node.js 22+ en Git en start `npm run compare:git`. Bouwen of `npm install` is niet nodig. |

## Openen op je Mac

1. Download de **[huidige repository als ZIP](https://github.com/shako/soapui-viewer/archive/refs/heads/main.zip)**, pak hem uit en dubbelklik op `dist/index.html` in Finder. Of clone de repository en open hetzelfde bestand. Gebruik een recente Safari, Chrome, Edge of Firefox.
2. Sleep één of meerdere volledige SoapUI XML-projecten op het venster, of kies **Open projects**.
3. Typ bijvoorbeeld `CRL`. De boom toont de onderdelen met matches en hun bovenliggende projecten, suites en cases.
4. Selecteer een onderdeel. Rechts zie je het volledige pad, het bronbestand en de velden waarin de term voorkomt. Selecteer bijvoorbeeld `config / script` voor een Groovy-script.
5. Gebruik **Show all … steps** om ook de stappen zonder match in die testcase te zien. Die blijven selecteerbaar voor context. Met **Include fields without matches** bekijk je de overige inhoud van een onderdeel.

De ZIP staat ook onder **Code → Download ZIP** op GitHub. De losse **[SoapUI-Viewer.html-release](https://github.com/shako/soapui-viewer/releases/latest/download/SoapUI-Viewer.html)** kan achterlopen op `main` en nieuwere functies missen. Gebruik `dist/index.html` uit de repository voor de functies in deze handleiding. De bestandsweergave op GitHub toont de HTML-broncode; download het bestand om het te gebruiken.

Met **Search in** beperk je de zoekactie tot **All text**, **Names** (namen van projecten, suites, cases en steps), **Properties** (custom propertynamen en -waarden op projecten, suites, cases en in stepconfiguraties) of **Content** (scripts, requests en overige velden, behalve die namen en properties). De boom, aantallen en markeringen volgen dezelfde filter. Andere velden blijven bereikbaar via **Include fields without matches**.

In de keuzelijst **Content** staan tijdens het zoeken de velden met de meeste matches bovenaan, met het aantal vóór de veldnaam. Velden met en zonder matches staan in aparte groepen. Bij het openen van een onderdeel wordt het veld met de meeste matches gekozen. Het gekozen veld krijgt een gele achtergrond als het matches bevat; kleuren binnen de open keuzelijst hangen af van de browser.

**Try an example with CRL** opent twee kleine fictieve projecten. Zo kun je de viewer uitproberen zonder klantgegevens.

De samenvatting bovenaan toont in hoeveel projecten, suites, cases en steps matches gevonden zijn. Elk onderdeel telt één keer, ook als de match in een onderliggende stap zit. De aantallen onderaan de boom blijven de totalen van alle geladen onderdelen.

Het getal bij een tak telt alle matches in die tak, inclusief onderliggende onderdelen. De labels **name**, **properties** en **content**, eventueel gecombineerd, geven aan waar het geselecteerde onderdeel zelf matcht. Een suite krijgt geen eigen match doordat een step eronder matcht.

De pijlen boven de tekst springen naar de vorige of volgende match in het gekozen veld. Grote velden worden in opeenvolgende fragmenten getoond; de volledige inhoud en alle matches blijven bereikbaar. `⌘K` / `Ctrl+K` focust het zoekvak. In de boom werken de pijltjestoetsen en Home/End.

Sleep de scheidingslijn tussen de projectboom en de inhoud om de linkerkolom breder te maken. De breedte wordt onthouden in deze browser. Je kunt de scheidingslijn ook met Tab focussen en met links/rechts aanpassen. De knop **Collapse / Expand** wisselt automatisch en bedient de volledige zichtbare boom; bij een zoekterm blijven alleen relevante takken en gekozen testcasecontext zichtbaar.

Uitgeschakelde suites, cases en steps krijgen in Viewer en Compare een subtiel **Disabled**-label naast hun naam. Een statuswijziging verschijnt als **Enabled → Disabled** of **Disabled → Enabled**; bij de XML-kolommen zie je welke versie uitgeschakeld is.

Klik ergens op een project-, suite- of caserij om die open of dicht te klappen en de inhoud te bekijken. Een stap zonder onderliggende items toont alleen de inhoud.

Bij hover verschijnt **Copy** om de volledige naam te kopiëren, zonder de selectie of uitgeklapte takken te wijzigen. Op een aanraakscherm is de knop altijd zichtbaar. Via het toetsenbord: selecteer een rij met de pijltjestoetsen, druk Tab om **Copy** te bereiken en Enter of spatie om te kopiëren.

## Twee versies vergelijken

Open `dist/index.html` voor **Viewer** en **Compare** in hetzelfde HTML-bestand. Voor twee XML-bestanden die je op schijf kiest, is de Git-helper niet nodig.

1. Open **Compare**. Instellingen, filters en aantallen staan in de linkerkolom; rechts krijgt de XML-diff de beschikbare hoogte. Sleep één volledig XML-project op **Before** en één op **After**. Met **Choose local XML** kan het ook. Controleer de bestandsnamen; **⇄** wisselt de twee kanten.
2. Klik **Compare**. **Comparison setup** klapt daarna automatisch dicht; klik erop om opnieuw versies te kiezen. Standaard staat **Only changes** aan: je ziet alleen gewijzigde takken. Zet dit uit om ook ongewijzigde onderdelen te bekijken.
3. Klik een suite, case of step. Je ziet wat toegevoegd, verwijderd of gewijzigd is, inclusief wijzigingen in de volgorde van steps. De status van een parent telt wijzigingen in de children mee. Dichtklappen sluit ook alle onderliggende onderdelen; die blijven gesloten als je de tak opnieuw opent. **Copy** staat rechts naast de wijzigingsstatus.
4. **Include formatting changes** staat standaard uit. Zet dit aan om ook attribuutvolgorde, inspringing, quotes, CDATA-schrijfwijze en lege-elementnotatie te vergelijken. Takken met alleen zulke verschillen krijgen **≈ Formatting**. De bestanden worden hiervoor niet opnieuw ingelezen.
5. Rechts staat de geformatteerde XML naast elkaar, met rood voor vóór en groen voor na. Binnen gewijzigde regels staan de gewijzigde tekens automatisch in donkerder rood/groen; overeenkomstige tekst behoudt de lichte achtergrond. Bij zeer grote wijzigingen kan alleen de regelachtergrond blijven staan wanneer de fijne vergelijking haar limiet bereikt. **Show unchanged XML lines** toont alle context. Grote fragmenten hebben pagina's; **↳** vervolgt een lange regel. Er wordt geen inhoud afgekapt. De XML scrolt apart; paginaknoppen blijven onderaan. Extra uitleg en child-links staan onder **Details and changed children**.

Bij een suite/case/project toont de XML-weergave de **eigen** properties, attributen, scripts en instellingen. Onderliggende suites/cases/steps staan apart in de boom en de lijst met gewijzigde children. Bij een step zie je de volledige XML van die step. De fragmenten zijn bedoeld om te lezen, niet als export of patch. **Show original XML (including formatting)** toont de originele gedecodeerde XML van dat onderdeel en staat automatisch aan bij **≈ Formatting**. Spaties, tabs en carriage returns worden zichtbaar als **·**, **⇥** en **␍**. Onderliggende hierarchy-items blijven apart; XML-declaraties en commentaar buiten de projectroot worden niet vergeleken. **Include ID changes** staat standaard uit: opnieuw gegenereerde `id`-attributen op projecten, suites, cases en steps tellen niet mee en worden in beide XML-weergaven weggelaten. Zet de optie aan om ze te vergelijken en te tonen. IDs in requests en properties, werkelijke waarden en scriptspaties blijven significant.

**Try an example** toont fictieve wijzigingen. De bestanden voor Compare blijven alleen in het geheugen; **Clear** sluit ze. Ze worden niet toegevoegd aan Recent. Je kunt tussen Viewer en Compare wisselen zonder hun toestand kwijt te raken.

Matching gebruikt eerst unieke SoapUI-ID's en daarna unieke namen onder dezelfde parent. Hernoemingen met een stabiel ID blijven één gewijzigd onderdeel. Bij onduidelijke dubbele namen, een hernoeming zonder ID of een verplaatsing naar een andere parent kan iets als verwijderd en toegevoegd verschijnen. XML-inspringing en attribuutvolgorde worden genegeerd; scriptspaties en tekstwaarden blijven significant. Zie de [Engelse handleiding](README.md#compare-two-project-versions) voor de precieze normalisatie en beperkingen.

De schaaltest vergelijkt twee synthetische bestanden van elk **27,9 MiB**, met 12.000 steps per versie. Dit is een functionele Node-test, geen browserbenchmark.

## Git-versies vergelijken (optioneel)

Hiervoor heb je **Node.js 22+, Git en een clone of ZIP van deze repository** nodig. Alleen het losse HTML-bestand volstaat niet voor Git-toegang. Bouwen of `npm install` is niet nodig.

Open een terminal in de **applicatiemap van SoapUI Viewer**, waar `package.json` staat. Dit is een andere map dan de Git-repository met je SoapUI-projecten, die je daarna kiest. Start de lokale Git-helper:

```sh
npm run compare:git
```

De browser opent de vergelijker. Vul bij **Git repository folder** jouw Git-map in en klik **Open**. Slepen of vooraf bestanden exporteren is niet nodig. Je kunt de map ook bij het starten meegeven:

```sh
npm run compare:git -- "/volledig/pad/naar/jouw-gitmap"
```

Een XML-bestand als startargument blijft ook werken en selecteert dat bestand vooraf.

1. Kies onder **Current working copy** met **Choose working file** je SoapUI XML. Dit gebruikt je uitgecheckte branch, inclusief opgeslagen, niet-gecommitte wijzigingen. Een relatief repositorypad invoeren kan ook.
2. Kies onder **Compare with** een andere **Branch**. Typ in de dropdown om te zoeken. Hetzelfde relatieve bestandspad wordt automatisch gebruikt, zonder checkout. HEAD en tags zijn ook beschikbaar.
3. Wil je op die branch een ander bestand, klik dan **Choose a different file**. Je werkbestand blijft behouden. **Use the working file path again** herstelt het standaardpad. Ontbreekt één bestand, dan stopt de vergelijking met een melding van de versie, het pad en de repository. Kies een andere branch/ander bestand of open de juiste repository; een ontbrekend bestand wordt nooit als een leeg project behandeld.
4. Klik **Compare**. De branchversie is Before en de werkversie is After. De ingelezen Git-versies tonen hun commit-hash in de instellingen.

**Recent repositories** onthoudt de laatste 20 succesvol geopende mappen, nieuwste eerst. Klik in het mapveld of open **Recent repositories** en klik op een pad om de map opnieuw te openen. Bij het starten is het laatste pad alvast ingevuld; openen gebeurt pas via **Open** of een klik op de historiek. **Clear history** wist de lijst zonder je huidige repository te sluiten. De paden staan lokaal in `.soapui-viewer/repositories.json` in de applicatiemap van de viewer; `.gitignore` sluit die map uit. Dit blijft werken na een herstart of een andere localhost-poort. Er wordt geen XML-inhoud in opgeslagen.

Een ingevoerde submap blijft in het mapveld staan. De bovenliggende Git-repository wordt apart vermeld en de bestandskiezer zoekt eerst in die submap. Wis de zoektekst om de rest van de repository te bekijken. Branches horen altijd bij die repository: voor branches uit een andere clone open je de map van die clone. Een repository met maar één branch wordt expliciet aangeduid.

Branches en tags staan op laatste commit, nieuwste eerst, met lokale datum en tijd. Gemergede branches worden standaard verborgen, behalve de hoofdbranch, huidige branch en geselecteerde versie. **Show merged branches** toont ze opnieuw; de lijst meldt hoeveel er verborgen zijn. Dit gebruikt lokale Git-afstamming ten opzichte van main/master, geen PR-status. Open de repository opnieuw om de branchlijst te vernieuwen; er gebeurt geen fetch.

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

De automatische schaaltest opent twee gegenereerde projecten van elk 29,7 MiB (circa 31 MB), samen 24.000 steps, en controleert alle 2.400 verwachte zoekmatches en hun paden. Dit is een functionele test in Node.js, geen gemeten browserprestatie of test van jouw klantproject. Geheugengebruik hangt af van de inhoud en is groter dan de bestandsgrootte. Handmatig openen heeft geen ingebouwde bestandsgroottelimiet; de Git-helper accepteert bestanden tot 256 MiB.

## Delen en bijwerken

- Voor zoeken en het vergelijken van twee XML-bestanden geef je **`dist/index.html`** door. Hernoemen naar bijvoorbeeld **`SoapUI-Viewer.html`** mag. Alle benodigde code en licenties zitten erin; geopende projecten en historiek worden niet in het gedeelde HTML-bestand opgenomen.
- Voor Git-vergelijkingen deel je de [repositorylink](https://github.com/shako/soapui-viewer). Elke collega downloadt of clonet de repository en start zelf de helper met de instructies hierboven. Jouw `127.0.0.1`- of `localhost`-link werkt alleen op jouw computer. Iedereen kiest zijn eigen lokale Git-repository; projectbestanden worden niet geüpload.

Werk een clone bij met `git pull --ff-only` in de applicatiemap van de viewer. Gebruik je een ZIP, download en pak dan een nieuwe kopie van `main` uit. `dist/index.html` is al gebouwd. Open de HTML opnieuw, of stop de draaiende Git-helper met **Ctrl+C** en start opnieuw met `npm run compare:git`. Alleen de oude helperpagina verversen laadt de nieuwe build niet.

De repositoryhistoriek hoort bij die kopie van de viewer. Een nieuwe ZIP in een andere map begint met een eigen historiek. Bewaar `.soapui-viewer/repositories.json` in je applicatiemap als je die bij het bijwerken wilt behouden.

De broncode en releases staan op [GitHub](https://github.com/shako/soapui-viewer). Gebruik voor eventuele lokale klantbestanden de genegeerde map `private-projects/`. Deel geen klantprojecten of gevoelige gegevens in publieke issues of pull requests.

## Zelf bouwen

Voor ontwikkeling en de optionele Git-starter is Node.js 22 of hoger nodig. Om zelf te bouwen:

```sh
npm ci
npm test
```

`npm test` bouwt eerst `dist/index.html` en voert daarna de tests uit. Met `npm run build` bouw je alleen de HTML opnieuw. Commit die mee wanneer de broncode verandert; CI controleert dat beide overeenkomen. De runtime gebruikt saxes 6.0.0, xmlchars 2.2.0 en jsdiff 8.0.4; esbuild is uitsluitend een bouwafhankelijkheid.

`src/core.js` bevat de parser en zoeklogica; `src/worker.js` de achtergrondtaak; `src/app.js` de interface; `src/recents.js` de recente bestanden; `src/splitter.js` de kolombreedte. De tests controleren onder andere namespaces, streaming, encodings, CDATA, correcte toewijzing aan suites/cases/steps, grote bestanden en de worker in het gebouwde HTML-bestand. De recente opslag wordt getest met fake-indexeddb (alleen een testafhankelijkheid), inclusief heropenen in een nieuwe sessie, bewaren van een kopie groter dan 23 MB, deduplicatie en verwijderen. Browserafhankelijke toestemming voor originele bestanden is getest met gesimuleerde handles; daadwerkelijke browserrechten zijn niet automatisch geverifieerd.

Browsers die de experimentele WebMCP-interface aanbieden krijgen optioneel dezelfde zoekactie als tool. Dat is geen vereiste voor de viewer. Deze optionele integratie is niet in een ondersteunde WebMCP-browsercontext geverifieerd.

## Toekomstige richting

Viewer en Compare zitten in dezelfde repository en HTML, met aparte modules voor de vergelijking. Mogelijke vervolgstappen zijn een tekstrapport voor PR's, kiezen uit de commitgeschiedenis, matching van verplaatsingen tussen parents en filters voor automatisch gegenereerde metadata.

## Licentie

[MIT](LICENSE). De licenties van de viewer en de meegeleverde bibliotheken zitten ook in het HTML-bestand. Dit is een onafhankelijke tool, geen officieel product van SmartBear.
