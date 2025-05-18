const CONTAINER_ID = 'graph';

const initGUI = () => {
  const gui = new dat.gui.GUI();
  const nodeTypeFilterFolder = gui.addFolder('Filter by type');
  const nodeTypeFilterControllers = new Map();

  return {
    /**
     * Update the DAT controls to reflect the model
     */
    update: m => {
      // Update the DAT controls
      const types = new Set(Object.keys(m.showNodesOfType));
      // Add new ones
      Array.from(types)
        .sort()
        .forEach(type => {
          if (!nodeTypeFilterControllers.has(type)) {
            const ctrl = nodeTypeFilterFolder
              .add(m.showNodesOfType, type)
              .onFinishChange(function () {
                Actions.updateFilters();
              });
            ctrl.domElement.previousSibling.style.color = getNodeTypeColor(
              type,
              m
            );
            nodeTypeFilterControllers.set(type, ctrl);
          }
        });
      // Remove old ones
      for (const type of nodeTypeFilterControllers.keys()) {
        if (!types.has(type)) {
          nodeTypeFilterFolder.remove(nodeTypeFilterControllers.get(type));
          nodeTypeFilterControllers.delete(type);
        }
      }
    },
  };
};

function getStyle(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name);
}

const defaultStyle = {
  background: getStyle(`--vscode-panel-background`) ?? '#202020',
  fontSize: parseInt(getStyle(`--vscode-font-size`) ?? 12) - 2,
  fontFamily: 'Sans-Serif',
  lineColor: getStyle('--vscode-editor-foreground') ?? '#277da1',
  lineWidth: 0.2,
  particleWidth: 1.0,
  highlightedForeground:
    getStyle('--vscode-list-highlightForeground') ?? '#f9c74f',
  node: {
    note: getStyle('--vscode-editor-foreground') ?? '#277da1',
    placeholder: getStyle('--vscode-list-deemphasizedForeground') ?? '#545454',
    tag: getStyle('--vscode-list-highlightForeground') ?? '#f9c74f',
    folder: getStyle('--vscode-tree-indentGuidesStroke') ?? '#c586c0', // Added folder color
  },
};

let model = {
  selectedNodes: new Set(),
  hoverNode: null,
  focusNodes: new Set(),
  focusLinks: new Set(),
  /** The original graph data.
   * This is the full graph data representing the workspace
   */
  graph: {
    nodeInfo: {},
    links: [],
  },
  /** This is the graph data used to render the graph by force-graph.
   * This is derived from model.graph, e.g. by applying filters by node type
   */
  data: {
    nodes: [],
    links: [],
  },
  /** The style property.
   * It tries to be set using VSCode values,
   * in the case it fails, use the fallback style values.
   */
  style: defaultStyle,
  showNodesOfType: {
    placeholder: true,
    image: false,
    attachment: false,
    note: true,
    tag: true,
    folder: true, // Added folder type filter
  },
};

const graph = ForceGraph();
const gui = initGUI();

function update(patch) {
  const startTime = performance.now();
  // Apply the patch function to the model..
  patch(model);
  // ..then compute the derived state

  // compute highlighted elements
  const focusNodes = new Set();
  const focusLinks = new Set();
  if (model.hoverNode) {
    focusNodes.add(model.hoverNode);
    const info = model.graph.nodeInfo[model.hoverNode];
    if (info) { 
        info.neighbors.forEach(neighborId => focusNodes.add(neighborId));
        info.links.forEach(link => focusLinks.add(link));
    }
  }
  if (model.selectedNodes) {
    model.selectedNodes.forEach(nodeId => {
      focusNodes.add(nodeId);
      const info = model.graph.nodeInfo[nodeId];
      if (info) { 
          info.neighbors.forEach(neighborId => focusNodes.add(neighborId));
          info.links.forEach(link => focusLinks.add(link));
      }
    });
  }
  model.focusNodes = focusNodes;
  model.focusLinks = focusLinks;

  gui.update(model);
  console.log(`Updated model in ${performance.now() - startTime}ms`);
}

