# SoapUI Viewer

Find the test behind the text. Search large **SoapUI XML projects** and see exactly which project, test suite, test case and test step contains each match.

The viewer is a **single HTML file** that runs locally in your browser. No installation, server, internet connection, SoapUI installation or ReadyAPI license is needed to use it. The interface is in English.

[Nederlandse handleiding](README.nl.md) · [Download the viewer](https://github.com/shako/soapui-viewer/releases/latest/download/SoapUI-Viewer.html) · [Releases](https://github.com/shako/soapui-viewer/releases)

## Get started

1. Download **[SoapUI-Viewer.html](https://github.com/shako/soapui-viewer/releases/latest/download/SoapUI-Viewer.html)** from the latest release and keep it in a folder on your computer.
2. Double-click it to open it in a recent desktop browser, such as Safari, Chrome, Edge or Firefox.
3. Drop one or more complete SoapUI `.xml` project files onto the window, or click **Open projects**.
4. Enter a search term, such as `CRL`. Select a result to see its full path and highlighted content.

To try it without your own projects, click **Try an example with CRL**. This opens two fictional projects bundled with the viewer.

You can also download the repository with **Code → Download ZIP**, extract it, and open `dist/index.html`. GitHub's source-file preview displays the HTML source; download the file before opening it.

## What it does

- Searches across multiple projects at once, including names, Groovy scripts, requests, properties, assertions, setup/teardown scripts and other text values.
- Keeps the project → suite → case → step hierarchy visible, showing matching branches and their parents.
- Shows how many projects, suites, cases and steps contain matches above the tree. Each item counts once, including parents of matching steps; the footer shows totals for all loaded items.
- Marks whether an item matches in its name, properties or other content. Counts on a branch include its descendants without duplicating those matches as matches in the parent itself.
- Offers **Show all … steps** to reveal the other steps in a matching testcase for context.
- Groups content fields with matches first, ordered by match count, and lets you jump between every occurrence.
- Provides a resizable project column, a **Collapse / Expand** toggle, and recent projects.
- Click anywhere on a project, suite or case row to expand or collapse it and view its content. Steps without children simply show their content.
- Hover over a row and choose **Copy** to copy its full name without changing the selection or expanding/collapsing the row. Touch devices always show the button.

**Search in** limits matches to **All text**, **Names** (project, suite, case and step names), **Properties** (custom property names and values on projects, suites, cases and in step configurations), or **Content** (scripts, requests and other fields, excluding those names and properties). Tree matches, summary counts and content highlights all follow this filter. Use **Include fields without matches** to inspect other fields for context.

Search is literal, case-insensitive by default, with an optional case-sensitive mode. It is not a regular-expression search. Disabled test steps are included.

**Keyboard:** `⌘K` / `Ctrl+K` focuses search. Arrow keys and Home/End navigate the project tree. Press Tab from the tree to reach **Copy** for the selected row, then Enter or Space to copy its name. The column divider also supports keyboard resizing after focusing it with Tab.

## Compare two project versions

The current source build includes **Viewer / Compare** in the same standalone HTML file. Open `dist/index.html` to use it; a previously downloaded release may be older.

1. Select **Compare**. **Comparison setup**, sources, filters and totals live in the left column; the XML panel uses the full available height on the right.
2. Drop one complete project XML onto **Before** and one onto **After**, or use **Choose XML**. Dropping two files together fills the two sides; check their labels and use **⇄** to swap them if needed.
3. Select **Compare**. Setup collapses automatically after a successful comparison; click **Comparison setup** to reopen it. **Only changes** is on by default; switch it off to include unchanged items.
4. Select a project, suite, case or step. The tree marks additions, removals, changes and changes in child order. Parent status and counts include changes in descendants.
5. **Include formatting changes** is off by default. Turn it on to expose changes in attribute order, indentation, quote style, CDATA spelling or empty-element syntax. These branches are marked **≈ Formatting** when they contain no semantic changes; they are included in the changed count. This updates the comparison without rereading files.
6. Inspect the formatted XML side by side: red is before, green is after. **Show unchanged XML lines** reveals all context. **Previous / Next** pages through long fragments without truncating their contents. The XML area scrolls independently, with paging at the bottom. Extra explanations and child links are under **Details and changed children**.

**Try an example** demonstrates a renamed step, a changed Groovy statement and an added step using fictional data. Viewer and Compare keep their own state when you switch modes. Comparison files stay in memory and are not added to Recent; **Clear** releases the comparison.

For projects, suites and cases, the XML panel shows **that item's own XML** (attributes, properties, scripts, settings, etc.). Descendant suites/cases/steps are separate items in the tree and the changed-child list. Selecting a step shows its complete XML. These are normalized inspection fragments, not project exports or patches to apply. **Show original XML (including formatting)** displays the decoded source fragment instead; it turns on automatically for formatting-only selections. Spaces, tabs and carriage returns are marked **·**, **⇥** and **␍** so whitespace differences are visible. Nested hierarchy items remain omitted from parent fragments in both views. XML declarations and comments outside the project root are not included, even with formatting changes enabled. Actual property values, IDs and script whitespace remain significant by default.

Matching and limits:

- Matches unique SoapUI IDs first, then unique names of the same kind within the same parent. A stable ID preserves a rename as a change.
- Identical duplicate siblings at the same position can be retained. Changed ambiguous duplicates are shown as additions/removals rather than guessed matches. A rename without a stable ID and a move to another parent may appear as removal plus addition.
- Detects order changes among matched siblings; inserting a step does not mark every later step as reordered. Positions in the detail panel refer to the original child order.
- Ignores element-only indentation, attribute order, quote style, CDATA versus escaped text and empty-element spelling. Text values, script whitespace, mixed content, comments inside the root, processing instructions and `xml:space` remain significant. XML declarations and comments outside the project root are ignored. Namespace prefix changes can still produce differences.
- Long lines are displayed in consecutive segments marked **↳**. Large unrelated changes use complete before/after blocks if fine diff alignment reaches its time or edit limit. All text remains accessible.
- Comparison runs in the worker and the tree is virtualized. A synthetic test compares **two 27.9 MiB files with 12,000 steps each**, verifying one changed step and its three ancestors. This is a Node functional test, not a browser benchmark.

## Compare local Git versions (optional)

The optional helper reads your local Git repository and offers a version and XML file on each side. No dragging or exporting files is needed.

You need **Node.js 22+ and Git**, plus a clone or ZIP of this repository. No build or `npm install` is required when using the included `dist/index.html`.

From the SoapUI Viewer repository folder, start the helper:

```sh
npm run compare:git
```

The browser opens **Compare**. Enter your local folder in **Git repository folder** and click **Open**. You can also start with a repository folder already selected:

```sh
npm run compare:git -- "/absolute/path/to/your-repository"
```

An XML file path is still accepted as the optional argument, to preselect that file.

1. Choose a **Version** under **Before** and **After**: HEAD, the saved working copy, a local branch, an already available remote-tracking branch, or a tag. In a feature branch, repository mode initially proposes `main` (or `master`) versus the current branch. Otherwise it proposes HEAD versus the working copy. You can change either side.
2. Use **Project file** to select or type a repository-relative XML path. Suggestions come from the selected version, including files that only exist on another branch. Clear the input or type part of the path to narrow suggestions; any relative XML path may also be entered. XML candidates are validated as SoapUI projects when you compare them.
3. **Use the same file path on both sides** is on initially. The After path follows Before. A branch change keeps the selected path, even if absent there, and shows a notice. **Compare** displays it as an addition/removal.
4. To compare a renamed file or different project exports, uncheck **Use the same file path on both sides** and choose each path independently. **Swap** exchanges both the versions and paths. The helper does not guess renames.
5. Select **Compare**. Commit hashes appear with loaded Git snapshots in setup. Reopen a repository to refresh its branch/tag list, or enter another folder to switch repositories.

The working-copy list includes tracked and untracked, non-ignored XML files that currently exist. An ignored XML path can still be entered explicitly. Unsaved editor changes are not included. This is a comparison of two selected project files, not a directory diff. A path absent on both sides requires choosing different inputs.

The helper does not fetch, check out, write, execute project scripts or modify your repository. Stop it with **Ctrl+C**. If the browser does not open automatically, use the local URL printed in Terminal.

It binds only to `127.0.0.1` on a temporary port and uses a random session URL. Reads are confined to regular `.xml` files in the chosen repository; path traversal, `.git` paths and symlinks are rejected. Files are limited to 256 MiB. Repository selection is accepted only from the helper's own page. Its page permits requests to that local origin; the downloaded standalone HTML continues to block network connections and compares manually selected files.

## Local files and recent projects

The viewer does not upload data, execute scripts, send requests from your projects, or modify your original files. It has no remote scripts, fonts, analytics or API calls. The standalone HTML has an embedded Content Security Policy that blocks network connections. The optional Git helper permits only its local origin, as described above.

For **Recent**, it stores up to ten entries in this browser's local IndexedDB:

- **Reopen** reads the original file again when the browser supports persistent file handles. The browser may request read permission again.
- **Open copy** opens a locally saved copy when direct file access is unavailable. Its capture date is shown in the recent list and above the opened content. Re-select the original XML file to see changes made after that date.

**Remove** or **Clear recent list** removes the relevant entries and cached copies from browser storage. **Close** closes the currently loaded projects while keeping the recent list. No project data or recent history is embedded in the HTML file you share with colleagues.

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

Use **Node.js 22 or later**. Node.js is needed for development and the optional Git helper; people using the downloaded HTML file do not need it.

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
| `src/worker.js` | Background parsing, search and comparison |
| `src/compare-core.js`, `src/compare-ui.js` | Structural matching, bounded XML diffs and Compare mode |
| `scripts/git-compare.mjs` | Optional read-only local Git helper |
| `src/app.js` | Browser interface |
| `src/recents.js` | Local recent-file storage and reopening |
| `src/splitter.js` | Resizable project column |
| `src/index.html`, `src/style.css` | Layout and styles |
| `scripts/build.mjs` | Bundle everything into one offline HTML file |
| `tests/` | Parser, search, storage, large-file and bundled-worker checks |

The runtime bundles saxes, xmlchars and jsdiff. esbuild, fake-indexeddb and linkedom are development dependencies only. Comparison controls have DOM tests with simulated layout/form behavior. The Git helper and comparison layout have also been checked in the Codex in-app browser with a synthetic repository, including independent branch/file selection and unchanged XML panel height when setup expands. Browser-specific file permissions are not covered by those checks. Optional WebMCP integration exposes the same search action in browsers that support it; it is not required for normal use. Browser-native permission prompts and WebMCP have not been verified through automated browser testing; recent-file storage is tested with fake-indexeddb and file-handle behavior with simulated handles.

## Future direction

Viewer and Compare share the same repository and downloadable HTML. Comparison code lives in separate modules so search stays independent. Possible follow-up work includes a PR-friendly text report, a commit-history picker, matching moves across parents and optional noise filters for generated metadata.

## Feedback and contributions

Issues and pull requests are welcome. Include your browser/version, steps to reproduce, expected behavior and actual behavior. Use the bundled demo or a small fictional XML example when possible.

**Do not attach customer projects, credentials, tokens, private endpoints or recordings containing them to public issues or pull requests.** Keep local project files in `private-projects/`, which is ignored by Git. XML exports, common key files and recordings are also ignored by default. Use synthetic data in tests.

Keep changes focused and run `npm test` before submitting a pull request.

## License

[MIT](LICENSE). The standalone HTML also includes the viewer's license and the notices for its bundled dependencies; see [THIRD-PARTY-LICENSES.txt](THIRD-PARTY-LICENSES.txt). This is an independent tool, not an official SmartBear product.
