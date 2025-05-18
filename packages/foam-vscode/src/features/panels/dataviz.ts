import * as vscode from 'vscode';
import { Foam } from '../../core/model/foam';
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

function generateGraphData(foam: Foam) {
  const graph = {
    nodeInfo: {},
    edges: new Set(),
  };

  foam.workspace.list().forEach(n => {
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
  });
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
      };
    }
  });

  // Add structural links based on folder hierarchy
  const foldersProcessed = new Set<string>();

  foam.workspace.list().forEach(note => {
    const folderUri = note.uri.getDirectory();
    const folderPath = folderUri.path;

    // Avoid processing the same folder multiple times
    if (foldersProcessed.has(folderPath)) {
      return;
    }
    foldersProcessed.add(folderPath);

    // Determine the folder's root node
    let folderNodeId: string;
    // Convert Foam URI to VSCode Uri for joinPath
    const vsCodeFolderUri = toVsCodeUri(folderUri);
    const readmeUri = vscode.Uri.joinPath(vsCodeFolderUri, 'README.md');
    const indexUri = vscode.Uri.joinPath(vsCodeFolderUri, 'index.md');

    // Convert VSCode Uri back to Foam URI for foam.workspace.get
    const readmeNote = foam.workspace.get(fromVsCodeUri(readmeUri));
    const indexNote = foam.workspace.get(fromVsCodeUri(indexUri));

    if (isSome(readmeNote)) {
      folderNodeId = readmeNote.uri.path;
      // Ensure the README note is added as a node if it wasn't already
      if (!graph.nodeInfo[folderNodeId]) {
         graph.nodeInfo[folderNodeId] = {
           id: folderNodeId,
           type: readmeNote.type === 'note' ? readmeNote.properties.type ?? 'note' : readmeNote.type,
           uri: readmeNote.uri,
           title: cutTitle(readmeNote.type === 'note' ? readmeNote.title : readmeNote.uri.getBasename()),
           properties: readmeNote.properties,
           tags: readmeNote.tags,
         };
      }
    } else if (isSome(indexNote)) {
      folderNodeId = indexNote.uri.path;
       // Ensure the index note is added as a node if it wasn't already
      if (!graph.nodeInfo[folderNodeId]) {
         graph.nodeInfo[folderNodeId] = {
           id: folderNodeId,
           type: indexNote.type === 'note' ? indexNote.properties.type ?? 'note' : indexNote.type,
           uri: indexNote.uri,
           title: cutTitle(indexNote.type === 'note' ? indexNote.title : indexNote.uri.getBasename()),
           properties: indexNote.properties,
           tags: indexNote.tags,
         };
      }
    } else {
      // Create a synthetic folder node
      folderNodeId = `folder:${folderPath}`;
      // Add the synthetic folder node
      if (!graph.nodeInfo[folderNodeId]) {
        graph.nodeInfo[folderNodeId] = {
          id: folderNodeId,
          type: 'folder',
          uri: folderUri, // Use folder URI for synthetic node
          title: folderUri.getBasename() || folderPath, // Use folder name or path
          properties: {}, // Synthetic nodes have no properties
          tags: [], // Synthetic nodes have no tags
        };
      }
    }

    // Now, find all notes within this folder and create structural links
    foam.workspace.list().filter(n => n.uri.getDirectory().path === folderPath).forEach(childNote => {
        // Avoid creating a structural link from a folder node to itself if the folder node is a note (README/index)
        if (folderNodeId !== childNote.uri.path) {
             graph.edges.add({
               source: folderNodeId,
               target: childNote.uri.path,
               type: 'structural', // Add structural type
             });
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
