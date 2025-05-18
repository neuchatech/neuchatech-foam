# Folder Focus Limitation & UX Solution

## Why We Can’t Focus a Folder in VSCode

VSCode does **not expose an API** to programmatically highlight a *folder* in the built-in File Explorer.
The closest command, `revealInExplorer`, only works on **files**, and `revealFileInExplorer` opens the **OS file manager** (Finder, Explorer), not the VSCode UI.
There is **no supported way to select or focus a folder node** directly inside the VSCode UI through extensions.

## Proposed UX Solution

When a user **clicks on a folder node** in the graph and it:

* has **no `README.md`** or representative note,
* and cannot be focused in the File Explorer directly,

We show a **floating button above the node**:

> “Create & Open README for this Folder”

Clicking it:

* creates a `README.md` in the folder (if not already present),
* opens it in the editor (which automatically reveals the folder in Explorer),
* and treats this `README.md` as the main “note” for the folder in the graph.

This provides a smooth fallback for navigation while encouraging structured documentation.

---

# Future Improvements

### Graph UI & Navigation

* Keyboard and mouse navigation improvements: pan, zoom, multi-select
* Right-click menu with contextual actions (e.g. reveal, backlinks)
* Node detail panel or tooltip on hover
* Select+focus node by name or current active file

### Graph Logic & Structure

* Hybrid folder + link-based layout (hierarchy + references)
* Treat `README.md` as primary node for a folder if present
* Node title visibility based on zoom level
* Customizable layout algorithms and clustering (e.g. force-directed, tree)
* Edge weighting by link frequency or type

### Workspace & File Integration

* Auto-update graph on file changes
* Filter by tag, type, modified date
* Search integration (highlight node from search)
* Show “current note” centered in graph

### Visual & UX Enhancements

* Dark/light themes, custom styling per node type
* Export graph as image or JSON
* Legend or UI to explain edge/node types
* Link types differentiated visually (hierarchy vs reference)

### Advanced Features

* Timeline or Git playback (graph over time)
* Custom metadata display (frontmatter, tags, etc.)
* Cross-workspace linking and multi-root support
* Embed external data into graph view
