import * as vscode from 'vscode';
import { Foam } from '../../core/model/foam';
import { URI } from '../../core/model/uri';
import { Resource as NoteResource } from '../../core/model/note'; // Aliasing to avoid confusion if 'Note' is used elsewhere
import { Logger } from '../../core/utils/log';
import { fromVsCodeUri, toVsCodeUri } from '../../utils/vsc-utils';
import { isSome } from '../../core/utils';

export default async function activate(
  context: vscode.ExtensionContext,
  foamPromise: Promise<Foam>
) {
  let panel: vscode.WebviewPanel | undefined = undefined;
  vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration('foam.graph.style')) {
      const style = getGraphStyle();
      panel.webview.postMessage({
        type: 'didUpdateStyle',
        payload: style,
      });
    }
  });

  vscode.commands.registerCommand('foam-vscode.show-graph', async () => {
    if (panel) {
      const columnToShowIn = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : undefined;
      panel.reveal(columnToShowIn);
    } else {
      const foam = await foamPromise;
      panel = await createGraphPanel(foam, context);
      const onFoamChanged = _ => {
        updateGraph(panel, foam);
      };

      const noteUpdatedListener = foam.graph.onDidUpdate(onFoamChanged);
      panel.onDidDispose(() => {
        noteUpdatedListener.dispose();
        panel = undefined;
      });

      vscode.window.onDidChangeActiveTextEditor(e => {
        if (e?.document?.uri?.scheme !== 'untitled') {
          try { // Added try-catch here to prevent crash on opening non-note files
            const note = foam.workspace.get(fromVsCodeUri(e.document.uri));
            if (isSome(note)) {
              panel.webview.postMessage({
                type: 'didSelectNote',
                payload: note.uri.path,
              });
            }
          } catch (error) {
             Logger.warn(`Could not get Foam note for active editor ${e.document.uri.path}: ${error.message}`);
             // Do not post message to select node if note lookup fails
          }
        }
      });
    }
  });
}

function updateGraph(panel: vscode.WebviewPanel, foam: Foam) {
  const graph = generateGraphData(foam);
  panel.webview.postMessage({
    type: 'didUpdateGraphData',
    payload: graph,
  });
}

// Helper function to get or create a node representation for a folder
function getOrCreateFolderNode(
  folderUri: URI,
  foam: Foam,
  graphNodeInfo: { [key: string]: any },
  workspaceRootPath: string
): string {
  const folderPath = folderUri.path;
  let nodeId: string;

  // For the absolute root, handle specially if needed, otherwise it's like any other folder.
  // The title might need adjustment for the root.
  const isWorkspaceRoot = folderPath === workspaceRootPath;

  const vsCodeFolderUri = toVsCodeUri(folderUri);
  const readmeUri = vscode.Uri.joinPath(vsCodeFolderUri, 'README.md');
  const indexUri = vscode.Uri.joinPath(vsCodeFolderUri, 'index.md');

  let readmeNote: NoteResource | null = null;
  try {
    readmeNote = foam.workspace.get(fromVsCodeUri(readmeUri));
  } catch (e) {
    // Suppress error, means file likely doesn't exist
  }

  let indexNote: NoteResource | null = null;
  try {
    indexNote = foam.workspace.get(fromVsCodeUri(indexUri));
  } catch (e) {
    // Suppress error
  }

  if (isSome(readmeNote)) {
    nodeId = readmeNote.uri.path;
    if (!graphNodeInfo[nodeId]) {
      graphNodeInfo[nodeId] = {
        id: nodeId,
        type: readmeNote.type === 'note' ? readmeNote.properties.type ?? 'note' : readmeNote.type,
        uri: readmeNote.uri,
        title: cutTitle(readmeNote.type === 'note' ? readmeNote.title : readmeNote.uri.getBasename()),
        properties: readmeNote.properties,
        tags: readmeNote.tags,
      };
    }
  } else if (isSome(indexNote)) {
    nodeId = indexNote.uri.path;
    if (!graphNodeInfo[nodeId]) {
      graphNodeInfo[nodeId] = {
        id: nodeId,
        type: indexNote.type === 'note' ? indexNote.properties.type ?? 'note' : indexNote.type,
        uri: indexNote.uri,
        title: cutTitle(indexNote.type === 'note' ? indexNote.title : indexNote.uri.getBasename()),
        properties: indexNote.properties,
        tags: indexNote.tags,
      };
    }
  } else {
    nodeId = `folder:${folderPath}`;
    if (!graphNodeInfo[nodeId]) {
      let title = folderUri.getBasename() || folderPath;
      if (isWorkspaceRoot && !folderUri.getBasename()) { // Special title for workspace root synthetic node
        const workspaceFolderName = vscode.workspace.workspaceFolders?.[0]?.name ?? 'Workspace';
        title = workspaceFolderName;
      }
      graphNodeInfo[nodeId] = {
        id: nodeId,
        type: 'folder',
        uri: folderUri,
        title: cutTitle(title),
        properties: {},
        tags: [],
      };
    }
  }
  return nodeId;
}

