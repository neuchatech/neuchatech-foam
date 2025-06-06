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
  showReferenceLinks: true, // Ensure reference links are shown by default
  showStructuralLinks: true, // Ensure structural links are shown by default
  structuralForceStrength: 10, // Increase default structural link force strength
  node: {
    note: getStyle('--vscode-editor-foreground') ?? '#277da1',
    placeholder: getStyle('--vscode-list-deemphasizedForeground') ?? '#545454',
    tag: getStyle('--vscode-list-highlightForeground') ?? '#f9c74f',
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
    info.neighbors.forEach(neighborId => focusNodes.add(neighborId));
    info.links.forEach(link => focusLinks.add(link));
  }
  if (model.selectedNodes) {
    model.selectedNodes.forEach(nodeId => {
      focusNodes.add(nodeId);
      const info = model.graph.nodeInfo[nodeId];
      info.neighbors.forEach(neighborId => focusNodes.add(neighborId));
      info.links.forEach(link => focusLinks.add(link));
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
      m.graph = graphInfo;

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
      const size = getNodeSize(info.neighbors.length);
      const { fill, border } = getNodeColor(node.id, model);
      const fontSize = model.style.fontSize / globalScale;
      const nodeState = getNodeState(node.id, model);
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
      // Implement adaptive node titles based on zoom level and node type
      // Show labels for folders and README/index files at all zoom levels, and other nodes above a certain zoom threshold (e.g., 0.5)
      if (globalScale >= 0.5 || info.type === 'folder' || node.id.endsWith('/README.md') || node.id.endsWith('/index.md')) {
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
          // Populate and show tooltip with more details
          let tooltipContent = `<b>${info.title}</b><br>${info.uri.path}`;
          if (info.properties && Object.keys(info.properties).length > 0) {
            tooltipContent += '<br>---<br>Properties:';
            for (const key in info.properties) {
              if (Object.hasOwnProperty.call(info.properties, key)) {
                tooltipContent += `<br><b>${key}:</b> ${info.properties[key]}`;
              }
            }
          }
          tooltip.innerHTML = tooltipContent;
          tooltip.style.display = 'block';

          // Position tooltip near the node (adjust offset as needed)
          const nodeCoords = graph.graph2ScreenCoords(node.x, node.y);
          tooltip.style.left = `${nodeCoords.x + 10}px`;
          tooltip.style.top = `${nodeCoords.y + 10}px`;
        }
      } else {
        // Hide tooltip
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
  Object.values(graph.nodeInfo).forEach(node => {
    node.neighbors = [];
    node.links = [];
    if (node.tags && node.tags.length > 0) {
      node.tags.forEach(tag => {
        subtags = tag.label.split('/');
        for (let i = 0; i < subtags.length; i++) {
          const label = subtags.slice(0, i + 1).join('/');
          const tagNode = {
            id: label,
            title: label,
            type: 'tag',
            properties: {},
            neighbors: [],
            links: [],
          };
          graph.nodeInfo[tagNode.id] = tagNode;
          if (i > 0) {
            const parent = subtags.slice(0, i).join('/');
            graph.links.push({
              source: parent,
              target: label,
            });
          }
        }
        graph.links.push({
          source: tag.label,
          target: node.id,
        });
      });
    }
  });
  graph.links.forEach(link => {
    const a = graph.nodeInfo[link.source];
    const b = graph.nodeInfo[link.target];
    a.neighbors.push(b.id);
    b.neighbors.push(a.id);
    a.links.push(link);
    b.links.push(link);
  });
  return graph;
}

function updateForceGraphDataFromModel(m) {
  // compute graph delta, for smooth transitions we need to mutate objects in-place
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
  // apply the delta
  nodeIdsToRemove.forEach(id => {
    const index = m.data.nodes.findIndex(n => n.id === id);
    m.data.nodes.splice(index, 1); // delete the element
  });
  nodeIdsToAdd.forEach(nodeId => {
    m.data.nodes.push({
      id: nodeId,
    });
  });

  // links can be swapped out without problem, we just need to filter them
  m.data.links = m.graph.links
    .filter(link => {
      // Filter links based on configuration settings
      if (link.type === 'structural') {
        return model.style.showStructuralLinks;
      }
      if (link.type === 'reference') {
        // TEMPORARY DEBUGGING: Only filter reference links based on the style setting
        return model.style.showReferenceLinks;
      }
      if (link.type === 'tag') {
          // Only show tag links if the tag node type is visible AND both endpoints are visible node types
          const sourceNode = m.graph.nodeInfo[link.source];
          const targetNode = m.graph.nodeInfo[link.target];
          return model.showNodesOfType['tag'] &&
                 sourceNode && model.showNodesOfType[sourceNode.type] &&
                 targetNode && model.showNodesOfType[targetNode.type];
      }

      // Hide any other link types by default
      return false;
    })
    .map(link => ({ ...link }));

  // check that selected/hovered nodes are still valid (see #397)
  m.hoverNode = m.graph.nodeInfo[m.hoverNode] != null ? m.hoverNode : null;
  m.selectedNodes = new Set(
    Array.from(m.selectedNodes).filter(nId => m.graph.nodeInfo[nId] != null)
  );

  // annoying we need to call this function, but I haven't found a good workaround
  graph.graphData(m.data);

  // Adjust link force strength based on type and configuration
  graph.d3Force('link').strength(link => {
    if (link.type === 'structural' && model.style.showStructuralLinks) {
      return model.style.structuralForceStrength;
    }
    return null; // Use default strength for other links or if structural links are hidden
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

  // Use 'folder' type color for README/index files to match synthetic folder nodes
  const nodeType = (nodeId.endsWith('/README.md') || nodeId.endsWith('/index.md')) ? 'folder' : info.type;

  const typeFill = info.properties.color
    ? d3.rgb(info.properties.color)
    : d3.rgb(getNodeTypeColor(nodeType, model)); // Use determined nodeType for color

  switch (getNodeState(nodeId, model)) {
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
    default:
      throw new Error('Unknown type for node', nodeId);
  }
}

function getLinkColor(link, model) {
  const style = model.style;
  // Differentiate link color based on type and configuration
  if (link.type === 'structural' && model.style.showStructuralLinks) {
    // Use configured structural line color
    return style.structuralLineColor;
  } else if (link.type === 'reference' && model.style.showReferenceLinks) {
    // Use default line color for reference links based on state
    switch (getLinkState(link, model)) {
      case 'regular':
        if (
          model.graph.nodeInfo[getLinkNodeId(link.source)].type === 'tag' &&
          model.graph.nodeInfo[getLinkNodeId(link.target)].type === 'tag'
        ) {
          return getNodeTypeColor('tag', model);
        }
        return style.lineColor;
      case 'highlighted':
        return style.highlightedForeground;
      case 'lessened':
        return d3.hsl(style.lineColor).copy({ opacity: 0.5 });
      default:
        throw new Error('Unknown state for reference link', link);
    }
  } else {
     // Handle other potential link types or if links are hidden
     return 'rgba(0,0,0,0)'; // Make hidden links transparent
  }
}

/**
 * Helper function to safely get node ID from a link's source or target
 * Handles both when the link endpoint is a string ID or a full node object
 * @param {string|Object} endpoint - Either a node ID string or a node object
 * @returns {string} The node ID
 */
function getLinkNodeId(endpoint) {
  return typeof endpoint === 'object' ? endpoint.id : endpoint;
}

function getNodeState(nodeId, model) {
  return model.selectedNodes.has(nodeId) || model.hoverNode === nodeId
    ? 'highlighted'
    : model.focusNodes.size === 0
    ? 'regular'
    : model.focusNodes.has(nodeId)
    ? 'regular'
    : 'lessened';
}

function getLinkState(link, model) {
  return model.focusNodes.size === 0
    ? 'regular'
    : Array.from(model.focusLinks).some(
        fLink =>
          getLinkNodeId(fLink.source) === getLinkNodeId(link.source) &&
          getLinkNodeId(fLink.target) === getLinkNodeId(link.target)
      )
    ? 'highlighted'
    : 'lessened';
}

class Painter {
  circlesByColor = new Map();
  bordersByColor = new Map();
  texts = [];

  _addCircle(x, y, radius, color, isBorder = false) {
    if (color.opacity > 0) {
      const target = isBorder ? this.bordersByColor : this.circlesByColor;
      if (!target.has(color)) {
        target.set(color, []);
      }
      target.get(color).push({ x, y, radius });
    }
  }

  _areSameColor(a, b) {
    return a.r === b.r && a.g === b.g && a.b === b.b && a.opacity === b.opacity;
  }

  circle(x, y, radius, fill, border) {
    this._addCircle(x, y, radius + 0.2, border, true);
    if (!this._areSameColor(border, fill)) {
      this._addCircle(x, y, radius, fill);
    }
    return this;
  }

  text(text, x, y, size, family, color) {
    if (color.opacity > 0) {
      this.texts.push({ x, y, text, size, family, color });
    }
    return this;
  }

  paint(ctx) {
    // Draw nodes
    // first draw borders, then draw contents over them
    for (const target of [this.bordersByColor, this.circlesByColor]) {
      for (const [color, circles] of target.entries()) {
        ctx.beginPath();
        ctx.fillStyle = color;
        for (const circle of circles) {
          ctx.arc(circle.x, circle.y, circle.radius, 0, 2 * Math.PI, false);
        }
        ctx.closePath();
        ctx.fill();
      }
      target.clear();
    }

    // Draw labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const text of this.texts) {
      ctx.font = `${text.size}px ${text.family}`;
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, text.x, text.y);
    }
    this.texts = [];

    return this;
  }
}

// init the app
try {
  const vscode = acquireVsCodeApi();
  window.model = model;
  window.graphUpdated = false;

  window.onload = () => {
    initDataviz(vscode);
    console.log('ready');
    vscode.postMessage({
      type: 'webviewDidLoad',
    });
  };

  window.addEventListener('error', error => {
    vscode.postMessage({
      type: 'error',
      payload: {
        message: error.message,
        filename: error.filename,
        lineno: error.lineno,
        colno: error.colno,
        error: error.error,
      },
    });
  });

  window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
      case 'didUpdateGraphData':
        graphData = augmentGraphInfo(message.payload);
        Actions.refreshWorkspaceData(graphData);
        if (!graphUpdated) {
          window.graphUpdated = true;
          graph.zoom(graph.zoom() * 1.5);
          graph.cooldownTicks(100);
          graph.onEngineStop(() => {
            graph.onEngineStop(() => {});
            graph.zoomToFit(500);
          });
        }
        console.log('didUpdateGraphData', graphData);
        break;
      case 'didSelectNote':
        const noteId = message.payload;
        const node = graph.graphData().nodes.find(node => node.id === noteId);
        if (node) {
          graph.centerAt(node.x, node.y, 300).zoom(3, 300);
          Actions.selectNode(noteId);
        }
        break;
      case 'didUpdateStyle':
        const style = message.payload;
        Actions.updateStyle(style);
        break;
    }
  });
} catch {
  console.log('VS Code not detected');
}

window.addEventListener('resize', () => {
  graph.width(window.innerWidth).height(window.innerHeight);
});

// For testing
if (window.data) {
  console.log('Test mode');
  window.model = model;
  window.graph = graph;
  window.onload = () => {
    initDataviz({
      postMessage: message => console.log('message', message),
    });
    const graphData = augmentGraphInfo(window.data);
    Actions.refreshWorkspaceData(graphData);
  };
}
