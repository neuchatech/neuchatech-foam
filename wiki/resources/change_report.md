# Change Report: Graph Visualization (dataviz.ts & graph.js)

This report outlines the key differences between the older versions of `dataviz.ts` and `graph.js` (from `projets/neuchatech-foam/wiki/resources/`) and the current versions (in `projets/neuchatech-foam/packages/foam-vscode/`). The focus is on changes affecting node/link creation, filtering, styling, and overall graph behavior, particularly concerning reference (markdown) links.

**File Paths:**
*   **Current `graph.js`**: `projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js`
*   **Old `graph.js`**: `projets/neuchatech-foam/wiki/resources/graph.js`
*   **Current `dataviz.ts`**: `projets/neuchatech-foam/packages/foam-vscode/src/features/panels/dataviz.ts`
*   **Old `dataviz.ts`**: `projets/neuchatech-foam/wiki/resources/dataviz.ts`

---

## I. `dataviz.ts` (Data Generation - Extension Side)

### 1. Node and Link Creation Responsibility:
*   **Old `dataviz.ts`**:
    *   `generateGraphData`: Primarily created basic node information from `foam.workspace.list()` and added all connections from `foam.graph.getAllConnections()` as 'reference' links.
    *   It had a separate, somewhat complex loop to identify folder nodes (README/index or synthetic) and add structural links. This logic was intertwined with iterating all notes.
    *   Tag nodes and their hierarchical links were *not* created here; this was handled client-side in the old `graph.js`'s `augmentGraphInfo`.
*   **Current `dataviz.ts`**:
    *   `generateGraphData`: Now handles the creation of **all** node types (notes, placeholders, explicit folder nodes, tag nodes) and **all** link types (reference, structural, tag).
    *   **Folder Nodes**: Uses a more robust `getOrCreateFolderNode` function. It processes a list of `folderUrisToProcess` to create folder nodes and their structural links to children and parents.
    *   **Tag Nodes**: Uses `getOrCreateTagNode` to create nodes for each tag and links notes to their respective tag nodes. Hierarchical tag structures are not explicitly created as node-to-node links here, but individual tag nodes are made.
    *   **Reference Links**: Added only if both source and target nodes already exist in `graph.nodeInfo`.
    *   **Dot-folder Filtering**: Explicitly excludes notes and links within or pointing to dot-folders (e.g., `.git`, `.vscode`).

### 2. Error Handling and Robustness:
*   **Old `dataviz.ts`**: Less error handling around URI parsing or note property access within `generateGraphData`. For example, `foam.workspace.get(fromVsCodeUri(readmeUri))` was called without explicit try-catch for cases where `readmeUri` might not correspond to an actual note.
*   **Current `dataviz.ts`**:
    *   Includes more `try-catch` blocks and logging (e.g., around `foam.workspace.get`, `n.uri.getDirectory()`).
    *   Checks for `vsCodeWorkspaceRootUri` existence.
    *   Checks for invalid `folderUri` before processing.
    *   Checks for node existence (`graph.nodeInfo[c.source.path] && graph.nodeInfo[c.target.path]`) before adding reference links.

### 3. URI Handling for Synthetic Nodes:
*   **Old `dataviz.ts`**: Synthetic folder nodes used `folderUri` as their `uri` property.
*   **Current `dataviz.ts`**: Synthetic folder nodes use `folderUri`. Tag nodes use a synthetic URI like `URI.parse('tag:tagName')`.

### 4. Click Handling (`webviewDidSelectNode`):
*   **Old `dataviz.ts`**: Simpler logic, directly parsed `message.payload` as a URI and opened it.
*   **Current `dataviz.ts`**: More complex logic to differentiate between file URIs, synthetic `folder:` URIs (prompting to create README), and `tag:` URIs (currently logs and returns). Includes more error handling for URI parsing.

---

## II. `graph.js` (Graph Rendering - Webview Client-Side)

### 1. `defaultStyle` Object:
*   **Old `graph.js`**:
    *   Did *not* include `showReferenceLinks` or `showStructuralLinks`.
    *   `node` colors did not explicitly list `folder`.
*   **Current `graph.js`**:
    *   Includes `showReferenceLinks: true` (added in an attempt to fix visibility).
    *   `node` colors include a definition for `folder`.
    *   (Previously, `showStructuralLinks` was also missing but is usually handled by `Actions.updateStyle` from settings).

### 2. `augmentGraphInfo` Function:
*   **Old `graph.js`**:
    *   This function was responsible for creating tag nodes and their hierarchical links client-side by parsing `node.tags`. It mutated the `graph.nodeInfo` and `graph.links` it received.
*   **Current `graph.js`**:
    *   This function is now much simpler. It **only** populates the `.neighbors` and `.links` array properties on each node object based on the links provided by `dataviz.ts`. It no longer creates any new nodes or links. This responsibility has shifted to `dataviz.ts`.
    *   Includes a `console.warn` if a link references non-existent nodes.

### 3. Link Filtering (`updateForceGraphDataFromModel`):
*   **Old `graph.js`**:
    *   Filtered links based on `model.style.showStructuralLinks` and `model.style.showReferenceLinks`.
    *   Then, it checked if the source and target nodes of a link existed in `m.data.nodes` (which is the list of *already filtered nodes* based on `model.showNodesOfType`). This could lead to links being filtered if their nodes were of a type that was toggled off.
