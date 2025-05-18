# Phase 2: Add Structural Logic - 2025-05-18

## Participants
- Strategic Planner
- Technical Lead
- Developer

## Phase Overview
This conversation thread focuses on the technical implementation details of Phase 2: Adding Structural Logic to the neuchatech-foam graph visualization.

Key documents:
- [`projets/neuchatech-foam/README.md`](../../../../README.md) (Implementation Plan)
- [`projets/neuchatech-foam/DR-implementation.md`](../../../../DR-implementation.md) (Technical Notes)

Previous conversation: [2025-05-18-init.md](./2025-05-18-init.md) (Project Kickoff)

---

## Discussion

[StrategicPlanner] @All: We have successfully completed Phase 1 (Fork and Setup) and are now moving into Phase 2: Add Structural Logic, as outlined in our README ([`projets/neuchatech-foam/README.md`](../../../../README.md:88)). The primary goal for this phase is to modify the graph data generation to include structural links based on folder hierarchy and tag edges with their type.

[TechnicalLead] @StrategicPlanner, @Developer: The core component to modify for this phase is `graph.ts` within the Foam codebase (`packages/foam-vscode/src/features/dataviz/graph.ts`). We need to locate the function responsible for generating the graph's nodes and edges, likely `generateGraphData` or a similar function.

[Developer] @TechnicalLead: Based on the deep research notes ([`projets/neuchatech-foam/DR-implementation.md`](../../../../DR-implementation.md:14)), the target seems to be modifying the logic where the node/edge model is assembled. We need to implement the logic to:
1.  Identify notes within folders.
2.  Create structural links from the folder's designated root node (e.g., `README.md`, `index.md`, or a synthetic node) to each note in that folder.
3.  Add a `type` property (`'structural'`, `'reference'`, `'tag'`) to each edge object.

[StrategicPlanner] @All: Agreed. Before we start coding, the next immediate step is to ensure our local development environment for the Foam extension is set up correctly within the [`projets/neuchatech-foam`](../../../../) directory. This is crucial for building and testing our changes.

[TechnicalLead] @Developer: Yes, setting up the dev environment is key. We'll need to follow the standard Foam contribution guidelines for this, which usually involves installing dependencies and potentially running a build or watch script.

[Developer] @TechnicalLead: I will prepare the steps for setting up the development environment.

[User Update via Agent - 11:11 AM] User confirmed successful development environment setup within `projets/neuchatech-foam`.

[StrategicPlanner] @All: Excellent. With the development environment ready, we can now begin the implementation work for Phase 2.

[Developer] @TechnicalLead: I will start by examining the `packages/foam-vscode/src/features/dataviz/graph.ts` file to locate the graph data generation logic and identify where to integrate the structural link generation and edge typing.

[Developer] @All: I have successfully implemented the core logic for generating structural links and typing edges in [`projets/neuchatech-foam/packages/foam-vscode/src/features/panels/dataviz.ts`](../../../../projets/neuchatech-foam/packages/foam-vscode/src/features/panels/dataviz.ts).
During implementation, I encountered and resolved TypeScript errors related to URI handling by using `vscode.Uri.joinPath` and the `toVsCodeUri`/`fromVsCodeUri` utility functions.
There are remaining ESLint errors related to undefined rules, which seem to be configuration issues rather than code logic problems.

The next step for Phase 2 is to update the graph rendering logic in the webview (`static/dataviz/graph.html` and related JS) to visually differentiate structural and reference links, as outlined in the plan ([`projets/neuchatech-foam/README.md`](../../../../README.md:58) and [`DR-implementation.md`](../../../../DR-implementation.md:24)).

[Developer] @All: I have also successfully modified [`projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js`](../../../../projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js) to visually differentiate structural and reference links by adjusting link color and width based on the `type` property.

The remaining task for this part of Phase 2 is to update the layout algorithm in `graph.js` to give structural edges higher spring force, as per the plan ([`projets/neuchatech-foam/README.md`](../../../../projets/neuchatech-foam/README.md:68)). We should also decide if we need to address the ESLint errors in `dataviz.ts` now or later.

[User Response via Agent - 11:16 AM] User reviewed changes and requested to continue implementation, addressing ESLint errors later.

[StrategicPlanner] @All: Understood. We will proceed with adjusting the graph layout force and defer addressing the ESLint errors for now.

[Developer] @TechnicalLead: I will now modify the force layout in [`projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js`](../../../../projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js) to apply a higher spring force to structural edges.

[Developer] @All: I have successfully updated the force layout in [`projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js`](../../../../projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js) to give structural edges higher spring force.

We have now completed the core implementation steps for adding structural logic and updating the graph rendering in Phase 2. The next step is to implement adaptive node titles based on zoom level, which is part of Phase 4: Node Behavior and Labeling ([`projets/neuchatech-foam/README.md`](../../../../projets/neuchatech-foam/README.md:64)). We are deferring the ESLint errors in `dataviz.ts` for now.

[Developer] @All: I have now implemented adaptive node titles in [`projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js`](../../../../projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js) based on the zoom level and node type.

We have completed the implementation steps for adding structural logic (Phase 2) and adaptive node titles (part of Phase 4). The remaining ESLint errors in `dataviz.ts` are deferred.

Based on the README ([`projets/neuchatech-foam/README.md`](../../../../projets/neuchatech-foam/README.md)), the next logical steps would be to implement the remaining items in Phase 4 (Add hover tooltips, Use README/designated file as title node - which is partially covered by structural links) and then move on to Phase 5 (Configuration and Extensibility).

[Developer] @All: The next step is to implement hover tooltips or node popups for additional information, as outlined in Phase 4 of the README ([`projets/neuchatech-foam/README.md`](../../../../projets/neuchatech-foam/README.md:110)). I will examine [`projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js`](../../../../projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js) to identify where to add this functionality.

[Developer] @All: I have successfully implemented basic hover tooltip functionality in [`projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js`](../../../../projets/neuchatech-foam/packages/foam-vscode/static/dataviz/graph.js). The tooltip currently displays the node title and path on hover.

We have now completed the implementation of hover tooltips. The next step in Phase 4 is to "Use README.md or designated index files as the main node for a folder" ([`projets/neuchatech-foam/README.md`](../../../../projets/neuchatech-foam/README.md:17)). This was partially addressed when implementing structural links, but we should review if any further modifications are needed in the rendering logic to fully support this.