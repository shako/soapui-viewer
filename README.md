# SoapUI Viewer

Find the test behind the text. Search large **SoapUI XML projects** and see exactly which project, test suite, test case and test step contains each match.

The viewer is a **single HTML file** that runs locally in your browser. No installation, server, internet connection, SoapUI installation or ReadyAPI license is needed to use it. The interface is currently in Dutch.

[Nederlandse handleiding](README.nl.md) · [Download the viewer](https://github.com/shako/soapui-viewer/releases/latest/download/SoapUI-Viewer.html) · [Releases](https://github.com/shako/soapui-viewer/releases)

## Get started

1. Download **[SoapUI-Viewer.html](https://github.com/shako/soapui-viewer/releases/latest/download/SoapUI-Viewer.html)** from the latest release and keep it in a folder on your computer.
2. Double-click it to open it in a recent desktop browser, such as Safari, Chrome, Edge or Firefox.
3. Drop one or more complete SoapUI `.xml` project files onto the window, or click **Projecten openen**.
4. Enter a search term, such as `CRL`. Select a result to see its full path and highlighted content.

To try it without your own projects, click **Probeer een voorbeeld met CRL**. This opens two fictional projects bundled with the viewer.

You can also download the repository with **Code → Download ZIP**, extract it, and open `dist/index.html`. GitHub's source-file preview displays the HTML source; download the file before opening it.

## What it does

- Searches across multiple projects at once, including names, Groovy scripts, requests, properties, assertions, setup/teardown scripts and other text values.
- Keeps the project → suite → case → step hierarchy visible, showing matching branches and their parents.
- Marks whether an item matches in its name, content, or both. Counts on a branch include its descendants without duplicating those matches as matches in the parent itself.
- Offers **Toon alle … stappen** to reveal the other steps in a matching testcase for context.
- Groups content fields with matches first, ordered by match count, and lets you jump between every occurrence.
- Provides a resizable project column, an **Inklappen / Uitklappen** toggle, and recent projects.

Search is literal, case-insensitive by default, with an optional case-sensitive mode. It is not a regular-expression search. Disabled test steps are included.

**Keyboard:** `⌘K` / `Ctrl+K` focuses search. Arrow keys and Home/End navigate the project tree. The column divider also supports keyboard resizing after focusing it with Tab.

## Local files and recent projects

The viewer does not upload data, execute scripts, send requests from your projects, or modify your original files. It has no remote scripts, fonts, analytics or API calls. An embedded Content Security Policy blocks network connections.

For **Recent**, it stores up to ten entries in this browser's local IndexedDB:

- **Heropenen** reads the original file again when the browser supports persistent file handles. The browser may request read permission again.
- **Kopie openen** opens a locally saved copy when direct file access is unavailable. Its capture date is shown in the recent list and above the opened content. Re-select the original XML file to see changes made after that date.

**Verwijderen** or **Recente lijst wissen** removes the relevant entries and cached copies from browser storage. **Sluiten** closes the currently loaded projects while keeping the recent list. No project data or recent history is embedded in the HTML file you share with colleagues.

Storage is specific to the browser and the viewer's location. Moving or renaming the HTML file, changing browsers, using private browsing or clearing browser data may make the recent list unavailable. If storage is blocked or full, manual file opening still works and the viewer reports that it could not save a recent entry.

## Supported input and limits

- One complete SoapUI XML export per project, with a `soapui-project` root element. Multiple project files can be opened together.
- Composite projects split across directories must first be exported as a complete XML file. Encrypted projects must first be decrypted in SoapUI. XML with a DTD is rejected.
- Search includes names, XML attribute values, text values, CDATA and XML comments. XML element names and namespace declarations are not separate search fields.
- The XML line shown for an item points to the end of its opening tag. Line numbers above content fragments refer to that field's text. The hierarchy also works when the source XML is mostly on one very long line.
- Large content fields are displayed in consecutive fragments. The complete field and every match remain accessible.
- This is a read-only inspection tool: it does not edit, save changes to, or run SoapUI projects.

Parsing and search run in a Web Worker. The parser reads in 256 KiB chunks, and the interface renders only the visible portion of the project tree. The automated scale test checks two generated files of **29.7 MiB each**, containing **24,000 steps in total**, and verifies all 2,400 expected matches and their hierarchy. This is a synthetic functional test in Node.js, not a browser benchmark or a guarantee for every project. Memory use depends on the contents and exceeds the XML file size.

## Development

Use **Node.js 22 or later**. Node.js is needed for development only; people using the downloaded HTML file do not need it.

```sh
git clone https://github.com/shako/soapui-viewer.git
cd soapui-viewer
npm ci
npm test
```

`npm test` builds the standalone viewer and then runs the tests. `npm run build` only rebuilds `dist/index.html`. Commit the rebuilt HTML whenever its source changes so people downloading the repository get the same version as the source. CI checks this on pushes and pull requests.

| File | Purpose |
| --- | --- |
| `src/core.js` | Streaming XML parser, search and tree projection |
| `src/worker.js` | Background parsing and search |
| `src/app.js` | Browser interface |
| `src/recents.js` | Local recent-file storage and reopening |
| `src/splitter.js` | Resizable project column |
| `src/index.html`, `src/style.css` | Layout and styles |
| `scripts/build.mjs` | Bundle everything into one offline HTML file |
| `tests/` | Parser, search, storage, large-file and bundled-worker checks |

The runtime bundles saxes and xmlchars. esbuild and fake-indexeddb are development dependencies only. Optional WebMCP integration exposes the same search action in browsers that support it; it is not required for normal use. Browser-native permission prompts and WebMCP have not been verified through automated browser testing; recent-file storage is tested with fake-indexeddb and file-handle behavior with simulated handles.

## Future direction

A structural SoapUI comparison belongs in this repository. It is **not implemented** in the first release. Possible follow-up work:

1. Compare two complete XML project files and show added, removed and changed suites, cases and steps, with readable text diffs for scripts and requests.
2. Reuse that comparison in an optional command-line entry point that reads two Git revisions and produces a text report or a viewer report.

The XML model and comparison logic can be shared by the viewer and a CLI. Rename/move matching, step-order changes and ignoring irrelevant XML formatting need a separate design. No Git integration or project comparison is available yet.

## Feedback and contributions

Issues and pull requests are welcome. Include your browser/version, steps to reproduce, expected behavior and actual behavior. Use the bundled demo or a small fictional XML example when possible.

**Do not attach customer projects, credentials, tokens, private endpoints or recordings containing them to public issues or pull requests.** Keep local project files in `private-projects/`, which is ignored by Git. XML exports, common key files and recordings are also ignored by default. Use synthetic data in tests.

Keep changes focused and run `npm test` before submitting a pull request.

## License

[MIT](LICENSE). The standalone HTML also includes the viewer's license and the notices for its bundled dependencies; see [THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt). This is an independent tool, not an official SmartBear product.
