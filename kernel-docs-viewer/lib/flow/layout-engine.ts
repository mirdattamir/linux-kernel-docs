// Auto-layout engine using dagre

import dagre from 'dagre';
import { FlowNode, FlowEdge } from '@/types/call-flow';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

/**
 * Apply dagre layout algorithm to nodes
 */
export function applyLayout(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const dagreGraph = new dagre.graphlib.Graph();

  dagreGraph.setGraph({
    rankdir: 'TB', // Top to bottom
    nodesep: 80,   // Horizontal spacing between nodes
    ranksep: 120,  // Vertical spacing between ranks
    marginx: 50,
    marginy: 50,
  });

  dagreGraph.setDefaultEdgeLabel(() => ({}));

  // Add nodes to dagre graph
  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  });

  // Add edges to dagre graph
  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Apply calculated positions to nodes
  const layoutedNodes = nodes.map(node => {
    const nodeWithPosition = dagreGraph.node(node.id);

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return layoutedNodes;
}

/**
 * Get graph bounds (for viewport fitting)
 */
export function getGraphBounds(nodes: FlowNode[]): { width: number; height: number } {
  if (nodes.length === 0) {
    return { width: 0, height: 0 };
  }

  const minX = Math.min(...nodes.map(n => n.position.x));
  const maxX = Math.max(...nodes.map(n => n.position.x + NODE_WIDTH));
  const minY = Math.min(...nodes.map(n => n.position.y));
  const maxY = Math.max(...nodes.map(n => n.position.y + NODE_HEIGHT));

  return {
    width: maxX - minX,
    height: maxY - minY,
  };
}
