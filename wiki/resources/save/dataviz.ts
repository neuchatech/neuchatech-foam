import * as vscode from 'vscode';
import { Foam } from '../../core/model/foam';
import { Logger } from '../../core/utils/log';
import { URI } from '../../core/model/uri';
import { Resource as NoteResource, Tag } from '../../core/model/note'; // Aliasing to avoid confusion if 'Note' is used elsewhere
import { fromVsCodeUri, toVsCodeUri } from '../../utils/vsc-utils';
import { isSome } from '../../core/utils';
import { TextEncoder } from 'util';

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
          const note = foam.workspace.get(fromVsCodeUri(e.document.uri));
          if (isSome(note)) {
            panel.webview.postMessage({
              type: 'didSelectNote',
              payload: note.uri.path,
            });
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

function getOrCreateFolderNode(
  folderUri: URI,
  foam: Foam,
  graphNodeInfo: { [key: string]: any },
  workspaceRootPath: string
): string {
  const folderPath = folderUri.path;
  let nodeId: string;

  const isWorkspaceRoot = folderPath === workspaceRootPath;
  const vsCodeFolderUri = toVsCodeUri(folderUri);
  const readmeUriInFolder = vscode.Uri.joinPath(vsCodeFolderUri, 'README.md');
  const indexUriInFolder = vscode.Uri.joinPath(vsCodeFolderUri, 'index.md');

  let readmeNote: NoteResource | null = null;
  try {
    readmeNote = foam.workspace.get(fromVsCodeUri(readmeUriInFolder));
  } catch (e) { /* Suppress error */ }

  let indexNote: NoteResource | null = null;
  try {
    indexNote = foam.workspace.get(fromVsCodeUri(indexUriInFolder));
  } catch (e) { /* Suppress error */ }

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
      if (isWorkspaceRoot && !folderUri.getBasename()) {
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

function getOrCreateTagNode(
    tagName: string,
    graphNodeInfo: { [key: string]: any }
): string {
    const tagNodeId = `tag:${tagName}`;
    if (!graphNodeInfo[tagNodeId]) {
        graphNodeInfo[tagNodeId] = {
            id: tagNodeId,
            type: 'tag',
            uri: URI.parse(tagNodeId), // Create a synthetic URI for the tag
            title: `#${tagName}`,
            properties: {},
            tags: [],
        };
    }
    return tagNodeId;
}

function containsDotFolderSegment(uri: URI): boolean {
    const pathSegments = uri.path.split('/').filter(segment => segment !== '');
    for (let i = 0; i < pathSegments.length; i++) {
        if (pathSegments[i].startsWith('.')) {
            return true;
        }
    }
    return false;
}

function generateGraphData(foam: Foam) {
  const graph = {
    nodeInfo: {},
    edges: new Set<any>(),
  };

  const vsCodeWorkspaceRootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!vsCodeWorkspaceRootUri) {
    Logger.error('No workspace folder found. Cannot determine workspace root for graph.');
    return { nodeInfo: {}, links: [] };
  }
  const workspaceRootUri = fromVsCodeUri(vsCodeWorkspaceRootUri);
  const workspaceRootPath = workspaceRootUri.path;

  // Phase 1: Collect all potential nodes
  const folderUrisToProcess = new Map<string, URI>();
  if (!containsDotFolderSegment(workspaceRootUri)) {
    folderUrisToProcess.set(workspaceRootPath, workspaceRootUri);
  }

  foam.workspace.list().forEach(n => {
    try {
      if (containsDotFolderSegment(n.uri)) {
          Logger.info(`Excluding note in dot-folder: ${n.uri.path}`);
          return;
      }
      const noteType = n.type === 'note' ? n.properties.type ?? 'note' : n.type;
      const noteTitle = n.type === 'note' ? n.title : n.uri.getBasename();
      graph.nodeInfo[n.uri.path] = {
        id: n.uri.path,
        type: noteType,
        uri: n.uri,
        title: cutTitle(noteTitle),
        properties: n.properties,
        tags: n.tags,
      };

      // Add tag nodes
      (n.tags as Tag[]).forEach(tag => {
        const tagName = tag.label;
        getOrCreateTagNode(tagName, graph.nodeInfo); // Ensure tag node exists
      });

      // Collect folders to process for structural links
      const dirUri = n.uri.getDirectory();
      if (dirUri && dirUri.path && !folderUrisToProcess.has(dirUri.path) && !containsDotFolderSegment(dirUri)) {
        const folderBasename = dirUri.getBasename();
        if (folderBasename === '' || !folderBasename.startsWith('.')) {
           folderUrisToProcess.set(dirUri.path, dirUri);
        }
      }
    } catch (e) {
      Logger.warn(`Skipping note due to error during property access or directory lookup: ${n.uri.path}. Error: ${e.message}`);
    }
  });

  // Add placeholder nodes from connections if they don't exist as real notes
  foam.graph.getAllConnections().forEach(c => {
      if (!containsDotFolderSegment(c.source) && !containsDotFolderSegment(c.target)) {
          if (c.source.isPlaceholder() && !graph.nodeInfo[c.source.path]) {
              graph.nodeInfo[c.source.path] = {
                  id: c.source.path, type: 'placeholder', uri: c.source,
                  title: cutTitle(c.source.path), properties: {}, tags: []
              };
          }
          if (c.target.isPlaceholder() && !graph.nodeInfo[c.target.path]) {
              graph.nodeInfo[c.target.path] = {
                  id: c.target.path, type: 'placeholder', uri: c.target,
                  title: cutTitle(c.target.path), properties: {}, tags: []
              };
          }
      }
  });

  // Ensure folder nodes exist for all collected folders
  folderUrisToProcess.forEach(folderUri => {
      if (folderUri && folderUri.path) {
          getOrCreateFolderNode(folderUri, foam, graph.nodeInfo, workspaceRootPath);
      }
  });


  // Phase 2: Create links between existing nodes
  foam.graph.getAllConnections().forEach(c => {
    const sourceUri = c.source;
    const targetUri = c.target;

    if (containsDotFolderSegment(sourceUri) || containsDotFolderSegment(targetUri)) {
        return; // Skip links involving dot-folders
    }

    // Add reference link if both endpoints exist as nodes
    if (graph.nodeInfo[sourceUri.path] && graph.nodeInfo[targetUri.path]) {
        graph.edges.add({
            source: sourceUri.path,
            target: targetUri.path,
            type: 'reference',
        });
    } else {
        // This case should be rare with the node collection phase, but log for debugging
        Logger.warn(`Skipping reference link due to missing source/target node during link creation: ${sourceUri.path} -> ${targetUri.path}`);
    }
  });

  // Add structural links based on folder hierarchy
  folderUrisToProcess.forEach(folderUri => {
    if (!folderUri || !folderUri.path) {
        return; // Skip invalid folder URIs
    }
    const folderNodeId = getOrCreateFolderNode(folderUri, foam, graph.nodeInfo, workspaceRootPath);
    const folderPath = folderUri.path;

    foam.workspace.list().filter(n => {
        try {
            const noteDir = n.uri?.getDirectory();
            return noteDir?.path === folderPath && !containsDotFolderSegment(n.uri);
        } catch (e) { return false; }
    }).forEach(childNote => {
      // Add structural link if both endpoints exist as nodes
      if (graph.nodeInfo[folderNodeId] && graph.nodeInfo[childNote.uri.path] && folderNodeId !== childNote.uri.path) {
        graph.edges.add({
          source: folderNodeId,
          target: childNote.uri.path,
          type: 'structural',
        });
      }
    });

    // Add parent structural links
    if (folderPath !== workspaceRootPath) {
      try {
        const parentFolderUri = folderUri.getDirectory();
        if (parentFolderUri && parentFolderUri.path && parentFolderUri.path !== folderPath && parentFolderUri.path.startsWith(workspaceRootPath) && !containsDotFolderSegment(parentFolderUri)) {
          const parentNodeId = getOrCreateFolderNode(parentFolderUri, foam, graph.nodeInfo, workspaceRootPath);
           // Add parent structural link if both endpoints exist as nodes
           if (graph.nodeInfo[parentNodeId] && graph.nodeInfo[folderNodeId] && parentNodeId !== folderNodeId) {
              graph.edges.add({
               source: parentNodeId,
               target: folderNodeId,
               type: 'structural',
             });
           }
        }
      } catch (e) {
        Logger.warn(`Error creating parent link for folder ${folderPath}: ${e.message}`);
      }
    }
  });

  // Add tag links (note to tag node)
  foam.workspace.list().forEach(n => {
      if (containsDotFolderSegment(n.uri)) {
          return; // Skip notes in dot-folders
      }
      (n.tags as Tag[]).forEach(tag => {
          const tagName = tag.label;
          const tagNodeId = `tag:${tagName}`;
          // Add tag link if both note and tag nodes exist
          if (graph.nodeInfo[n.uri.path] && graph.nodeInfo[tagNodeId]) {
              graph.edges.add({
                  source: n.uri.path,
                  target: tagNodeId,
                  type: 'tag',
              });
          } else {
              Logger.warn(`Skipping tag link due to missing note or tag node: ${n.uri.path} -> ${tagNodeId}`);
          }
      });
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
          const noteUri = vscode.Uri.parse(message.payload);
          const selectedNote = foam.workspace.get(fromVsCodeUri(noteUri));

          if (isSome(selectedNote)) {
            vscode.commands.executeCommand(
              'vscode.open',
              noteUri,
              vscode.ViewColumn.One
            );
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
