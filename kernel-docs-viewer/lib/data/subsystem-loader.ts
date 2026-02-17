// Load and cache subsystem data

import path from 'path';
import { Subsystem } from '@/types/subsystem';
import { parseMarkdownFile, getAvailableSubsystems } from '../parsers/markdown-parser';

// In-memory cache for parsed subsystems
const cache = new Map<string, Subsystem>();

/**
 * Get the docs directory path (parent directory of the Next.js project)
 */
export function getDocsDir(): string {
  return path.join(process.cwd(), '..');
}

/**
 * Load a subsystem by slug
 */
export async function loadSubsystem(slug: string): Promise<Subsystem | null> {
  // Check cache first
  if (cache.has(slug)) {
    return cache.get(slug)!;
  }

  try {
    const docsDir = getDocsDir();
    const availableSubsystems = await getAvailableSubsystems(docsDir);

    const subsystemInfo = availableSubsystems.find(s => s.slug === slug);
    if (!subsystemInfo) {
      console.error(`Subsystem not found: ${slug}`);
      return null;
    }

    const subsystem = await parseMarkdownFile(subsystemInfo.filePath, slug);

    // Cache the result
    cache.set(slug, subsystem);

    return subsystem;
  } catch (error) {
    console.error(`Error loading subsystem ${slug}:`, error);
    return null;
  }
}

/**
 * Load all available subsystems
 */
export async function loadAllSubsystems(): Promise<Subsystem[]> {
  try {
    const docsDir = getDocsDir();
    const availableSubsystems = await getAvailableSubsystems(docsDir);

    const subsystems = await Promise.all(
      availableSubsystems.map(async ({ slug, filePath }) => {
        if (cache.has(slug)) {
          return cache.get(slug)!;
        }

        const subsystem = await parseMarkdownFile(filePath, slug);
        cache.set(slug, subsystem);
        return subsystem;
      })
    );

    return subsystems;
  } catch (error) {
    console.error('Error loading subsystems:', error);
    return [];
  }
}

/**
 * Get list of all subsystem slugs
 */
export async function getSubsystemSlugs(): Promise<string[]> {
  const docsDir = getDocsDir();
  const availableSubsystems = await getAvailableSubsystems(docsDir);
  return availableSubsystems.map(s => s.slug);
}

/**
 * Clear the cache
 */
export function clearCache(): void {
  cache.clear();
}
