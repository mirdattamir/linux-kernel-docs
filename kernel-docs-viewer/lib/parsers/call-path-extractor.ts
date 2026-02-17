// Extract call paths from markdown documentation

import { CallPath, CallPathStep, StepType } from '@/types/subsystem';

/**
 * Extract all call paths from a "Call Path Tracing" section
 *
 * Example input:
 * ```
 * ### Path 1: open() System Call
 * ```
 * User Space:  fd = open("/home/user/file.txt", O_RDONLY);
 *               ↓
 * System Call: sys_openat() [fs/open.c]
 *               ↓
 * do_sys_openat() [fs/open.c]
 *               ↓
 * do_filp_open() [fs/namei.c]
 * ```
 * ```
 */
export function extractCallPaths(text: string, subsystem: string): CallPath[] {
  const callPaths: CallPath[] = [];

  // Split by "### Path" headers
  const pathSections = text.split(/###\s+Path\s+\d+:/);

  for (let i = 1; i < pathSections.length; i++) {
    const section = pathSections[i];

    // Extract title (first line)
    const titleMatch = section.match(/^(.+?)(?:\n|$)/);
    const title = titleMatch ? titleMatch[1].trim() : `Path ${i}`;

    // Extract code block with call path
    const codeBlockMatch = section.match(/```(?:typescript|javascript|plaintext|)?\n([\s\S]+?)\n```/);
    if (!codeBlockMatch) continue;

    const callPathText = codeBlockMatch[1];
    const steps = parseCallPathTree(callPathText);

    if (steps.length > 0) {
      callPaths.push({
        id: `${subsystem}-path-${i}`,
        title: `Path ${i}: ${title}`,
        description: '',
        steps,
        sourceFile: '',
        subsystem,
      });
    }
  }

  return callPaths;
}

/**
 * Parse a call path tree from indented text
 *
 * Handles:
 * - Function calls: sys_read()
 * - File paths: [fs/read_write.c]
 * - Arrows: ↓, →, └→, ├→
 * - Indentation levels
 */
export function parseCallPathTree(text: string): CallPathStep[] {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  const root: CallPathStep[] = [];
  const stack: { step: CallPathStep; indent: number }[] = [];

  for (const line of lines) {
    // Skip lines that are just arrows or comments
    if (/^[\s↓→├└─]+$/.test(line)) continue;
    if (line.trim().startsWith('//')) continue;

    // Calculate indentation level
    const indent = getIndentLevel(line);

    // Extract function name
    const functionMatch = line.match(/(\w+)\s*\([^)]*\)/);
    if (!functionMatch) continue;

    const functionName = functionMatch[1] + '()';

    // Extract file path
    const fileMatch = line.match(/\[([^\]]+)\]/);
    const file = fileMatch ? fileMatch[1] : undefined;

    // Extract description (text after // or in parentheses)
    const descMatch = line.match(/\/\/\s*(.+)$/) || line.match(/\((.*?)\)/);
    const description = descMatch ? descMatch[1] : undefined;

    // Classify step type
    const type = classifyStepType(functionName, file);

    const step: CallPathStep = {
      id: `step-${functionName}-${Math.random().toString(36).substr(2, 9)}`,
      function: functionName,
      file,
      description,
      children: [],
      depth: indent,
      type,
    };

    // Add to tree structure
    if (indent === 0) {
      // Top-level step
      root.push(step);
      stack.length = 0;
      stack.push({ step, indent });
    } else {
      // Find parent at lower indent level
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      if (stack.length > 0) {
        const parent = stack[stack.length - 1].step;
        parent.children.push(step);
      } else {
        // Fallback: add to root if no parent found
        root.push(step);
      }

      stack.push({ step, indent });
    }
  }

  return root;
}

/**
 * Calculate indentation level from line
 */
function getIndentLevel(line: string): number {
  // Remove arrow symbols for indent calculation
  const cleanLine = line.replace(/[↓→├└─]/g, ' ');
  const match = cleanLine.match(/^(\s+)/);
  if (!match) return 0;

  const spaces = match[1].length;
  // Every 2 spaces = 1 indent level
  return Math.floor(spaces / 2);
}

/**
 * Classify the type of step based on function name and file path
 */
export function classifyStepType(functionName: string, file?: string): StepType {
  // System calls start with sys_
  if (functionName.startsWith('sys_')) {
    return 'syscall';
  }

  // Driver paths
  if (file && (
    file.includes('drivers/') ||
    file.includes('nvme/') ||
    file.includes('scsi/')
  )) {
    return 'driver';
  }

  // Hardware interaction
  if (
    functionName.toLowerCase().includes('hardware') ||
    functionName.toLowerCase().includes('device') ||
    functionName.toLowerCase().includes('irq') ||
    functionName.toLowerCase().includes('dma')
  ) {
    return 'hardware';
  }

  // User space
  if (file && file.toLowerCase().includes('user')) {
    return 'userspace';
  }

  // Default: kernel function
  return 'kernel';
}