function generateGraphData(foam: Foam) {
  const graph = {
    nodeInfo: {},
    edges: new Set(),
  };

  // Get workspace root URI and path
  const vsCodeWorkspaceRootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!vsCodeWorkspaceRootUri) {
    Logger.error('No workspace folder found. Cannot determine workspace root for graph.');
    // Return an empty graph or handle this error appropriately
    return { nodeInfo: {}, links: [] };
  }
  const workspaceRootUri = fromVsCodeUri(vsCodeWorkspaceRootUri);
  const workspaceRootPath = workspaceRootUri.path;

  // Collect all unique folder URIs, excluding dot-folders
  const folderUrisToProcess = new Map<string, URI>();
  folderUrisToProcess.set(workspaceRootPath, workspaceRootUri); // Always include the workspace root

  foam.workspace.list().forEach(n => {
    try {
      // Add note node to graph.nodeInfo
      const type = n.type === 'note' ? n.properties.type ?? 'note' : n.type;
      const title = n.type === 'note' ? n.title : n.uri.getBasename();
      graph.nodeInfo[n.uri.path] = {
        id: n.uri.path,
        type: type,
        uri: n.uri,
        title: cutTitle(title),
        properties: n.properties,
        tags: n.tags,
      };

      // Collect folder URI for this note, excluding dot-folders
      const dirUri = n.uri.getDirectory();
      if (dirUri && dirUri.path && !folderUrisToProcess.has(dirUri.path)) {
        const folderBasename = dirUri.getBasename();
        if (folderBasename === '' || !folderBasename.startsWith('.')) { // Include root ('') but exclude dot-folders
           folderUrisToProcess.set(dirUri.path, dirUri);
        }
      }
    } catch (e) {
      Logger.warn(`Skipping note due to error during property access or directory lookup: ${n.uri.path}. Error: ${e.message}`);
      // Continue to the next note
    }
  });

  // Add reference links
  foam.graph.getAllConnections().forEach(c => {
    graph.edges.add({
      source: c.source.path,
      target: c.target.path,
      type: 'reference', // Add edge type
    });
    if (c.target.isPlaceholder()) {
      graph.nodeInfo[c.target.path] = {
        id: c.target.path,
        type: 'placeholder',
        uri: c.target,
        title: c.target.path,
        properties: {},
        tags: [],
      };
    }
  });

  // Add structural links based on folder hierarchy
  folderUrisToProcess.forEach(folderUri => {
    // Skip if folderUri is null or undefined, which can happen for workspace root if not properly set
    if (!folderUri || !folderUri.path) {
        Logger.warn(`Skipping an invalid folder URI during structural link generation.`);
        return;
    }
    const folderNodeId = getOrCreateFolderNode(folderUri, foam, graph.nodeInfo, workspaceRootPath);
    const folderPath = folderUri.path;

    // Link child notes in this folder to the folderNodeId
    // Filter notes again to ensure we only link notes whose directory is the current folder
    foam.workspace.list().filter(n => {
        try {
            const noteDir = n.uri?.getDirectory();
            return noteDir?.path === folderPath;
        } catch (e) { return false; }
    }).forEach(childNote => {
      // Ensure childNote exists as a node and is not the folder's representative note itself
      if (graph.nodeInfo[childNote.uri.path] && folderNodeId !== childNote.uri.path) {
        graph.edges.add({
          source: folderNodeId,
          target: childNote.uri.path,
          type: 'structural',
        });
      }
    });

    // Link this folder to its parent folder node
    if (folderPath !== workspaceRootPath) {
      try {
        const parentFolderUri = folderUri.getDirectory(); // This gets the parent directory URI
        // Ensure we don't try to link the root to itself or go above the workspace root
        if (parentFolderUri && parentFolderUri.path && parentFolderUri.path !== folderPath && parentFolderUri.path.startsWith(workspaceRootPath)) {
          // Check if the parent folder is also included in our set of folders to process (i.e., not a dot-folder)
          if (folderUrisToProcess.has(parentFolderUri.path)) {
             const parentNodeId = getOrCreateFolderNode(parentFolderUri, foam, graph.nodeInfo, workspaceRootPath);
             if (parentNodeId !== folderNodeId) { // Avoid self-loops if a folder somehow is its own parent
                graph.edges.add({
                 source: parentNodeId,
                 target: folderNodeId,
                 type: 'structural',
               });
             }
          }
        }
      } catch (e) {
        Logger.warn(`Error creating parent link for folder ${folderPath}: ${e.message}`);
      }
    }
  });

  return {
    nodeInfo: graph.nodeInfo,
    links: Array.from(graph.edges),
  };
}

