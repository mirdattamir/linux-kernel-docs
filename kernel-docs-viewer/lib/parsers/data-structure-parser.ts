// Parse C struct definitions from markdown

import { DataStructure, StructField } from '@/types/subsystem';

/**
 * Extract data structures from markdown section
 */
export function extractDataStructures(text: string): DataStructure[] {
  const structures: DataStructure[] = [];

  // Split by ### headers (struct definitions)
  const structSections = text.split(/###\s+struct\s+/i);

  for (let i = 1; i < structSections.length; i++) {
    const section = structSections[i];

    // Extract struct name from first line
    const nameMatch = section.match(/^([^\s(]+)/);
    if (!nameMatch) continue;

    const name = `struct ${nameMatch[1]}`;

    // Extract file path
    const fileMatch = section.match(/\(([^)]+\.h)\)/);
    const file = fileMatch ? fileMatch[1] : 'unknown';

    // Extract purpose
    const purposeMatch = section.match(/\*\*Purpose\*\*:\s*(.+?)(?:\n|$)/);
    const purpose = purposeMatch ? purposeMatch[1].trim() : '';

    // Extract code block
    const codeBlockMatch = section.match(/```c\n([\s\S]+?)\n```/);
    const codeBlock = codeBlockMatch ? codeBlockMatch[1] : '';

    // Parse fields from code block
    const fields = parseStructFields(codeBlock);

    // Extract lifetime info
    const lifetimeMatch = section.match(/\*\*Lifetime\*\*:\s*(.+?)(?:\n|$)/);
    const lifetime = lifetimeMatch ? lifetimeMatch[1].trim() : undefined;

    // Extract locking info
    const lockingMatch = section.match(/\*\*Locking\*\*:\s*(.+?)(?:\n|$)/);
    const locking = lockingMatch ? lockingMatch[1].trim() : undefined;

    // Extract reference counting info
    const refCountMatch = section.match(/\*\*Reference Counting\*\*:\s*(.+?)(?:\n|$)/);
    const referenceCount = refCountMatch ? refCountMatch[1].trim() : undefined;

    // Extract ownership info
    const ownershipMatch = section.match(/\*\*Ownership\*\*:\s*(.+?)(?:\n|$)/);
    const ownership = ownershipMatch ? ownershipMatch[1].trim() : undefined;

    structures.push({
      id: `struct-${name.replace(/\s+/g, '-')}`,
      name,
      file,
      purpose,
      fields,
      codeBlock,
      lifetime,
      locking,
      referenceCount,
      ownership,
    });
  }

  return structures;
}

/**
 * Parse struct fields from C code block
 */
export function parseStructFields(codeBlock: string): StructField[] {
  const fields: StructField[] = [];

  // Remove struct wrapper and split by lines
  const lines = codeBlock.split('\n');

  for (const line of lines) {
    // Skip empty lines, opening/closing braces, and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed === '};') continue;
    if (trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;

    // Match field pattern: type name; // optional comment
    const fieldMatch = trimmed.match(/^(.+?)\s+(\w+)(?:\[.*?\])?\s*;(?:\s*\/\/\s*(.+))?/);
    if (!fieldMatch) continue;

    const type = fieldMatch[1].trim();
    const name = fieldMatch[2];
    const description = fieldMatch[3] ? fieldMatch[3].trim() : undefined;

    fields.push({
      name,
      type,
      description,
    });
  }

  return fields;
}
