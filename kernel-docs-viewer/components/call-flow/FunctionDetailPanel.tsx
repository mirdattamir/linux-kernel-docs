'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, FileCode, GitBranch, ArrowRight, Code } from 'lucide-react';
import { FlowNode } from '@/types/call-flow';

interface FunctionDetailPanelProps {
  node: FlowNode | null;
  onClose: () => void;
}

export default function FunctionDetailPanel({ node, onClose }: FunctionDetailPanelProps) {
  if (!node) return null;

  const { data } = node;

  return (
    <AnimatePresence>
      {node && (
        <motion.div
          initial={{ x: 400, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 400, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed right-0 top-0 h-screen w-96 bg-white dark:bg-gray-800 shadow-2xl z-50 overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5" />
              <h2 className="text-lg font-bold">Function Details</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Function Name */}
            <div>
              <h3 className="text-2xl font-mono font-bold text-gray-900 dark:text-white mb-2">
                {data.function}
              </h3>
              {data.returnType && (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Returns: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">{data.returnType}</code>
                </div>
              )}
            </div>

            {/* File Reference */}
            {data.file && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  <FileCode className="w-4 h-4" />
                  <span>Source Location</span>
                </div>
                <code className="text-sm text-blue-600 dark:text-blue-400 font-mono">
                  {data.file}
                  {data.lineNumber && `:${data.lineNumber}`}
                </code>
              </div>
            )}

            {/* Description */}
            {(data.description || data.detailedDescription) && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Description</h4>
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                  {data.detailedDescription || data.description}
                </p>
              </div>
            )}

            {/* Parameters */}
            {data.parameters && data.parameters.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Parameters</h4>
                <ul className="space-y-2">
                  {data.parameters.map((param, idx) => (
                    <li key={idx} className="text-sm">
                      <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-800 dark:text-gray-200">
                        {param}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Called By */}
            {data.calledBy && data.calledBy.length > 0 && (
              <div>
                <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white mb-2">
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  <h4>Called By</h4>
                </div>
                <ul className="space-y-1">
                  {data.calledBy.map((caller, idx) => (
                    <li key={idx} className="text-sm">
                      <code className="bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded text-green-700 dark:text-green-400 font-mono text-xs">
                        {caller}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Calls */}
            {data.calls && data.calls.length > 0 && (
              <div>
                <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white mb-2">
                  <ArrowRight className="w-4 h-4" />
                  <h4>Calls</h4>
                </div>
                <ul className="space-y-1">
                  {data.calls.map((callee, idx) => (
                    <li key={idx} className="text-sm">
                      <code className="bg-purple-50 dark:bg-purple-900/20 px-2 py-1 rounded text-purple-700 dark:text-purple-400 font-mono text-xs">
                        {callee}
                      </code>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Code Snippet */}
            {data.codeSnippet && (
              <div>
                <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white mb-2">
                  <GitBranch className="w-4 h-4" />
                  <h4>Code Snippet</h4>
                </div>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs font-mono">
                  <code>{data.codeSnippet}</code>
                </pre>
              </div>
            )}

            {/* Node Type Badge */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {data.type.toUpperCase()} Layer
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