const Actions = {
  refreshWorkspaceData: graphInfo =>
    update(m => {
      m.graph = augmentGraphInfo(graphInfo); 

      // compute node types
      let types = new Set();
      Object.values(model.graph.nodeInfo).forEach(node => types.add(node.type));
      const existingTypes = Object.keys(model.showNodesOfType);
      existingTypes.forEach(exType => {
        if (!types.has(exType)) {
          delete model.showNodesOfType[exType];
        }
      });
      types.forEach(type => {
        if (model.showNodesOfType[type] == null) {
          model.showNodesOfType[type] = true;
        }
      });

      updateForceGraphDataFromModel(m);
    }),
  selectNode: (nodeId, isAppend) =>
    update(m => {
      if (!isAppend) {
        m.selectedNodes.clear();
      }
      if (nodeId != null) {
        m.selectedNodes.add(nodeId);
      }
    }),
  highlightNode: nodeId =>
    update(m => {
      m.hoverNode = nodeId;
    }),
  /** Applies a new style to the graph,
   * missing elements are set to their existing values.
   *
   * @param {*} newStyle the style to be applied
   */
  updateStyle: newStyle => {
    if (!newStyle) {
      return;
    }
    model.style = {
      ...defaultStyle,
      ...newStyle,
      lineColor:
        newStyle.lineColor ||
        (newStyle.node && newStyle.node.note) ||
        defaultStyle.lineColor,
      node: {
        ...defaultStyle.node,
        ...newStyle.node,
      },
      // Add new structural link style properties
      showStructuralLinks: newStyle.showStructuralLinks ?? defaultStyle.showStructuralLinks,
      showReferenceLinks: newStyle.showReferenceLinks ?? defaultStyle.showReferenceLinks,
      structuralLineColor: newStyle.structuralLineColor ?? defaultStyle.structuralLineColor,
      structuralForceStrength: newStyle.structuralForceStrength ?? defaultStyle.structuralForceStrength,
    };
    graph.backgroundColor(model.style.background);
  },
  updateFilters: () => {
    update(m => {
      updateForceGraphDataFromModel(m);
    });
  },
};

