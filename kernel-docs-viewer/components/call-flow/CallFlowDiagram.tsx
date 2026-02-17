'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  NodeMouseHandler,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { CallPath } from '@/types/subsystem';
import { AnimationState, FlowNode } from '@/types/call-flow';
import { buildFlowGraph } from '@/lib/flow/flow-builder';
import { buildAnimationSequence } from '@/lib/flow/animation-sequencer';
import CallFlowNode from './CallFlowNode';
import AnimationControls from './AnimationControls';
import FunctionDetailPanel from './FunctionDetailPanel';

const nodeTypes = {
  custom: CallFlowNode,
};

interface CallFlowDiagramProps {
  callPath: CallPath;
}

function CallFlowDiagramInner({ callPath }: CallFlowDiagramProps) {
  const [animationState, setAnimationState] = useState<AnimationState>({
    currentStep: 0,
    totalSteps: 0,
    isPlaying: false,
    speed: 1000,
    highlightedNodes: new Set(),
    highlightedEdges: new Set(),
  });

  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);

  // Build flow graph from call path
  const { nodes: baseNodes, edges: baseEdges } = useMemo(
    () => buildFlowGraph(callPath),
    [callPath]
  );

  // Build animation sequence
  const animationSequence = useMemo(
    () => buildAnimationSequence(baseNodes, baseEdges),
    [baseNodes, baseEdges]
  );

  // Update total steps
  useEffect(() => {
    setAnimationState(prev => ({
      ...prev,
      totalSteps: animationSequence.length,
    }));
  }, [animationSequence]);

  // Apply animation state to nodes
  const nodes = useMemo(() => {
    return baseNodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isHighlighted: animationState.highlightedNodes.has(node.id),
        isAnimated: animationState.isPlaying,
      },
    }));
  }, [baseNodes, animationState.highlightedNodes, animationState.isPlaying]);

  // Apply animation state to edges
  const edges = useMemo(() => {
    return baseEdges.map(edge => ({
      ...edge,
      animated: animationState.highlightedEdges.has(edge.id),
    }));
  }, [baseEdges, animationState.highlightedEdges]);

  // Animation loop
  useEffect(() => {
    if (!animationState.isPlaying) return;

    const interval = setInterval(() => {
      setAnimationState(prev => {
        if (prev.currentStep >= animationSequence.length - 1) {
          return { ...prev, isPlaying: false, currentStep: 0 };
        }

        const nextStep = animationSequence[prev.currentStep + 1];
        return {
          ...prev,
          currentStep: prev.currentStep + 1,
          highlightedNodes: new Set(nextStep.nodesToHighlight),
          highlightedEdges: new Set(nextStep.edgesToAnimate),
        };
      });
    }, animationState.speed);

    return () => clearInterval(interval);
  }, [animationState.isPlaying, animationState.speed, animationSequence]);

  // Handlers
  const handlePlay = useCallback(() => {
    setAnimationState(prev => ({ ...prev, isPlaying: true }));
  }, []);

  const handlePause = useCallback(() => {
    setAnimationState(prev => ({ ...prev, isPlaying: false }));
  }, []);

  const handleStep = useCallback(
    (direction: number) => {
      const newStep = animationState.currentStep + direction;
      if (newStep >= 0 && newStep < animationSequence.length) {
        const stepData = animationSequence[newStep];
        setAnimationState(prev => ({
          ...prev,
          currentStep: newStep,
          highlightedNodes: new Set(stepData.nodesToHighlight),
          highlightedEdges: new Set(stepData.edgesToAnimate),
          isPlaying: false,
        }));
      }
    },
    [animationState.currentStep, animationSequence]
  );

  const handleSpeedChange = useCallback((speed: number) => {
    setAnimationState(prev => ({ ...prev, speed }));
  }, []);

  const handleNodeClick: NodeMouseHandler = useCallback((event, node) => {
    setSelectedNode(node as FlowNode);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div className="relative w-full h-screen bg-gray-50 dark:bg-gray-900">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-right"
        className="bg-gray-50 dark:bg-gray-900"
        onNodeClick={handleNodeClick}
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const type = (node.data as any).type;
            const colors: Record<string, string> = {
              syscall: '#3b82f6',
              kernel: '#22c55e',
              driver: '#a855f7',
              hardware: '#ef4444',
              userspace: '#6b7280',
            };
            return colors[type] || colors.kernel;
          }}
        />
      </ReactFlow>

      <AnimationControls
        animationState={animationState}
        onPlay={handlePlay}
        onPause={handlePause}
        onStep={handleStep}
        onSpeedChange={handleSpeedChange}
      />

      {/* Call path title */}
      <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 z-10 max-w-md">
        <h2 className="text-xl font-bold">{callPath.title}</h2>
        {callPath.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {callPath.description}
          </p>
        )}
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1">
          <span className="inline-block w-2 h-2 bg-blue-600 rounded-full animate-pulse"></span>
          Click any node to see details
        </p>
      </div>

      {/* Function Detail Panel */}
      <FunctionDetailPanel node={selectedNode} onClose={handleClosePanel} />
    </div>
  );
}

export default function CallFlowDiagram({ callPath }: CallFlowDiagramProps) {
  return (
    <ReactFlowProvider>
      <CallFlowDiagramInner callPath={callPath} />
    </ReactFlowProvider>
  );
}
