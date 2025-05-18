# Neuchatech Foam – Custom Graph Explorer for Markdown Wikis

This project is a fork of the Foam VSCode extension to implement a smarter and more structured knowledge graph. The key goals are to enhance the visualization and semantic structure of personal wikis by integrating **file hierarchy**, **custom node behavior**, and **improved UX** into the Foam graph panel.

This document provides a high-level roadmap for the project.

---

## 🧭 Goals

1. **Dual Relationship Model**
   - Show both:
     - Reference links (`[[wikilinks]]`, `#tags`, etc.)
     - Structural links (folder hierarchy, special parent-child relationships)

2. **Smarter Node Behavior**
   - Use `README.md` or designated index files as the main node for a folder.
   - Display clean and zoom-adaptive node titles (e.g. show only top-level folders when zoomed out).

3. **Better UX and Control**
   - Highlight differences between structural and reference links visually.
   - Let user toggle visibility and weight of structural/reference links.
   - Provide an elegant, tree-first graph layout, with wikilinks bringing context-aware "cross-branches".

---

## 🔱 Overview of Strategy

- **Start from the official Foam repo**:
  - GitHub: [https://github.com/foambubble/foam](https://github.com/foambubble/foam)
  - Extension ID: `foam.foam-vscode`
  - The graph view lives in the WebView under `static/dataviz`, with supporting logic in `src/core/`.

- **Create a fork** of the repo:
  - Name: `neuchatech/foam`
  - Maintain easy upgradeability from upstream
  - Isolate our custom logic in a `neuchatech` namespace or a feature flag if needed

---

## 🧩 Components to Build

### 1. **Graph Model Changes**

#### ➤ Add Structural Links
- For each note, create an edge from its parent folder (or index file) to itself.
- Create folder nodes (`id: "folder:/path/to/folder"`) for structure.
- Use `README.md` or special files (e.g. `index.md`, `folder.md`) as the visual anchor node of a folder.

#### ➤ Edge Typing
- Add `type: 'reference' | 'structural' | 'tag'` to each edge.
- Render edges with type-aware styles and behaviors.

#### ➤ Folder Nodes
- Option 1: Add actual folder nodes.
- Option 2 (preferred): Use a note within the folder (e.g. `README.md`) as the node for the folder, and attach all structural links to that.

### 2. **Graph Rendering Enhancements**

#### ➤ Visual Differentiation
- Structural links: thicker, more stable spring force, gray color.
- Reference links: thinner, more flexible, blue or colored.

#### ➤ Adaptive Node Titles
- Show only top-level folders and key nodes at low zoom.
- Gradually reveal child nodes' labels as you zoom in.

#### ➤ Layout Bias
- Use force-directed simulation with stronger spring constants for structural edges.
- Ensure a quasi-tree layout that becomes radial at scale, but keeps structure readable.

#### ➤ Filtering Controls
- Toggle buttons for:
  - `☑ Show Structural Links`
  - `☑ Show Reference Links`
- Optional: show/hide tag nodes separately.

---

## 🛠 Implementation Plan

### Phase 1: Fork and Setup

- [ ] Fork Foam repository to `neuchatech/foam`
- [ ] Set up dev environment and local build process
- [ ] Rebrand extension (if needed) with namespace (e.g. `neuchatech.foam-viz`)

### Phase 2: Add Structural Logic

- [ ] Modify `generateGraphData` to:
  - [ ] Include parent folder links
  - [ ] Create synthetic folder nodes (if no README found)
  - [ ] Recognize `README.md` or `index.md` as a folder root node

- [ ] Tag all edges with `type: 'structural'` or `'reference'`

### Phase 3: Graph UI Changes

- [ ] Update `graph.js` to:
  - [ ] Style structural edges differently
  - [ ] Add toggles to control edge types
  - [ ] Filter edges at draw time based on toggle states

- [ ] Update layout algorithm:
  - [ ] Assign higher strength to structural links
  - [ ] Tune repulsion/spring constants for clarity

### Phase 4: Node Behavior and Labeling

- [ ] Display simplified node labels at low zoom (e.g. only top folders)
- [ ] Add hover tooltips or node popups for additional info
- [ ] Use `README.md` or designated file as title node for folders

### Phase 5: Configuration and Extensibility

- [ ] Add settings to `foam.graph.style`:
  - `structuralLineColor`
  - `structuralLineWidth`
  - `labelVisibilityZoomThresholds`

- [ ] Optional: Add metadata overrides via frontmatter (e.g. `parent:` or `displayInGraph: false`)

---

## ✨ Future Ideas

- Custom edge types (e.g. manual `parent:` relationships in frontmatter)
- Add a "breadcrumb" overlay on graph traversal
- Export graph snapshots as SVG or image
- Integration with GitHub README rendering
- Use mermaid graphs or YAML metadata for predefined structures

---

## 📁 Folder Structure Example

```

wiki/
├── repice/
│   ├── README.md        ← becomes node for "repice/"
│   ├── pasta.md
│   └── cake.md
├── research/
│   ├── README.md        ← node for "research/"
│   ├── foam-study.md
│   └── graph-algos.md
├── index.md             ← global root node

```

Graph edges:
- `index.md → repice/README.md` (structural)
- `repice/README.md → pasta.md` (structural)
- `pasta.md → cake.md` (reference: if linked via `[[cake]]`)

---

## 🔗 Related Links

- [Foam Documentation](https://foambubble.github.io/foam/)
- [Foam GitHub Repository](https://github.com/foambubble/foam)
- [VSCode Extension Page](https://marketplace.visualstudio.com/items?itemName=foam.foam-vscode)
- [Dagre.js (graphlib)](https://github.com/dagrejs/graphlib)
- [d3-force](https://github.com/d3/d3-force)

---

## 🧠 Contribution Guidelines

- Fork the Foam repo and clone locally
- Keep upstream compatibility in mind
- Document every change and push to the `neuchatech/foam` fork
- Coordinate large refactors via issues in the new repo

---

**Project Maintainer**: _You_  
**Central Project File**: `projets/neuchatech-foam/README.md`  
For low-level implementation notes, refer to `DR-implementation.md`