function initDataviz(channel) {
  const elem = document.getElementById(CONTAINER_ID);
  const painter = new Painter();

  // Create a tooltip element
  const tooltip = document.createElement('div');
  tooltip.id = 'graph-tooltip';
  tooltip.style.position = 'absolute';
  tooltip.style.background = 'rgba(0, 0, 0, 0.8)';
  tooltip.style.color = 'white';
  tooltip.style.padding = '5px';
  tooltip.style.borderRadius = '3px';
  tooltip.style.pointerEvents = 'none'; // Don't block mouse events
  tooltip.style.display = 'none'; // Initially hidden
  tooltip.style.zIndex = '1000'; // Ensure it's on top
  document.body.appendChild(tooltip);


  graph(elem)
    .graphData(model.data)
    .backgroundColor(model.style.background)
    .linkHoverPrecision(8)
    .d3Force('x', d3.forceX())
    .d3Force('y', d3.forceY())
    .d3Force('collide', d3.forceCollide(graph.nodeRelSize()))
    // Differentiate link width based on type
    .linkWidth(link => link.type === 'structural' ? 2.5 : model.style.lineWidth) // Thicker for structural
    .linkDirectionalParticles(1)
    .linkDirectionalParticleWidth(link =>
      getLinkState(link, model) === 'highlighted'
        ? model.style.particleWidth
        : 0
    )
    .nodeCanvasObject((node, ctx, globalScale) => {
      const info = model.graph.nodeInfo[node.id];
      if (info == null) {
        console.error(`Could not find info for node ${node.id} - skipping`);
        return;
      }
      const nodeState = getNodeState(node.id, model);
      if (nodeState === 'hidden') {
        return; // Don't draw hidden nodes
      }

      const size = getNodeSize(info.neighbors.length);
      const { fill, border } = getNodeColor(node.id, model); // getNodeState is called within getNodeColor
      const fontSize = model.style.fontSize / globalScale;
      // nodeState is already fetched
      const textColor = fill.copy({
        opacity:
          nodeState === 'regular'
            ? getNodeLabelOpacity(globalScale)
            : nodeState === 'highlighted'
            ? 1
            : Math.min(getNodeLabelOpacity(globalScale), fill.opacity),
      });
      const label = info.title;

      painter
        .circle(node.x, node.y, size, fill, border);

      // Implement adaptive node titles based on zoom level and node type
      // Show labels for folders and README/index files at all zoom levels, and other nodes above a certain zoom threshold (e.g., 0.5)
      if (globalScale >= 0.5 || info.type === 'folder' || (info.uri && (info.uri.path.endsWith('/README.md') || info.uri.path.endsWith('/index.md')))) { 
         painter.text(
           label,
           node.x,
           node.y + size + 1,
           fontSize,
           model.style.fontFamily,
           textColor
         );
      }
    })
    .onRenderFramePost(ctx => {
      painter.paint(ctx);
    })
    .linkColor(link => getLinkColor(link, model))
    .onNodeHover(node => {
      Actions.highlightNode(node?.id);

      if (node) {
        const info = model.graph.nodeInfo[node.id];
        if (info) {
          let tooltipContent = `<b>${info.title}</b>`; 

          try {
            if (info.uri && info.uri.path) { 
              tooltipContent += `<br>${info.uri.path}`;
            } else if (info.type === 'tag') {
              // Handle tag nodes specifically if needed, e.g., show tag name
            }
            // Add properties if they exist
            if (info.properties && Object.keys(info.properties).length > 0) {
              tooltipContent += '<br>---<br>Properties:';
              for (const key in info.properties) {
                if (Object.hasOwnProperty.call(info.properties, key)) {
                  tooltipContent += `<br><b>${key}:</b> ${info.properties[key]}`;
                }
              }
            }
          } catch (e) {
             console.error("Error generating tooltip content:", e);
             tooltipContent = `Error displaying info for node: ${node.id}`; 
          }

          tooltip.innerHTML = tooltipContent;
          tooltip.style.display = 'block';

          // Position tooltip near the node (adjust offset as needed)
          const nodeCoords = graph.graph2ScreenCoords(node.x, node.y);
          tooltip.style.left = `${nodeCoords.x + 10}px`;
          tooltip.style.top = `${nodeCoords.y + 10}px`;
        }
      } else {
        tooltip.style.display = 'none';
      }
    })
    .onNodeClick((node, event) => {
      channel.postMessage({
        type: 'webviewDidSelectNode',
        payload: node.id,
      });
      Actions.selectNode(node.id, event.getModifierState('Shift'));
    })
    .onBackgroundClick(event => {
      Actions.selectNode(null, event.getModifierState('Shift'));
    });
}

function augmentGraphInfo(graph) {
  // This function is now primarily for adding neighbor and link references to nodes
  // The creation of tag nodes and edges is handled in generateGraphData in dataviz.ts

  Object.values(graph.nodeInfo).forEach(node => {
    node.neighbors = [];
    node.links = [];
  });

  graph.links.forEach(link => {
    const sourceNode = graph.nodeInfo[link.source];
    const targetNode = graph.nodeInfo[link.target];

    if (sourceNode && targetNode) {
        sourceNode.neighbors.push(targetNode.id);
        targetNode.neighbors.push(sourceNode.id);
        sourceNode.links.push(link);
        targetNode.links.push(link);
    } else {
        console.warn(`Link references non-existent node(s): ${link.source} -> ${link.target}`);
    }
  });
  return graph;
}