/**
 * Helper to convert parsed call paths to a flat list (for debugging)
 */
export function flattenCallPath(steps: CallPathStep[]): string[] {
  const result: string[] = [];

  function traverse(step: CallPathStep, indent: number = 0) {
    result.push('  '.repeat(indent) + step.function);
    step.children.forEach(child => traverse(child, indent + 1));
  }

  steps.forEach(step => traverse(step));
  return result;
}

/**
 * Extract additional metadata about a function from surrounding context
 * This provides rich information for the detail panel
 */
export function extractFunctionMetadata(functionName: string, context: string): {
  detailedDescription?: string;
  parameters?: string[];
  returnType?: string;
  lineNumber?: number;
  codeSnippet?: string;
} {
  const metadata: ReturnType<typeof extractFunctionMetadata> = {};

  // Try to extract detailed description
  // Look for function name followed by description
  const descPattern = new RegExp(`${functionName.replace('()', '')}[^:]*:\\s*([^\\n]+)`, 'i');
  const descMatch = context.match(descPattern);
  if (descMatch) {
    metadata.detailedDescription = descMatch[1].trim();
  }

  // Try to extract parameters from function signature
  const paramPattern = new RegExp(`${functionName.replace('()', '')}\\(([^)]*)\\)`, 'i');
  const paramMatch = context.match(paramPattern);
  if (paramMatch && paramMatch[1].trim()) {
    metadata.parameters = paramMatch[1].split(',').map(p => p.trim());
  }

  // Try to extract line number
  const linePattern = /:\s*(\d+)/;
  const lineMatch = context.match(linePattern);
  if (lineMatch) {
    metadata.lineNumber = parseInt(lineMatch[1], 10);
  }

  return metadata;
}

/**
 * Enhanced function to add standard kernel function descriptions
 * This provides default descriptions for common kernel functions
 */
export function getStandardFunctionInfo(functionName: string): {
  description?: string;
  detailedDescription?: string;
  returnType?: string;
} {
  const funcName = functionName.replace('()', '');

  const standardFunctions: Record<string, { description: string; detailedDescription: string; returnType: string }> = {
    'sys_read': {
      description: 'System call for reading from file descriptor',
      detailedDescription: 'Entry point for the read() system call. Reads data from a file descriptor into a user-space buffer. Validates parameters and transitions from user to kernel space.',
      returnType: 'ssize_t'
    },
    'sys_write': {
      description: 'System call for writing to file descriptor',
      detailedDescription: 'Entry point for the write() system call. Writes data from a user-space buffer to a file descriptor. Handles permission checks and data transfer.',
      returnType: 'ssize_t'
    },
    'sys_open': {
      description: 'System call for opening files',
      detailedDescription: 'Opens a file and returns a file descriptor. Performs path resolution, permission checks, and creates file structure in kernel.',
      returnType: 'int'
    },
    'sys_openat': {
      description: 'System call for opening files relative to directory FD',
      detailedDescription: 'Opens a file relative to a directory file descriptor. Provides better security and supports relative path resolution.',
      returnType: 'int'
    },
    'do_sys_openat': {
      description: 'Core implementation of openat syscall',
      detailedDescription: 'Internal kernel function that implements the core logic for openat(). Handles path resolution, file structure allocation, and permission validation.',
      returnType: 'long'
    },
    'vfs_read': {
      description: 'VFS layer read operation',
      detailedDescription: 'Virtual File System layer function that dispatches read operations to filesystem-specific implementations. Manages page cache and buffer management.',
      returnType: 'ssize_t'
    },
    'vfs_write': {
      description: 'VFS layer write operation',
      detailedDescription: 'Virtual File System layer function that dispatches write operations to filesystem-specific implementations. Handles dirty page tracking and writeback.',
      returnType: 'ssize_t'
    },
    'do_filp_open': {
      description: 'Open file and return struct file pointer',
      detailedDescription: 'Performs pathname lookup and creates a struct file object. Central function for file opening logic in the kernel.',
      returnType: 'struct file *'
    },
    'submit_bio': {
      description: 'Submit block I/O request',
      detailedDescription: 'Submits a bio (block I/O) structure to the block layer. This is the entry point for all block device I/O operations from filesystems.',
      returnType: 'void'
    },
    'blk_mq_submit_bio': {
      description: 'Submit bio to multi-queue block layer',
      detailedDescription: 'Handles bio submission in the multi-queue block layer (blk-mq). Routes I/O to appropriate hardware queue for parallel processing.',
      returnType: 'void'
    }
  };

  return standardFunctions[funcName] || {};
}
