// Types for React Flow call flow diagrams

import { Node, Edge } from 'reactflow';
import { StepType } from './subsystem';

export interface FlowNode extends Node {
  data: {
    label: string;
    function: string;
    file?: string;
    description?: string;
    type: StepType;
    isAnimated?: boolean;
    isHighlighted?: boolean;
    // Extended information for detailed view
    detailedDescription?: string;
    parameters?: string[];
    returnType?: string;
    calledBy?: string[];
    calls?: string[];
    lineNumber?: number;
    codeSnippet?: string;
  };
}

export interface FlowEdge extends Edge {
  data?: {
    label?: string;
    isAnimated?: boolean;
  };
  animated?: boolean;
}

export interface AnimationState {
  currentStep: number;
  totalSteps: number;
  isPlaying: boolean;
  speed: number;  // milliseconds per step
  highlightedNodes: Set<string>;
  highlightedEdges: Set<string>;
}

export interface AnimationStep {
  step: number;
  nodesToHighlight: string[];
  edgesToAnimate: string[];
  description: string;
}

export interface FlowGraphData {
  nodes: FlowNode[];
  edges: FlowEdge[];
  animationSequence: AnimationStep[];
}