function updateForceGraphDataFromModel(m) {
  const nodeIdsToAdd = new Set(
    Object.values(m.graph.nodeInfo ?? {})
      .filter(n => model.showNodesOfType[n.type])
      .map(n => n.id)
  );

  const nodeIdsToRemove = new Set();
  m.data.nodes.forEach(node => {
    if (nodeIdsToAdd.has(node.id)) {
      nodeIdsToAdd.delete(node.id);
    } else {
      nodeIdsToRemove.add(node.id);
    }
  });
  nodeIdsToRemove.forEach(id => {
    const index = m.data.nodes.findIndex(n => n.id === id);
    if (index !== -1) { 
        m.data.nodes.splice(index, 1);
    }
  });
  nodeIdsToAdd.forEach(nodeId => {
    m.data.nodes.push({
      id: nodeId,
    });
  });

  m.data.links = m.graph.links
    .filter(link => {
      if (link.type === 'structural' && !model.style.showStructuralLinks) {
        return false;
      }
      if (link.type === 'reference' && !model.style.showReferenceLinks) {
        return false;
      }
      if (link.type === 'tag' && !model.showNodesOfType['tag']) { 
          return false;
      }

      const sourceNode = m.graph.nodeInfo[link.source];
      const targetNode = m.graph.nodeInfo[link.target];

      return sourceNode && model.showNodesOfType[sourceNode.type] &&
             targetNode && model.showNodesOfType[targetNode.type];
    })
    .map(link => ({ ...link }));

  m.hoverNode = m.graph.nodeInfo[m.hoverNode] != null ? m.hoverNode : null;
  m.selectedNodes = new Set(
    Array.from(m.selectedNodes).filter(nId => m.graph.nodeInfo[nId] != null)
  );

  graph.graphData(m.data);

  graph.d3Force('link').strength(link => {
    if (link.type === 'structural' && model.style.showStructuralLinks) {
      return model.style.structuralForceStrength;
    }
    // You can add different strengths for 'reference' and 'tag' links here if needed for layout influence
    // For example:
    // if (link.type === 'reference' && model.style.showReferenceLinks) { return 0.1; }
    // if (link.type === 'tag' && model.showNodesOfType['tag']) { return 0.05; }
    return null; 
  });
}

const getNodeSize = d3
  .scaleLinear()
  .domain([0, 30])
  .range([0.5, 2])
  .clamp(true);

const getNodeLabelOpacity = d3
  .scaleLinear()
  .domain([1.2, 2])
  .range([0, 1])
  .clamp(true);

function getNodeTypeColor(type, model) {
  const style = model.style;
  return style.node[type ?? 'note'] ?? style.node['note'];
}

function getNodeColor(nodeId, model) {
  const info = model.graph.nodeInfo[nodeId];
  const style = model.style;

  const nodeType = info?.type; 

  const typeFill = info?.properties?.color 
    ? d3.rgb(info.properties.color)
    : d3.rgb(getNodeTypeColor(nodeType, model)); 

  const nodeState = getNodeState(nodeId, model);
  switch (nodeState) {
    case 'regular':
      return { fill: typeFill, border: typeFill };
    case 'lessened':
      const transparent = d3.rgb(typeFill).copy({ opacity: 0.05 });
      return { fill: transparent, border: transparent };
    case 'highlighted':
      return {
        fill: typeFill,
        border: d3.rgb(style.highlightedForeground),
      };
    case 'hidden':
      const hiddenColor = d3.rgb(typeFill).copy({ opacity: 0 });
      return { fill: hiddenColor, border: hiddenColor };
    default:
      console.error('Unknown state for node', nodeId, 'state:', nodeState);
      return { fill: 'red', border: 'red' };
  }
}

function getLinkColor(link, model) {
  const style = model.style;
  if (link.type === 'structural' && model.style.showStructuralLinks) {
    return style.structuralLineColor;
  } else if (link.type === 'reference' && model.style.showReferenceLinks) {
    const linkState = getLinkState(link, model);
    switch (linkState) {
      case 'regular':
        const sourceNode = model.graph.nodeInfo[link.source];
        const targetNode = model.graph.nodeInfo[link.target];
        if (sourceNode?.type === 'tag' && targetNode?.type === 'tag') {
           return getNodeTypeColor('tag', model);
        }
        return style.lineColor;
      case 'highlighted':
        return style.highlightedForeground;
      case 'lessened':
        return d3.hsl(style.lineColor).copy({ opacity: 0.5 });
      case 'hidden':
        return 'rgba(0,0,0,0)';
      default:
        console.error('Unknown state for reference link', link, 'state:', linkState);
        return 'red';
    }
  } else if (link.type === 'tag' && model.showNodesOfType['tag']) { 
       const tagLinkState = getLinkState(link, model);
       switch (tagLinkState) {
           case 'regular':
               return getNodeTypeColor('tag', model);
           case 'highlighted':
               return style.highlightedForeground;
           case 'lessened':
               return d3.hsl(getNodeTypeColor('tag', model)).copy({ opacity: 0.5 });
           case 'hidden':
               return 'rgba(0,0,0,0)';
           default:
               console.error('Unknown state for tag link', link, 'state:', tagLinkState);
               return 'red';
       }
  }
   else {
     return 'rgba(0,0,0,0)';
   }
}