function cutTitle(title: string): string {
  const maxLen = vscode.workspace
    .getConfiguration('foam.graph')
    .get('titleMaxLength', 24);
  if (maxLen > 0 && title.length > maxLen) {
    return title.substring(0, maxLen).concat('...');
  }
  return title;
}

async function createGraphPanel(foam: Foam, context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'foam-graph',
    'Foam Graph',
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = await getWebviewContent(context, panel);

  panel.webview.onDidReceiveMessage(
    async message => {
      switch (message.type) {
        case 'webviewDidLoad': {
          const styles = getGraphStyle();
          panel.webview.postMessage({
            type: 'didUpdateStyle',
            payload: styles,
          });
          updateGraph(panel, foam);
          break;
        }
        case 'webviewDidSelectNode': {
          const nodeUri = vscode.Uri.parse(message.payload);
          // Check if the node is a synthetic folder node before trying to open it as a file
          if (nodeUri.scheme === 'folder') {
             Logger.info(`Clicked on a synthetic folder node: ${nodeUri.path}. Not attempting to open as a file.`);
             // Optionally, add logic here to reveal the folder in the file explorer
             // vscode.commands.executeCommand('revealFileInOS', nodeUri); // This opens in OS file explorer
             // vscode.commands.executeCommand('workbench.files.action.focusFilesExplorer'); // This focuses the explorer
             // You might need to find a command to reveal a folder specifically
          } else {
            // For other node types (notes, placeholders), try to open the resource
            try { // Added try-catch here to prevent crash on opening non-note resources
              const selectedNote = foam.workspace.get(fromVsCodeUri(nodeUri));
              if (isSome(selectedNote)) {
                vscode.commands.executeCommand(
                  'vscode.open',
                  nodeUri,
                  vscode.ViewColumn.One
                );
              } else {
                 Logger.warn(`Could not get Foam note for selected node URI: ${nodeUri.path}. Not attempting to open.`);
              }
            } catch (error) {
               Logger.error(`Error opening resource for selected node ${nodeUri.path}: ${error.message}`);
            }
          }
          break;
        }
        case 'error': {
          Logger.error('An error occurred in the graph view', message.payload);
          break;
        }
      }
    },
    undefined,
    context.subscriptions
  );

  return panel;
}

async function getWebviewContent(
  context: vscode.ExtensionContext,
  panel: vscode.WebviewPanel
) {
  const datavizUri = vscode.Uri.joinPath(
    context.extensionUri,
    'static',
    'dataviz'
  );
  const getWebviewUri = (fileName: string) =>
    panel.webview.asWebviewUri(vscode.Uri.joinPath(datavizUri, fileName));

  const indexHtml =
    vscode.env.uiKind === vscode.UIKind.Desktop
      ? new TextDecoder('utf-8').decode(
          await vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(datavizUri, 'index.html')
          )
        )
      : await fetch(getWebviewUri('index.html').toString()).then(r => r.text());

  // Replace the script paths with the appropriate webview URI.
  const filled = indexHtml.replace(
    /data-replace (src|href)="[^"]+"/g,
    match => {
      const i = match.indexOf(' ');
      const j = match.indexOf('=');
      const uri = getWebviewUri(match.slice(j + 2, -1).trim());
      return match.slice(i + 1, j) + '="' + uri.toString() + '"';
    }
  );

  return filled;
}

function getGraphStyle(): object {
  const config = vscode.workspace.getConfiguration('foam.graph');
  const style = config.get('style') as object;
  const showStructuralLinks = config.get('showStructuralLinks', true);
  const showReferenceLinks = config.get('showReferenceLinks', true);
  const structuralLineColor = config.get('structuralLineColor', '#888');
  const structuralForceStrength = config.get('structuralForceStrength', 1);

  return {
    ...style,
    showStructuralLinks,
    showReferenceLinks,
    structuralLineColor,
    structuralForceStrength,
  };
}
