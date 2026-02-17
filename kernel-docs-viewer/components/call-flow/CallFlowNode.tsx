'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { FlowNode } from '@/types/call-flow';
import { Info } from 'lucide-react';

function CallFlowNode({ data, id, selected }: NodeProps<FlowNode['data']>) {
  const nodeColors = {
    syscall: 'from-blue-500 to-blue-600',
    kernel: 'from-green-500 to-green-600',
    driver: 'from-purple-500 to-purple-600',
    hardware: 'from-red-500 to-red-600',
    userspace: 'from-gray-500 to-gray-600',
  };

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-gray-400"
      />

      <motion.div
        className={cn(
          'px-4 py-3 rounded-lg shadow-lg border-2 min-w-[180px] cursor-pointer',
          'bg-gradient-to-br transition-all',
          nodeColors[data.type],
          'call-flow-node hover:shadow-xl',
          selected && 'ring-4 ring-blue-400 ring-opacity-60'
        )}
        animate={{
          scale: data.isHighlighted ? 1.1 : selected ? 1.05 : 1,
          borderColor: data.isHighlighted ? '#fbbf24' : selected ? '#3b82f6' : 'transparent',
          boxShadow: data.isHighlighted
            ? '0 0 30px rgba(251, 191, 36, 0.6)'
            : selected
            ? '0 0 20px rgba(59, 130, 246, 0.5)'
            : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
        }}
        transition={{
          duration: 0.3,
          ease: 'easeInOut',
        }}
        whileHover={{
          scale: data.isHighlighted ? 1.1 : 1.03,
        }}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-sm font-bold text-white">
              {data.function}
            </div>
            <Info className="w-4 h-4 text-white/60" />
          </div>
          {data.file && (
            <div className="text-xs text-white/80 font-mono">
              {data.file}
            </div>
          )}
          {data.description && (
            <div className="text-xs text-white/70 mt-1">
              {data.description}
            </div>
          )}
        </div>
      </motion.div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-gray-400"
      />
    </>
  );
}

export default memo(CallFlowNode);