*   **Current `graph.js`**:
    *   Filters links based on `model.style.showStructuralLinks`, `model.style.showReferenceLinks`, and `model.showNodesOfType['tag']` (for tag links).
    *   Then, it checks if the source and target nodes (fetched from the complete `m.graph.nodeInfo`) are of a type that is currently shown (i.e., `model.showNodesOfType[sourceNode.type]` is true). This is a more direct and arguably more correct way to ensure links are only shown if their endpoint nodes are also meant to be visible.

### 4. State Determination (`getNodeState`, `getLinkState`):
*   **Old `graph.js`**:
    *   `getNodeState`: Logic was based on `model.selectedNodes`, `model.hoverNode`, and `model.focusNodes.size`. It did not explicitly check if the node was part of the filtered `model.data.nodes`.
    *   `getLinkState`: Logic was based on `model.focusNodes.size` and whether the link was in `model.focusLinks`. It did not explicitly check if the link was part of `model.data.links`.
*   **Current `graph.js`**:
    *   `getNodeState`: Now includes an explicit check `isVisible = model.data.nodes.some(n => n.id === nodeId)`. If `!isVisible`, it returns `'hidden'`.
    *   `getLinkState`: Now includes an explicit check `isVisible = model.data.links.some(l => l.source === getLinkNodeId(link.source) && l.target === getLinkNodeId(link.target))`. If `!isVisible`, it returns `'hidden'`. (A bug in this line was recently corrected).

### 5. Color and Rendering Functions (`getNodeColor`, `getLinkColor`, `nodeCanvasObject`):
*   **Old `graph.js`**:
    *   `getNodeColor`: Used `info.type` for color lookup. Would `throw new Error` for unknown states.
    *   `getLinkColor`: Would `throw new Error` for unknown states for reference links. The final `else` branch returned transparent, which would apply if `link.type` wasn't structural/reference or if their respective `show...Links` flags were false.
    *   `nodeCanvasObject`: Did not explicitly check for a 'hidden' state before attempting to draw.
*   **Current `graph.js`**:
    *   `getNodeColor`: Explicitly handles a `'hidden'` state by returning transparent colors. Logs an error for other unknown states.
    *   `getLinkColor`: Explicitly handles a `'hidden'` state for reference and tag links by returning transparent. Logs an error for other unknown states. The final `else` branch also returns transparent.
    *   `nodeCanvasObject`: Now gets `nodeState` first and returns early if it's `'hidden'`, preventing drawing.

### 6. Tooltip (`onNodeHover`):
*   **Old `graph.js`**: Tooltip content was `<b>${info.title}</b><br>${info.uri.path}` plus properties.
*   **Current `graph.js`**: More robust tooltip generation with `try-catch`. Handles cases where `info.uri` or `info.uri.path` might be missing (e.g., for tag nodes).

### 7. Initialization and Event Handling (bottom of the file):
*   **Old `graph.js`**: Had a more complex initialization involving `window.graphUpdated` flags and specific zoom/cooldown logic on first data update.
*   **Current `graph.js`**: Simpler initialization. `vscode.postMessage` is wrapped in a `channel` object.

---

## Summary of Key Changes Potentially Affecting Reference Link Visibility:

1.  **Responsibility Shift**: Tag node/link creation moved from client (`graph.js`) to extension side (`dataviz.ts`). This is a major architectural change but shouldn't inherently break reference links if data is passed correctly.
2.  **Filtering Logic**:
    *   The client-side link filtering in `graph.js` (`updateForceGraphDataFromModel`) changed how it determines if a link's endpoints are visible. The current method (checking node types against `model.showNodesOfType` using the full `m.graph.nodeInfo`) is more direct than the old method (checking against the already-filtered `m.data.nodes`).
    *   The server-side data generation in `dataviz.ts` (current) is more stringent, e.g., only adding reference links if both source/target nodes are known and not in dot-folders.
3.  **State Handling**: Current `graph.js` is more explicit about a 'hidden' state for nodes/links and makes them transparent. The old version might have thrown errors or behaved differently for states derived from filtered-out elements.
4.  **Default Styles**: The current `graph.js` now attempts to default `showReferenceLinks` to `true` in its `defaultStyle` object. The old one did not, relying on settings passed from `dataviz.ts`.

If reference links were visible in the old version and are not in the current (even with `defaultStyle.showReferenceLinks = true`), the interaction between the data generated by the current `dataviz.ts` and the filtering/styling logic in the current `graph.js` is the most critical area. The issue likely lies in reference links being filtered out by `updateForceGraphDataFromModel` in `graph.js`, specifically by the check:
`return sourceNode && model.showNodesOfType[sourceNode.type] && targetNode && model.showNodesOfType[targetNode.type];`
This would imply that for the missing reference links, one of the connected nodes either isn't being included in `m.graph.nodeInfo` by `dataviz.ts`, or its `type` is being set to something that `model.showNodesOfType` filters out (and `model.showNodesOfType['note']` is somehow false, or the node type isn't 'note').