function getLinkNodeId(endpoint) {
  return typeof endpoint === 'object' ? endpoint.id : endpoint;
}

function getNodeState(nodeId, model) {
  try { 
    const isSelected = model.selectedNodes.has(nodeId);
    const isHighlighted = model.focusNodes.has(nodeId);
    const isVisible = model.data.nodes.some(n => n.id === nodeId); 

    if (!isVisible) {
        return 'hidden'; 
    } else if (isSelected || isHighlighted) {
      return 'highlighted';
    } else if (model.selectedNodes.size > 0 || model.hoverNode != null) {
      return 'lessened';
    } else {
      return 'regular';
    }
  } catch (e) {
    console.error('Error in getNodeState for node', nodeId, e); 
    return 'regular'; 
  }
}

function getLinkState(link, model) {
  try { 
    const isHighlighted = model.focusLinks.has(link);
    const isVisible = model.data.links.some(l => l.source === getLinkNodeId(link.source) && l.target === getLinkNodeId(link.target));

     if (!isVisible) {
         return 'hidden'; 
     } else if (isHighlighted) {
      return 'highlighted';
    } else if (model.selectedNodes.size > 0 || model.hoverNode != null) {
      return 'lessened';
    } else {
      return 'regular';
    }
  } catch (e) {
    console.error('Error in getLinkState for link', link, e); 
    return 'regular'; 
  }
}

class Painter {
  constructor() {
    this.elements = [];
  }

  _addCircle(x, y, radius, color, isBorder = false) {
    this.elements.push({ type: 'circle', x, y, radius, color, isBorder });
  }

  circle(x, y, radius, fill, border) {
    this._addCircle(x, y, radius, border, true);
    this._addCircle(x, y, radius * 0.8, fill);
  }

  text(text, x, y, size, family, color) {
    this.elements.push({ type: 'text', text, x, y, size, family, color });
  }

  paint(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    this.elements.forEach(elem => {
      ctx.fillStyle = elem.color;
      ctx.strokeStyle = elem.color;
      if (elem.type === 'circle') {
        ctx.beginPath();
        ctx.arc(elem.x, elem.y, elem.radius, 0, 2 * Math.PI, false);
        if (elem.isBorder) {
          ctx.lineWidth = 0.5;
          ctx.stroke();
        } else {
          ctx.fill();
        }
      } else if (elem.type === 'text') {
        ctx.font = `${elem.size}px ${elem.family}`;
        ctx.fillText(elem.text, elem.x, elem.y);
      }
    });
    this.elements = []; 
  }
}

// Acquire the VS Code API
const vscode = acquireVsCodeApi();

// Handle messages from the extension
window.addEventListener('message', event => {
  const message = event.data; 
  switch (message.type) {
    case 'didUpdateGraphData':
      Actions.refreshWorkspaceData(message.payload);
      break;
    case 'didUpdateStyle':
      Actions.updateStyle(message.payload);
      break;
    case 'didSelectNote':
      Actions.selectNode(message.payload, false); 
      break;
    default:
      console.warn('Unknown message type received:', message.type);
  }
});

// Signal to extension that the webview is ready
const channel = {
  postMessage: message => vscode.postMessage(message), 
};
channel.postMessage({ type: 'webviewDidLoad' });

// Initialize the dataviz when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initDataviz(channel);
});
