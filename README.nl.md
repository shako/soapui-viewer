# SoapUI Viewer

[English](README.md) · [Viewer downloaden](https://github.com/shako/soapui-viewer/releases/latest/download/SoapUI-Viewer.html)

Een lokale viewer voor **SoapUI XML-projecten**, met zoeken over meerdere projecten en een boom van project → testsuite → testcase → teststep. Voor gebruik is geen SoapUI-installatie, ReadyAPI, Node.js, server of internetverbinding nodig.

## Openen op je Mac

1. Download **[SoapUI-Viewer.html](https://github.com/shako/soapui-viewer/releases/latest/download/SoapUI-Viewer.html)** en dubbelklik erop in Finder. Het bestand opent in je browser. Gebruik een recente Safari, Chrome, Edge of Firefox. Heb je de broncode gedownload, open dan `dist/index.html`.
2. Sleep één of meerdere volledige SoapUI XML-projecten op het venster, of kies **Projecten openen**.
3. Typ bijvoorbeeld `CRL`. De boom toont de onderdelen met matches en hun bovenliggende projecten, suites en cases.
4. Selecteer een onderdeel. Rechts zie je het volledige pad, het bronbestand en de velden waarin de term voorkomt. Selecteer bijvoorbeeld `config / script` voor een Groovy-script.
5. Gebruik **Toon alle … stappen** om ook de stappen zonder match in die testcase te zien. Die blijven selecteerbaar voor context. Met **Ook velden zonder match tonen** bekijk je de overige inhoud van een onderdeel.

In de keuzelijst **Inhoud** staan tijdens het zoeken de velden met de meeste matches bovenaan, met het aantal vóór de veldnaam. Velden met en zonder matches staan in aparte groepen. Bij het openen van een onderdeel wordt het veld met de meeste matches gekozen. Het gekozen veld krijgt een gele achtergrond als het matches bevat; kleuren binnen de open keuzelijst hangen af van de browser.

**Probeer een voorbeeld met CRL** opent twee kleine fictieve projecten. Zo kun je de viewer uitproberen zonder klantgegevens.

Het getal bij een tak telt alle matches in die tak, inclusief onderliggende onderdelen. Het label **naam**, **inhoud** of **naam + inhoud** geeft aan waar het geselecteerde onderdeel zelf matcht. Een suite krijgt geen eigen match doordat een step eronder matcht.

De pijlen boven de tekst springen naar de vorige of volgende match in het gekozen veld. Grote velden worden in opeenvolgende fragmenten getoond; de volledige inhoud en alle matches blijven bereikbaar. `⌘K` / `Ctrl+K` focust het zoekvak. In de boom werken de pijltjestoetsen en Home/End.

Sleep de scheidingslijn tussen de projectboom en de inhoud om de linkerkolom breder te maken. De breedte wordt onthouden in deze browser. Je kunt de scheidingslijn ook met Tab focussen en met links/rechts aanpassen. De knop **Inklappen / Uitklappen** wisselt automatisch en bedient de volledige zichtbare boom; bij een zoekterm blijven alleen relevante takken en gekozen testcasecontext zichtbaar.

## Recente bestanden heropenen

Via **Recent** open je de laatste 10 projecten opnieuw, ook na het sluiten en opnieuw openen van de viewer.

- **Heropenen** leest het originele bestand opnieuw wanneer de browser directe bestandstoegang ondersteunt. De browser kan opnieuw om leestoegang vragen. Dit werkt via een bestandshandle uit de bestandskiezer of slepen, wanneer beschikbaar.
- **Kopie openen** opent de versie die op de getoonde datum lokaal in de browser is bewaard. Dit is de terugval wanneer directe bestandstoegang niet beschikbaar is. Ook boven de geopende inhoud staat dat het een kopie is. Gebruik **Bestanden kiezen…** voor een nieuwere versie van het oorspronkelijke XML-bestand.
- Een project dat nog geopend is, staat als **Geopend** in de lijst. Sluit de geopende projecten om het opnieuw in te lezen.
- **Verwijderen** en **Recente lijst wissen** verwijderen de betreffende verwijzingen en kopieën uit de browseropslag. De geopende weergave en oorspronkelijke bestanden worden niet gewijzigd. De voorbeelden komen niet in de recente lijst.

Deze opslag hoort bij de browser en de locatie van de viewer. Een andere browser, verplaatsen/hernoemen van het HTML-bestand, privémodus of browsergegevens wissen kan de lijst onbeschikbaar maken. Als browseropslag geblokkeerd of vol is, blijft handmatig openen werken en meldt de viewer dat bewaren niet gelukt is. Er wordt geen blijvende opslag afgedwongen en er is geen synchronisatie met een server.

## Bestanden en privacy

- Zoeken en uitlezen gebeuren in het geheugen van de browser. Voor **Recent** bewaart de viewer een bestandsverwijzing of een lokale kopie in IndexedDB. De viewer verstuurt geen data en heeft geen externe scripts, fonts, analytics of API's. De ingebouwde Content Security Policy blokkeert netwerkverbindingen.
- De viewer leest bestanden en voert geen Groovy-scripts of requests uit. Je oorspronkelijke XML-bestanden worden niet gewijzigd.
- Je kunt meerdere projecten tegelijk openen of later toevoegen. **Sluiten** sluit alle geopende projecten; de recente lijst blijft behouden. Na herladen kun je bestanden opnieuw kiezen of via **Recent** heropenen.
- Eén volledig XML-bestand per project wordt ondersteund. Composite projecten met losse bestanden per suite/case moeten eerst als één volledig XML-project geëxporteerd worden. Versleutelde projecten moeten eerst ontsleuteld worden. XML met DTD's wordt afgewezen.
- Zoeken is letterlijk, standaard niet hoofdlettergevoelig, zonder regex. Namen, XML-attribuutwaarden, tekstwaarden, CDATA en XML-commentaar worden doorzocht. Dat omvat scripts, requests, properties, assertions en setup/teardown-inhoud op elk niveau. XML-elementnamen en namespace-declaraties zijn geen zoekvelden. Uitgeschakelde steps worden meegenomen.
- De getoonde XML-regel verwijst naar de openingstag van het onderdeel (bij een openingstag over meerdere regels: de laatste regel daarvan). **Vanaf tekstregel** boven een fragment verwijst naar de regel binnen dat veld. Ook XML-projecten die vrijwel volledig op één regel staan zijn bruikbaar.

## Grote projecten

De XML-parser leest bestanden in blokken van 256 KiB in een Web Worker. De inhoud blijft in die worker; de interface ontvangt alleen structuur, zoekresultaten en het gekozen tekstfragment. De boom toont alleen de rijen rond het zichtbare venster.

De automatische schaaltest opent twee gegenereerde projecten van elk 29,7 MiB (circa 31 MB), samen 24.000 steps, en controleert alle 2.400 verwachte zoekmatches en hun paden. Dit is een functionele test in Node.js, geen gemeten browserprestatie of test van jouw klantproject. Geheugengebruik hangt af van de inhoud en is groter dan de bestandsgrootte; er is geen harde bestandsgroottelimiet ingebouwd.

## Delen

Geef alleen **`dist/index.html`** door. Je mag het bestand hernoemen naar bijvoorbeeld **`SoapUI Viewer.html`**. Alle benodigde code en de licenties van meegeleverde bibliotheken zitten erin. De klantprojecten en recente lijst zitten uitsluitend in jouw browseropslag en worden niet in het gedeelde HTML-bestand opgenomen.

De broncode en releases staan op [GitHub](https://github.com/shako/soapui-viewer). Gebruik voor eventuele lokale klantbestanden de genegeerde map `private-projects/`. Deel geen klantprojecten of gevoelige gegevens in publieke issues of pull requests.

## Zelf bouwen

Alleen voor ontwikkeling is Node.js 22 of hoger nodig:

```sh
npm ci
npm test
npm run build
```

De uitvoer is opnieuw één zelfstandig bestand: `dist/index.html`. De runtime gebruikt saxes 6.0.0 en xmlchars 2.2.0; esbuild is uitsluitend een bouwafhankelijkheid.

`src/core.js` bevat de parser en zoeklogica; `src/worker.js` de achtergrondtaak; `src/app.js` de interface; `src/recents.js` de recente bestanden; `src/splitter.js` de kolombreedte. De tests controleren onder andere namespaces, streaming, encodings, CDATA, correcte toewijzing aan suites/cases/steps, grote bestanden en de worker in het gebouwde HTML-bestand. De recente opslag wordt getest met fake-indexeddb (alleen een testafhankelijkheid), inclusief heropenen in een nieuwe sessie, bewaren van een kopie groter dan 23 MB, deduplicatie en verwijderen. Browserafhankelijke toestemming voor originele bestanden is getest met gesimuleerde handles; daadwerkelijke browserrechten zijn niet automatisch geverifieerd.

Browsers die de experimentele WebMCP-interface aanbieden krijgen optioneel dezelfde zoekactie als tool. Dat is geen vereiste voor de viewer. Deze optionele integratie is niet in een ondersteunde WebMCP-browsercontext geverifieerd.

## Toekomstige richting

Een vergelijking op basis van de SoapUI-structuur past in deze repository. Dit is nog niet geïmplementeerd:

1. Twee volledige XML-projectbestanden vergelijken en toegevoegde, verwijderde en gewijzigde suites, cases en steps tonen, met tekstverschillen in scripts en requests.
2. Dezelfde vergelijking eventueel gebruiken vanuit een commandlinetool die twee Git-versies uitleest en een leesbaar tekstrapport of viewer-rapport maakt.

De XML-parser en vergelijkingslogica kunnen worden gedeeld tussen viewer en commandlinetool. Matching bij hernoemingen en verplaatsingen, gewijzigde stapvolgorde en het negeren van onbelangrijke XML-opmaak vragen een afzonderlijk ontwerp. De eerste release bevat alleen de zoekviewer.

## Licentie

[MIT](LICENSE). De licenties van de viewer en de meegeleverde bibliotheken zitten ook in het HTML-bestand. Dit is een onafhankelijke tool, geen officieel product van SmartBear.
