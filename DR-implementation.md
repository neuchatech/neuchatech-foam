# Neuchatech Foam – Deep Research Implementation Notes

This file captures implementation-level technical notes for the Neuchatech fork of the Foam VSCode plugin.

## 🧰 Foam Architecture Overview

- **Foam Repo**: https://github.com/foambubble/foam
- **Core Plugin Location**: `packages/foam-vscode/`
- **Graph UI Location**: `packages/foam-vscode/static/dataviz/graph.html` and related JS files
- **Graph Data Construction**: `src/features/dataviz/graph.ts`

## 🧩 Core Components to Modify

### 1. `graph.ts` – Graph Data Generation

Modify `generateGraphData` or wherever the node/edge model is assembled:

- **Add folder hierarchy**:
  - Create structural links from a folder's index file (`README.md`, `index.md`) to each note inside that folder
  - If no such file, generate synthetic node like `folder:/repice/`
- **Edge Metadata**:
  - Add `type: 'structural' | 'reference' | 'tag'` to edge data

### 2. `graph.html` + D3 Logic (JS)

This is where the graph is rendered in the webview.

- **Visual styling**:
  - Different stroke styles/colors for structural vs reference edges
  - Structural: thicker, gray
  - Reference: default color
- **Force layout tweaks**:
  - Give structural edges higher spring force (keeps folders tight)
  - Ensure folders are spaced out radially or hierarchically
- **Node label display**:
  - Show only folder/index node labels at zoom < 0.5
  - Show more file labels as zoom increases

### 3. Config / Settings

- Add VSCode settings under:
  - `foam.graph.showStructuralLinks`
  - `foam.graph.showReferenceLinks`
  - `foam.graph.structuralLineColor`
  - `foam.graph.structuralForceStrength`

These can be wired to toggles in the UI.

---

## 🧠 Implementation Notes

### Detecting README.md or index.md as Folder Root

```ts
function getFolderNode(folderPath: string): Node {
  if (fs.exists(`${folderPath}/README.md`)) return loadNote(`${folderPath}/README.md`)
  if (fs.exists(`${folderPath}/index.md`)) return loadNote(`${folderPath}/index.md`)
  return {
    id: `folder:${folderPath}`,
    title: path.basename(folderPath),
    type: 'folder'
  }
}
````

### Edge Types in Graph Data

```ts
edges.push({
  source: folderNodeId,
  target: noteId,
  type: 'structural'
})

edges.push({
  source: noteId,
  target: linkedNoteId,
  type: 'reference'
})
```

### Visual Link Styling

In `graph.js`:

```js
link.attr('stroke', d => {
  if (d.type === 'structural') return '#888'
  if (d.type === 'reference') return '#4A90E2'
})
link.attr('stroke-width', d => d.type === 'structural' ? 2.5 : 1)
```

---

## 🧪 Testing

* Create a sample workspace with:

  * Nested folders
  * README.md in each
  * Normal wiki links
* Verify:

  * Folder nodes appear and link structurally
  * README file becomes the node for folder
  * Zoom level affects visibility of labels
  * Edge toggle works

---

## 🛣 Future Tasks (Nice to Have)

* Support alternative index names via config
* Tooltip on hover for note metadata (frontmatter)
* Click folder node to collapse/expand subtree
* Export as JSON/SVG
* Structural override via frontmatter: `parent: ../path/to/parent`

---

## 📂 Example Directory

```
📁 wiki/
├── 📁 notes/
│   ├── README.md  ← root node for this folder
│   ├── note-a.md
│   └── note-b.md → [[note-a]]
├── 📁 concepts/
│   ├── folder.md  ← manually defined index
│   └── idea.md
├── index.md
```

* `index.md → notes/README.md` (structural)
* `note-b.md → note-a.md` (reference)
* `concepts/folder.md → idea.md` (structural)

---

## 🔗 Useful Links

* Foam repo: [https://github.com/foambubble/foam](https://github.com/foambubble/foam)
* d3-force: [https://github.com/d3/d3-force](https://github.com/d3/d3-force)
* dagre graphlib (alternative): [https://github.com/dagrejs/graphlib](https://github.com/dagrejs/graphlib)
* VSCode extension docs: [https://code.visualstudio.com/api](https://code.visualstudio.com/api)
