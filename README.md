# Navigator

A [Vertex](https://github.com/CTRL-Neo-Studios/vertex) plugin: your notes in two panes, after Obsidian's Notebook
Navigator. Folders, tags and properties on one side; on the other, the notes of the one you pick, each with some of its
text, its tags, its date and a picture. It can stand in for Files. A sample of the files' side of the plugin API, built
with [`@type32/vertex-plugin`](https://www.npmjs.com/package/@type32/vertex-plugin).

- **The navigation pane:** Shortcuts, Recent files, the workspace's folders with how many files each holds, Tags
  (nested by `/`, with Untagged), and Properties (each property notes have, and its values). Click one to list it.
- **The list pane:** the files, Pinned first, then by date (Today, Yesterday, Previous 7 days, Previous 30 days, then
  months and years); click a group's heading to fold it. Its header: Search (a name, or `#tag`), Include subfolders,
  Sort (by date modified, date created or name), Colour and icon, New.
- **One pane or two:** in a narrow sidebar the list replaces the navigation, with Back; with room (560 px, a setting)
  both show. Open it in a tab (the panel's Open in tab) and the list is cards in columns.
- **A file manager's hands:** click, Cmd/Ctrl-click and Shift-click select; arrows and Enter; right-click for Vertex's
  file menu (New, Rename, Duplicate, Delete…); Cmd/Ctrl+C and V, Delete, Cmd/Ctrl+Z. Drag rows onto a folder to move
  them, into a note to link them, or out to Finder; drop files from outside onto a folder to bring them in.
- **Drop notes on a tag** and they get it, in their frontmatter. One undo takes it back from all of them.
- **Pin** a note to keep it on top, **add to shortcuts** a note, a folder or a tag, give a folder, a tag or a note a
  **colour and icon**: all from the right-click menu (Files' menu has them too).

What you pin, your shortcuts, colours, icons, each folder's sort and Include subfolders are kept with the workspace
(`.vertex/plugins-data/navigator.json`), so they travel with it and follow renames made in Vertex. Recent files, what
you last picked and what's folded stay on this device.

Settings → Navigator: notes only, preview lines, tags, dates, pictures, date groups, how many recent files, the width
for two panes. A workspace can change each for itself.

## Install

Settings → Plugins → Install…, and paste `https://github.com/CTRL-Neo-Studios/vertex-plugin-navigator`. To use it
instead of Files, turn Files off on the same page.

## What it shows of the plugin API

| | Where | Docs |
| --- | --- | --- |
| A panel view that also opens in a tab, with header buttons | `src/main.ts`, `src/Navigator.vue` | [`ctx.views.panel`](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/context.md#ctxviewspanel) |
| The index, reactive: files, the tree, properties, tags, dates | `src/navigator.ts`, `src/model.ts` | [The index](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/session.md#the-index) |
| Vertex's file menu, New items, clipboard, delete and undo | `src/ListPane.vue`, `src/NavPane.vue` | [`session.files.menuFor`, `newItems`](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/session.md#sessionfilesmenufor-sessionfilesnewitems) |
| Items of its own in that menu | `src/main.ts`, `src/state.ts` | [`ctx.files.menuItem`](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/context.md#ctxfilesmenuitem) |
| Drags as Files' rows, drops from the system | `src/navigator.ts` | [`session.files.drag`](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/session.md#sessionfilesdragstart-sessionfilesdragrows-sessionfilesdragcarries), [`importDrop`](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/session.md#sessionfilesimportattachments-sessionfilesimportdrop-sessionfilesoutside) |
| Notes edited as one undo step, frontmatter written as Obsidian does | `src/state.ts` (`addTag`) | [`session.files.edit`](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/session.md#sessionfilesedit), [`vault`](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/session.md#sessionfilesvault) |
| Data kept with the workspace, and data kept on the device | `src/state.ts` | [`ctx.data`](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/config.md#ctxdataglobal-ctxdataworkspace) |
| Following renames by uuid | `src/state.ts`, `movesBetween` in `src/model.ts` | [`session.index.on`](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/session.md#sessionindexon) |
| A dialog of its own | `src/LookModal.vue`, `src/state.ts` | [Nuxt UI](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/ui.md#nuxt-ui) |
| Settings a workspace may change | `plugin.json` | [The schema](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/config.md#the-schema) |
| Commands in the palette and the View menu | `src/main.ts` | [`ctx.commands.register`](https://github.com/CTRL-Neo-Studios/vertex/blob/dev/packages/vertex-plugin/docs/context.md#ctxcommandsregister) |

## Develop

```sh
bun install
bun test            # tags, properties, lists, sorting, groups, previews, the data and renames
bun run typecheck
bun run build       # dist/ (with this README) and plugin.zip
```

Install `dist/` in Vertex (Settings → Plugins → Install… ▾ → From a folder) and run `bunx vite build --watch`.
Releases: push a tag with `plugin.json`'s version (`v0.1.0`).
