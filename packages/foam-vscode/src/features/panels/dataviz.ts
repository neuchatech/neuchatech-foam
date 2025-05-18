import * as vscode from 'vscode';
import { Foam } from '../../core/model/foam';
import { URI } from '../../core/model/uri';
import { Resource as NoteResource, Tag } from '../../core/model/note'; // Aliasing to avoid confusion if 'Note' is used elsewhere
import { Logger } from '../../core/utils/log';
import { fromVsCodeUri, toVsCodeUri } from '../../utils/vsc-utils';
import { isSome } from '../../core/utils';
import { TextEncoder } from 'util'; // Node.js util, ensure it's available or use vscode.workspace.fs if in web worker

export default async function activate(
  context: vscode.ExtensionContext,
  foamPromise: Promise<Foam>
) {
  let panel: vscode.WebviewPanel | undefined = undefined;
  vscode.workspace.onDidChangeConfiguration(event => {
    if (panel && event.affectsConfiguration('foam.graph.style')) {
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
        if (panel) { // Ensure panel still exists
          updateGraph(panel, foam);
        }
      };

      const noteUpdatedListener = foam.graph.onDidUpdate(onFoamChanged);
      panel.onDidDispose(() => {
        noteUpdatedListener.dispose();
        panel = undefined;
      });

      vscode.window.onDidChangeActiveTextEditor(e => {
        if (panel && e?.document?.uri?.scheme !== 'untitled') { // Ensure panel still exists
          try {
            const note = foam.workspace.get(fromVsCodeUri(e.document.uri));
            if (isSome(note)) {
              panel.webview.postMessage({
                type: 'didSelectNote',
                payload: note.uri.path,
              });
            }
          } catch (error) {
             Logger.warn(`Could not get Foam note for active editor ${e.document.uri.path}: ${error.message}`);
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
        type: 'folder', // This type is used by the webview to identify synthetic folder nodes
        uri: folderUri,
        title: cutTitle(title),
        properties: {},
        tags: [],
      };
    }
  }
  return nodeId;
}

// Helper to check if a URI path contains a segment starting with a dot
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
    edges: new Set<any>(), // Added type for Set
  };

  const vsCodeWorkspaceRootUri = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!vsCodeWorkspaceRootUri) {
    Logger.error('No workspace folder found. Cannot determine workspace root for graph.');
    return { nodeInfo: {}, links: [] };
  }
  const workspaceRootUri = fromVsCodeUri(vsCodeWorkspaceRootUri);
  const workspaceRootPath = workspaceRootUri.path;

  const folderUrisToProcess = new Map<string, URI>();
  if (!containsDotFolderSegment(workspaceRootUri)) {
    folderUrisToProcess.set(workspaceRootPath, workspaceRootUri);
  }

  const allTagsInWorkspace = new Map<string, URI>();

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
        tags: n.tags, // Keep original tags for potential filtering, but create separate tag nodes
      };

      // Process tags for this note
      (n.tags as Tag[]).forEach(tag => {
        const tagName = tag.label;
        const tagUriString = `tag:${tagName}`;
        if (!allTagsInWorkspace.has(tagName)) {
            // Create a synthetic URI for the tag
            allTagsInWorkspace.set(tagName, URI.parse(tagUriString));
        }
        // Add edge from note to tag
        graph.edges.add({
            source: n.uri.path,
            target: tagUriString, // Use the synthetic URI string as target ID
            type: 'tag',
        });
      });

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

  // Create nodes for all unique tags
  allTagsInWorkspace.forEach((tagUri, tagName) => {
    const tagNodeId = tagUri.path; // which will be `tag:${tagName}`
    if (!graph.nodeInfo[tagNodeId]) {
        graph.nodeInfo[tagNodeId] = {
            id: tagNodeId,
            type: 'tag',
            uri: tagUri,
            title: `#${tagName}`,
            properties: {},
            tags: [], // Tags don't have further tags
        };
    }
  });

  foam.graph.getAllConnections().forEach(c => {
    if (!containsDotFolderSegment(c.source) && !containsDotFolderSegment(c.target)) {
        if (graph.nodeInfo[c.source.path] && graph.nodeInfo[c.target.path]) {
            graph.edges.add({
              source: c.source.path,
              target: c.target.path,
              type: 'reference',
            });
        }
        if (c.target.isPlaceholder() && !graph.nodeInfo[c.target.path] && !containsDotFolderSegment(c.target)) {
          graph.nodeInfo[c.target.path] = {
            id: c.target.path,
            type: 'placeholder',
            uri: c.target,
            title: c.target.path,
            properties: {},
            tags: [],
          };
        }
    } else {
        Logger.info(`Excluding reference link involving dot-folder content: ${c.source.path} -> ${c.target.path}`);
    }
  });

  folderUrisToProcess.forEach(folderUri => {
    if (!folderUri || !folderUri.path) {
        Logger.warn(`Skipping an invalid folder URI during structural link generation.`);
        return;
    }
    const folderNodeId = getOrCreateFolderNode(folderUri, foam, graph.nodeInfo, workspaceRootPath);
    const folderPath = folderUri.path;

    foam.workspace.list().filter(n => {
        try {
            const noteDir = n.uri?.getDirectory();
            return noteDir?.path === folderPath && !containsDotFolderSegment(n.uri);
        } catch (e) { return false; }
    }).forEach(childNote => {
      if (graph.nodeInfo[childNote.uri.path] && folderNodeId !== childNote.uri.path) {
        graph.edges.add({
          source: folderNodeId,
          target: childNote.uri.path,
          type: 'structural',
        });
      }
    });

    if (folderPath !== workspaceRootPath) {
      try {
        const parentFolderUri = folderUri.getDirectory();
        if (parentFolderUri && parentFolderUri.path && parentFolderUri.path !== folderPath && parentFolderUri.path.startsWith(workspaceRootPath) && !containsDotFolderSegment(parentFolderUri)) {
          if (folderUrisToProcess.has(parentFolderUri.path)) {
             const parentNodeId = getOrCreateFolderNode(parentFolderUri, foam, graph.nodeInfo, workspaceRootPath);
             if (parentNodeId !== folderNodeId) {
                graph.edges.add({
                 source: parentNodeId,
                 target: folderNodeId,
                 type: 'structural',
               });
             }
          }
        } else if (parentFolderUri && parentFolderUri.path && parentFolderUri.path.startsWith(workspaceRootPath)) {
             Logger.info(`Excluding structural link from parent folder in dot-folder: ${parentFolderUri.path} -> ${folderPath}`);
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
          const rawUriString = message.payload; // This is expected to be the node ID (which is a URI path or synthetic ID)
          let selectedFoamUri: URI;
          let isSyntheticFolder = false;
          let isTag = false;

          if (rawUriString.startsWith('folder:')) {
            isSyntheticFolder = true;
            const folderPath = rawUriString.substring('folder:'.length);
            selectedFoamUri = URI.file(folderPath); 
          } else if (rawUriString.startsWith('tag:')) {
            isTag = true;
            // For tags, we don't have a file to open. We'll use the raw URI string for logging.
            // selectedFoamUri = URI.parse(rawUriString); // This would be a URI with 'tag' scheme
            Logger.info(`Clicked on a tag node: ${rawUriString}. No action defined yet.`);
            // Potentially, in the future, trigger a search or filter for this tag.
            // For now, we do nothing to prevent errors.
            return; // Exit early for tag clicks
          } else {
            // Assume it's a file path that can be parsed into a vscode.Uri and then a Foam URI
             try {
                selectedFoamUri = fromVsCodeUri(vscode.Uri.parse(rawUriString));
             } catch (parseError) {
                Logger.error(`Error parsing URI from payload: ${rawUriString}. Error: ${parseError.message}`);
                return; // Exit if URI parsing fails
             }
          }
          
          const vsCodeSelectedUri = toVsCodeUri(selectedFoamUri);

          if (isSyntheticFolder) {
            Logger.info(`Clicked on a synthetic folder node: ${selectedFoamUri.path}.`);
            const readmePath = vscode.Uri.joinPath(vsCodeSelectedUri, 'README.md');
            
            try {
                await vscode.workspace.fs.stat(readmePath);
                Logger.info(`README.md found in ${selectedFoamUri.path}. Opening it.`);
                vscode.commands.executeCommand('vscode.open', readmePath, vscode.ViewColumn.One);
            } catch (error) {
                Logger.info(`README.md not found in ${selectedFoamUri.path}. Prompting to create.`);
                const action = await vscode.window.showInformationMessage(
                    `This folder (${selectedFoamUri.getBasename() || selectedFoamUri.path}) has no README.md.`,
                    { modal: false },
                    'Create & Open README.md'
                );
                if (action === 'Create & Open README.md') {
                    try {
                        const defaultReadmeContent = `# ${selectedFoamUri.getBasename() || 'README'}\n\n`;
                        await vscode.workspace.fs.writeFile(readmePath, new TextEncoder().encode(defaultReadmeContent));
                        vscode.commands.executeCommand('vscode.open', readmePath, vscode.ViewColumn.One);
                    } catch (writeError) {
                        Logger.error(`Failed to create README.md in ${selectedFoamUri.path}: ${writeError.message}`);
                        vscode.window.showErrorMessage(`Failed to create README.md: ${writeError.message}`);
                    }
                }
            }
          } else if (!isTag) { // Ensure we don't try to open tags as files
            try {
              const selectedNote = foam.workspace.get(selectedFoamUri);
              if (isSome(selectedNote)) {
                vscode.commands.executeCommand(
                  'vscode.open',
                  vsCodeSelectedUri, 
                  vscode.ViewColumn.One
                );
              } else {
                 Logger.warn(`Could not get Foam note for selected node URI: ${selectedFoamUri.path}. Not attempting to open.`);
              }
            } catch (error) {
               Logger.error(`Error opening resource for selected node ${selectedFoamUri.path}: ${error.message}`);
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
