// Build animation sequence for call flow diagrams

import { FlowNode, FlowEdge, AnimationStep } from '@/types/call-flow';

/**
 * Build animation sequence using breadth-first traversal
 */
export function buildAnimationSequence(
  nodes: FlowNode[],
  edges: FlowEdge[]
): AnimationStep[] {
  const steps: AnimationStep[] = [];
  const visited = new Set<string>();

  // Find root nodes (nodes with no incoming edges)
  const rootNodes = findRootNodes(nodes, edges);

  if (rootNodes.length === 0) {
    return steps;
  }

  // Breadth-first traversal
  let currentLevel = rootNodes;
  let stepIndex = 0;

  while (currentLevel.length > 0) {
    const nodeIds = currentLevel.map(n => n.id);
    const nodeLabels = currentLevel.map(n => n.data.function).join(', ');

    // Mark nodes as visited
    currentLevel.forEach(n => visited.add(n.id));

    // Find edges from current level to next level
    const outgoingEdges = edges.filter(edge => nodeIds.includes(edge.source));

    steps.push({
      step: stepIndex++,
      nodesToHighlight: nodeIds,
      edgesToAnimate: outgoingEdges.map(e => e.id),
      description: nodeLabels,
    });

    // Get next level (children of current level that haven't been visited)
    const nextLevel: FlowNode[] = [];
    outgoingEdges.forEach(edge => {
      if (!visited.has(edge.target)) {
        const childNode = nodes.find(n => n.id === edge.target);
        if (childNode && !nextLevel.some(n => n.id === childNode.id)) {
          nextLevel.push(childNode);
        }
      }
    });

    currentLevel = nextLevel;
  }

  return steps;
}

/**
 * Find nodes with no incoming edges (root nodes)
 */
function findRootNodes(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const nodesWithIncomingEdges = new Set(edges.map(e => e.target));

  return nodes.filter(node => !nodesWithIncomingEdges.has(node.id));
}

/**
 * Find child nodes for a given set of nodes
 */
export function findChildNodes(
  parentNodes: FlowNode[],
  edges: FlowEdge[],
  visited: Set<string>
): FlowNode[] {
  const parentIds = parentNodes.map(n => n.id);
  const childIds = edges
    .filter(edge => parentIds.includes(edge.source))
    .map(edge => edge.target)
    .filter(id => !visited.has(id));

  return Array.from(new Set(childIds)).map(id => {
    const node = parentNodes.find(n => n.id === id);
    return node!;
  }).filter(Boolean);
}

/**
 * Apply animation state to nodes and edges
 */
export function applyAnimationState(
  nodes: FlowNode[],
  edges: FlowEdge[],
  highlightedNodes: Set<string>,
  highlightedEdges: Set<string>
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const updatedNodes = nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      isHighlighted: highlightedNodes.has(node.id),
    },
  }));

  const updatedEdges = edges.map(edge => ({
    ...edge,
    animated: highlightedEdges.has(edge.id),
  }));

  return {
    nodes: updatedNodes,
    edges: updatedEdges,
  };
}
