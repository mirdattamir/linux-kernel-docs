// Build React Flow graph from CallPath data

import { CallPath, CallPathStep } from '@/types/subsystem';
import { FlowNode, FlowEdge } from '@/types/call-flow';
import { applyLayout } from './layout-engine';
import { getStandardFunctionInfo } from '../parsers/call-path-extractor';

/**
 * Convert a CallPath to React Flow nodes and edges
 */
export function buildFlowGraph(callPath: CallPath): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  let nodeIdCounter = 0;

  /**
   * Recursive function to traverse call path tree
   */
  function traverse(step: CallPathStep, parentId: string | null = null, depth: number = 0): string {
    const currentNodeId = `node-${nodeIdCounter++}`;

    // Get standard function info if available
    const standardInfo = getStandardFunctionInfo(step.function);

    // Build list of functions this calls (children)
    const calls = step.children.map(child => child.function);

    // Create node with extended metadata
    const node: FlowNode = {
      id: currentNodeId,
      type: 'custom',
      position: { x: 0, y: 0 }, // Will be calculated by layout engine
      data: {
        label: step.function,
        function: step.function,
        file: step.file,
        description: step.description || standardInfo.description,
        type: step.type,
        isAnimated: false,
        isHighlighted: false,
        // Extended metadata
        detailedDescription: step.detailedDescription || standardInfo.detailedDescription,
        parameters: step.parameters,
        returnType: step.returnType || standardInfo.returnType,
        lineNumber: step.lineNumber,
        codeSnippet: step.codeSnippet,
        calls: calls.length > 0 ? calls : undefined,
        calledBy: parentId ? [nodes.find(n => n.id === parentId)?.data.function || ''] : undefined,
      },
    };

    nodes.push(node);

    // Create edge from parent
    if (parentId) {
      const edge: FlowEdge = {
        id: `edge-${parentId}-${currentNodeId}`,
        source: parentId,
        target: currentNodeId,
        type: 'smoothstep',
        animated: false,
        style: {
          strokeWidth: 2,
        },
      };

      edges.push(edge);
    }

    // Recurse for children
    step.children.forEach(child => {
      traverse(child, currentNodeId, depth + 1);
    });

    return currentNodeId;
  }

  // Process all root steps
  callPath.steps.forEach(step => traverse(step, null, 0));

  // Apply dagre layout
  const layoutedNodes = applyLayout(nodes, edges);

  return {
    nodes: layoutedNodes,
    edges,
  };
}

/**
 * Get color for node type
 */
export function getNodeColor(type: string): string {
  const colors: Record<string, string> = {
    syscall: 'rgb(59 130 246)',   // blue
    kernel: 'rgb(34 197 94)',     // green
    driver: 'rgb(168 85 247)',    // purple
    hardware: 'rgb(239 68 68)',   // red
    userspace: 'rgb(107 114 128)', // gray
  };

  return colors[type] || colors.kernel;
}

/**
 * Get gradient colors for node type
 */
export function getNodeGradient(type: string): { from: string; to: string } {
  const gradients: Record<string, { from: string; to: string }> = {
    syscall: { from: 'rgb(59 130 246)', to: 'rgb(37 99 235)' },
    kernel: { from: 'rgb(34 197 94)', to: 'rgb(22 163 74)' },
    driver: { from: 'rgb(168 85 247)', to: 'rgb(147 51 234)' },
    hardware: { from: 'rgb(239 68 68)', to: 'rgb(220 38 38)' },
    userspace: { from: 'rgb(107 114 128)', to: 'rgb(75 85 99)' },
  };

  return gradients[type] || gradients.kernel;
}
