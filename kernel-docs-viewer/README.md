# Linux Kernel Documentation Viewer

Interactive visualization of Linux kernel subsystems with **animated call flow diagrams**.

## Features

- 🎬 **Animated Call Flow Diagrams** - Step-by-step visualization of kernel function calls
- 📊 **Interactive Node Graphs** - Built with React Flow for smooth navigation
- ⚡ **Fast Performance** - Static site generation for instant page loads
- 🎨 **Beautiful UI** - Modern design with Tailwind CSS and Framer Motion animations
- 📱 **Responsive** - Works on desktop, tablet, and mobile devices

## Tech Stack

- **Next.js 14** with App Router
- **React Flow** for interactive diagrams
- **Framer Motion** for smooth animations
- **Dagre** for automatic graph layout
- **TypeScript** for type safety
- **Tailwind CSS** for styling

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Linux kernel documentation files in parent directory:
  - `VFS_SUBSYSTEM_DOCUMENTATION.md`
  - `STORAGE_SUBSYSTEM_DOCUMENTATION.md`

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
kernel-docs-viewer/
├── app/                    # Next.js App Router pages
│   ├── page.tsx            # Homepage with subsystem list
│   ├── subsystems/[slug]/  # Subsystem detail pages
│   └── call-flow/          # Full-screen call flow viewer
├── components/
│   ├── call-flow/          # Call flow diagram components
│   ├── subsystem/          # Subsystem display components
│   └── layout/             # Layout components
├── lib/
│   ├── parsers/            # Markdown parsers
│   ├── flow/               # React Flow builders
│   ├── data/               # Data loaders
│   └── utils/              # Utilities
├── types/                  # TypeScript type definitions
└── styles/                 # Global styles
```

## How It Works

### 1. Parsing
The application parses markdown documentation files to extract:
- Call paths with hierarchical function calls
- Data structure definitions
- ASCII architecture diagrams
- Core file listings

### 2. Graph Building
Call paths are converted to React Flow nodes and edges:
- Each function becomes a node
- Parent-child relationships become edges
- Dagre algorithm applies hierarchical layout

### 3. Animation
Breadth-first traversal creates animation sequence:
- Each step highlights specific nodes
- Edges animate to show data flow
- Framer Motion provides smooth transitions

## Adding New Subsystems

1. Create a markdown file following the naming convention:
   ```
   <NAME>_SUBSYSTEM_DOCUMENTATION.md
   ```

2. Use the standard format with emoji-numbered sections:
   ```markdown
   ## 5️⃣ Call Path Tracing

   ### Path 1: open() System Call
   ```
   User Space:  fd = open("/path/to/file", O_RDONLY);
                 ↓
   System Call: sys_openat() [fs/open.c]
                 ↓
   do_sys_openat() [fs/open.c]
   ```
   ```

3. Rebuild the application to regenerate static pages

## Development

### Testing the Parser

```bash
npx ts-node scripts/test-parser.ts
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

## Architecture

### Parser Flow
```
Markdown File
    ↓
markdown-parser.ts (read & section extraction)
    ↓
call-path-extractor.ts (parse call hierarchies)
    ↓
CallPath objects with CallPathStep trees
```

### Visualization Flow
```
CallPath
    ↓
flow-builder.ts (convert to nodes/edges)
    ↓
layout-engine.ts (dagre layout)
    ↓
animation-sequencer.ts (BFS traversal)
    ↓
CallFlowDiagram component (React Flow + Framer Motion)
```

## Performance

- **Build Time**: ~10-30 seconds
- **Page Load**: <100ms (static HTML)
- **Animation FPS**: 60fps (hardware-accelerated)
- **Bundle Size**: ~500KB (gzipped)

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

ISC

## Credits

Built with:
- [Next.js](https://nextjs.org/)
- [React Flow](https://reactflow.dev/)
- [Framer Motion](https://www.framer.com/motion/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Dagre](https://github.com/dagrejs/dagre)
