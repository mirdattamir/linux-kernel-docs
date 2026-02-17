// Main markdown parser for subsystem documentation

import { promises as fs } from 'fs';
import path from 'path';
import { Subsystem, SubsystemSection, Diagram, CoreFile } from '@/types/subsystem';
import { extractCallPaths } from './call-path-extractor';
import { extractDataStructures } from './data-structure-parser';

/**
 * Parse a markdown file and extract all subsystem information
 */
export async function parseMarkdownFile(filePath: string, slug: string): Promise<Subsystem> {
  const content = await fs.readFile(filePath, 'utf-8');

  // Extract title from first heading
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const name = titleMatch ? titleMatch[1].replace('Linux ', '').replace(' Subsystem', '') : slug.toUpperCase();

  // Extract sections (identified by emoji numbering)
  const sections = extractSections(content);

  // Find "Call Path Tracing" section (section 5)
  const callPathSection = sections.find(s => s.title.includes('Call Path Tracing'));
  const callPaths = callPathSection ? extractCallPaths(callPathSection.content, slug) : [];

  // Find "Core Data Structures" section (section 4)
  const dataStructureSection = sections.find(s => s.title.includes('Core Data Structures'));
  const dataStructures = dataStructureSection ? extractDataStructures(dataStructureSection.content) : [];

  // Find "Directory Mapping" section (section 2)
  const directorySection = sections.find(s => s.title.includes('Directory Mapping'));
  const coreFiles = directorySection ? extractCoreFiles(directorySection.content) : [];

  // Extract ASCII diagrams
  const diagrams = extractDiagrams(content);

  return {
    id: slug,
    name,
    slug,
    filePath,
    sections,
    callPaths,
    dataStructures,
    diagrams,
    coreFiles,
  };
}

/**
 * Extract sections from markdown (identified by emoji numbering)
 */
export function extractSections(content: string): SubsystemSection[] {
  const sections: SubsystemSection[] = [];

  // Match sections with emoji numbering (1️⃣, 2️⃣, etc.)
  const sectionRegex = /##\s+([\d️⃣]+)\s+(.+?)(?=\n##\s+[\d️⃣]+|\n#\s+|$)/gs;
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    const number = match[1];
    const title = match[2].trim();
    const sectionContent = match[0];

    sections.push({
      id: `section-${number}`,
      number,
      title,
      content: sectionContent,
    });
  }

  return sections;
}

/**
 * Extract core files from Directory Mapping section
 */
function extractCoreFiles(content: string): CoreFile[] {
  const files: CoreFile[] = [];

  // Look for file → purpose pattern in markdown tables or lists
  const tableRegex = /\|\s*`?([^|`\n]+\.(c|h))`?\s*\|\s*([^|\n]+)\s*\|/g;
  let match;

  while ((match = tableRegex.exec(content)) !== null) {
    files.push({
      path: match[1].trim(),
      purpose: match[3].trim(),
    });
  }

  return files;
}

/**
 * Extract ASCII diagrams from markdown
 */
function extractDiagrams(content: string): Diagram[] {
  const diagrams: Diagram[] = [];

  // Find sections with "ASCII" in the title or large code blocks that look like diagrams
  const diagramSections = content.match(/```[\s\S]*?[┌┐└┘│─├┤┬┴┼╔╗╚╝║═╠╣╦╩╬]/g);

  if (diagramSections) {
    diagramSections.forEach((section, index) => {
      // Remove code block markers
      const ascii = section.replace(/```[a-z]*\n?/g, '').replace(/```$/,'').trim();

      diagrams.push({
        id: `diagram-${index + 1}`,
        title: `Architecture Diagram ${index + 1}`,
        ascii,
        type: 'architecture',
      });
    });
  }

  return diagrams;
}

/**
 * Get list of available subsystems from docs directory
 */
export async function getAvailableSubsystems(docsDir: string): Promise<{ slug: string; filePath: string }[]> {
  const subsystems: { slug: string; filePath: string }[] = [];

  try {
    const files = await fs.readdir(docsDir);

    for (const file of files) {
      if (file.endsWith('_DOCUMENTATION.md')) {
        // Extract slug from filename (e.g., VFS_SUBSYSTEM_DOCUMENTATION.md → vfs)
        const slug = file
          .replace('_SUBSYSTEM_DOCUMENTATION.md', '')
          .replace('_DOCUMENTATION.md', '')
          .toLowerCase();

        subsystems.push({
          slug,
          filePath: path.join(docsDir, file),
        });
      }
    }
  } catch (error) {
    console.error('Error reading docs directory:', error);
  }

  return subsystems;
}
