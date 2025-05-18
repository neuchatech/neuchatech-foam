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