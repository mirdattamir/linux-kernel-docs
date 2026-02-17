// Core types for Linux kernel subsystem documentation

export interface Subsystem {
  id: string;
  name: string;
  slug: string;  // URL-friendly name (e.g., 'vfs', 'storage')
  filePath: string;  // Path to markdown file
  sections: SubsystemSection[];
  callPaths: CallPath[];
  dataStructures: DataStructure[];
  diagrams: Diagram[];
  coreFiles: CoreFile[];
}

export interface SubsystemSection {
  id: string;
  number: string;  // e.g., "1️⃣", "2️⃣"
  title: string;
  content: string;
  subsections?: SubsystemSection[];
}

export interface CallPath {
  id: string;
  title: string;  // e.g., "Path 2: read() System Call"
  description: string;
  steps: CallPathStep[];
  sourceFile: string;
  subsystem: string;
}

export interface CallPathStep {
  id: string;
  function: string;  // e.g., "sys_read()"
  file?: string;  // e.g., "fs/read_write.c"
  description?: string;
  children: CallPathStep[];
  depth: number;
  type: StepType;
  // Extended metadata
  detailedDescription?: string;
  parameters?: string[];
  returnType?: string;
  lineNumber?: number;
  codeSnippet?: string;
}

export type StepType = 'syscall' | 'kernel' | 'driver' | 'hardware' | 'userspace';

export interface DataStructure {
  id: string;
  name: string;  // e.g., "struct inode"
  file: string;  // e.g., "include/linux/fs.h"
  purpose: string;
  fields: StructField[];
  codeBlock: string;  // Full struct definition
  lifetime?: string;
  locking?: string;
  referenceCount?: string;
  ownership?: string;
}

export interface StructField {
  name: string;
  type: string;
  description?: string;
}

export interface Diagram {
  id: string;
  title: string;
  ascii: string;  // ASCII art diagram
  type: 'architecture' | 'flow' | 'hierarchy';
}

export interface CoreFile {
  path: string;  // e.g., "fs/namei.c"
  purpose: string;
}
