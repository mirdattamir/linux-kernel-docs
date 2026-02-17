// Test script to verify parser functionality

import { parseMarkdownFile } from '../lib/parsers/markdown-parser';
import path from 'path';

async function testParser() {
  console.log('Testing markdown parser...\n');

  // Test VFS documentation
  const vfsDocPath = path.join(__dirname, '../../VFS_SUBSYSTEM_DOCUMENTATION.md');

  try {
    console.log(`Parsing ${vfsDocPath}...`);
    const subsystem = await parseMarkdownFile(vfsDocPath, 'vfs');

    console.log('\n=== Parsed Results ===');
    console.log(`Name: ${subsystem.name}`);
    console.log(`Sections: ${subsystem.sections.length}`);
    console.log(`Call Paths: ${subsystem.callPaths.length}`);
    console.log(`Data Structures: ${subsystem.dataStructures.length}`);
    console.log(`Diagrams: ${subsystem.diagrams.length}`);
    console.log(`Core Files: ${subsystem.coreFiles.length}`);

    if (subsystem.callPaths.length > 0) {
      console.log('\n=== Call Paths ===');
      subsystem.callPaths.forEach((callPath: any, index: number) => {
        console.log(`\n${index + 1}. ${callPath.title}`);
        console.log(`   Steps: ${callPath.steps.length}`);
        console.log(`   Root functions: ${callPath.steps.map((s: any) => s.function).join(', ')}`);
      });
    }

    if (subsystem.dataStructures.length > 0) {
      console.log('\n=== Data Structures ===');
      subsystem.dataStructures.slice(0, 3).forEach((struct: any) => {
        console.log(`\n- ${struct.name}`);
        console.log(`  File: ${struct.file}`);
        console.log(`  Fields: ${struct.fields.length}`);
      });
    }

    console.log('\n✅ Parser test completed successfully!');
  } catch (error) {
    console.error('\n❌ Parser test failed:', error);
    process.exit(1);
  }
}

testParser();
