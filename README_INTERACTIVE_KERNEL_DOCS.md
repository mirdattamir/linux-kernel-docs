# Interactive Linux Kernel Documentation Viewer

**A modern, interactive web application for exploring Linux kernel architecture with clickable call flow diagrams.**

---

## 🚀 Quick Start

### Access the Application

**Web URL**: http://136.243.110.13:3001

### Features

- 🎬 **Animated Call Flow Diagrams** - Watch kernel execution paths step-by-step
- 🖱️ **Click Any Function** - See detailed information in slide-in panel
- 📊 **Interactive Nodes** - Color-coded by layer (syscall/kernel/driver/hardware)
- ⚡ **Fast & Responsive** - Built with Next.js and React Flow
- 📚 **Comprehensive** - Covers VFS, Storage, and more subsystems

---

## 📖 Documentation

### For Users
- **Browse**: Visit http://136.243.110.13:3001
- **Explore**: Click on any subsystem (VFS, Storage)
- **View Call Flows**: Click "View call flow" on any operation
- **Click Nodes**: Click any function to see details

### For Documentation Authors
1. **Template**: Use `SUBSYSTEM_DOCUMENTATION_TEMPLATE.md`
2. **Methodology**: Read `INTERACTIVE_DOCUMENTATION_METHODOLOGY.md`
3. **Examples**: See `VFS_SUBSYSTEM_DOCUMENTATION.md` and `STORAGE_SUBSYSTEM_DOCUMENTATION.md`

---

## 📁 Project Structure

```
Linux/
├── kernel-docs-viewer/          # Next.js application
│   ├── app/                     # Pages and routes
│   ├── components/              # React components
│   │   └── call-flow/           # Interactive diagram components
│   ├── lib/                     # Parsers and data processors
│   └── types/                   # TypeScript definitions
│
├── Documentation Files/
│   ├── VFS_SUBSYSTEM_DOCUMENTATION.md
│   ├── STORAGE_SUBSYSTEM_DOCUMENTATION.md
│   └── linux_kernel_complete_architecture.md
│
├── Templates & Guides/
│   ├── SUBSYSTEM_DOCUMENTATION_TEMPLATE.md
│   ├── INTERACTIVE_DOCUMENTATION_METHODOLOGY.md
│   ├── IMPLEMENTATION_SUMMARY.md
│   └── SESSION_LOG_2026-02-16.md
│
└── linux-6.10/linux-6 (2).19/   # Linux kernel source
```

---

## 🎯 Key Features

### 1. Interactive Call Flow Diagrams

Visual, node-based graphs showing how kernel functions call each other:

```
sys_read() [blue]
    ↓
vfs_read() [green]
    ↓
file->f_op->read_iter() [green]
    ↓
submit_bio() [green]
    ↓
blk_mq_submit_bio() [purple]
```

Each node is clickable!

### 2. Function Detail Panel

Click any node to see:
- **Source Location**: `fs/read_write.c:123`
- **Description**: Detailed explanation
- **Parameters**: Function signature
- **Return Type**: What it returns
- **Call Hierarchy**: What calls it, what it calls
- **Layer Type**: syscall/kernel/driver/hardware

### 3. Animation Controls

- ▶️ Play: Auto-advance through call path
- ⏸️ Pause: Stop animation
- ⏭️ Step Forward: Next function
- ⏮️ Step Backward: Previous function
- 🎚️ Speed Control: Adjust animation speed

---

## 🛠️ Development

### Start Development Server

```bash
cd kernel-docs-viewer
npm run dev
```

Server starts on http://localhost:3001

### Build for Production

```bash
npm run build
npm start
```

### Project Dependencies

- Next.js 14 (App Router)
- React Flow 11
- Framer Motion 11
- TypeScript 5
- Tailwind CSS 3
- Dagre (auto-layout)

---

## 📝 Creating Documentation

### Step 1: Copy Template

```bash
cp SUBSYSTEM_DOCUMENTATION_TEMPLATE.md NETWORKING_SUBSYSTEM_DOCUMENTATION.md
```

### Step 2: Fill Sections

Use emoji-numbered sections:
- 1️⃣ High-Level Purpose
- 2️⃣ Directory Mapping
- 3️⃣ Core Source Files
- 4️⃣ Core Data Structures
- 5️⃣ Call Path Tracing ⭐ **Critical**
- 6️⃣ Concurrency Model
- 7️⃣ Memory Model
- 8️⃣ Hardware Interaction
- 9️⃣ Performance Considerations
- 🔟 Error Handling

### Step 3: Write Call Paths

```markdown
### Path 1: read() System Call

```
System Call: sys_read() [fs/read_write.c:123]  // Entry point
              ↓
vfs_read() [fs/read_write.c:456]  // VFS dispatch
              ↓
...
```

**Detailed Function Information**:

#### `sys_read()`
- **File**: `fs/read_write.c:123`
- **Purpose**: Entry point for read() syscall
- **Parameters**:
  - `unsigned int fd`
  - `char __user *buf`
  - `size_t count`
- **Return**: `ssize_t` - bytes read
- **Description**: Validates fd and dispatches to VFS...
```

### Step 4: Rebuild

```bash
cd kernel-docs-viewer
npm run build
```

Your subsystem automatically appears with full interactivity!

---

## 🎨 Color Coding

Nodes are color-coded by kernel layer:

- **🔵 Blue**: System calls (`sys_*`)
- **🟢 Green**: Kernel functions (VFS, block layer)
- **🟣 Purple**: Device drivers
- **🔴 Red**: Hardware interaction
- **⚫ Gray**: Userspace

---

## 📚 Documented Subsystems

### Current Coverage

1. **VFS (Virtual File System)** ✅
   - File operations (open, read, write, close)
   - Path resolution
   - Inode and dentry management

2. **Storage Subsystem** ✅
   - Block layer (blk-mq)
   - I/O scheduling
   - NVMe, SCSI, ATA drivers

3. **Complete Architecture** ✅
   - All 12 kernel layers
   - Hardware to userspace

### Planned

- [ ] Networking Stack
- [ ] Memory Management
- [ ] Process Scheduler
- [ ] Interrupt Handling
- [ ] Locking Mechanisms

---

## 🔧 Extending the System

### Add Standard Function Descriptions

Edit `kernel-docs-viewer/lib/parsers/call-path-extractor.ts`:

```typescript
const standardFunctions = {
  'your_function': {
    description: 'Brief description',
    detailedDescription: 'Comprehensive explanation...',
    returnType: 'int'
  },
};
```

### Add New Node Types

Edit `types/subsystem.ts`:

```typescript
export type StepType = 'syscall' | 'kernel' | 'driver' | 'hardware' | 'userspace' | 'new_type';
```

Update colors in `components/call-flow/CallFlowNode.tsx`

---

## 🐛 Troubleshooting

### Server Won't Start

```bash
cd kernel-docs-viewer
rm -rf .next
npm run dev
```

### Call Paths Not Showing

1. Check file name ends with `_SUBSYSTEM_DOCUMENTATION.md`
2. Verify section header: `## 5️⃣ Call Path Tracing`
3. Ensure call paths are in code blocks with backticks

### Nodes Not Clickable

1. Clear browser cache
2. Check browser console for errors
3. Restart development server

---

## 📊 Architecture

### Data Flow Pipeline

```
Markdown File (.md)
    ↓
[Parser] markdown-parser.ts
    ↓
[Extractor] call-path-extractor.ts
    ↓
[Enricher] flow-builder.ts + standard function library
    ↓
[Layout] dagre auto-layout
    ↓
[Render] React Flow + Framer Motion
    ↓
[User Click] → FunctionDetailPanel
```

### Component Hierarchy

```
CallFlowDiagram
├── ReactFlow
│   ├── CallFlowNode (clickable)
│   ├── Background
│   ├── Controls
│   └── MiniMap
├── AnimationControls
└── FunctionDetailPanel (slide-in)
```

---

## 🎓 Learning Resources

### Read First
1. `INTERACTIVE_DOCUMENTATION_METHODOLOGY.md` - How it all works
2. `SUBSYSTEM_DOCUMENTATION_TEMPLATE.md` - Standard format
3. `IMPLEMENTATION_SUMMARY.md` - What was built

### Examples
1. `VFS_SUBSYSTEM_DOCUMENTATION.md` - Complete VFS example
2. `STORAGE_SUBSYSTEM_DOCUMENTATION.md` - Block layer example

### Session Logs
- `SESSION_LOG_2026-02-16.md` - Implementation details

---

## 🚀 Performance

- **Build Time**: ~10-30 seconds
- **Page Load**: <100ms (static HTML)
- **Animation**: 60fps (hardware-accelerated)
- **Bundle Size**: ~500KB gzipped

---

## 🌐 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## 📄 License

This documentation viewer is for educational and research purposes.
Linux kernel is licensed under GPLv2.

---

## 🤝 Contributing

### Adding New Subsystem Documentation

1. Use the template
2. Follow the methodology guide
3. Include detailed call paths
4. Test in the viewer

### Improving Existing Documentation

1. Add more function descriptions to standard library
2. Include code snippets
3. Add cross-references
4. Enhance diagrams

---

## 📞 Support

- Check `INTERACTIVE_DOCUMENTATION_METHODOLOGY.md` for detailed guides
- Review `IMPLEMENTATION_SUMMARY.md` for feature overview
- See `SESSION_LOG_2026-02-16.md` for technical details

---

## ✨ Highlights

**What Makes This Special**:

1. **Interactive**: Click any function to learn more
2. **Visual**: See execution paths, not just text
3. **Animated**: Watch code flow step-by-step
4. **Comprehensive**: Detailed metadata on every function
5. **Extensible**: Easy to add new subsystems
6. **Beautiful**: Modern UI with smooth animations

---

## 🎯 Use Cases

- **Learning**: Understand how Linux kernel works
- **Development**: Reference for kernel developers
- **Teaching**: Educational tool for OS courses
- **Research**: Analyze kernel architecture
- **Documentation**: Maintainable subsystem docs

---

## 📈 Statistics

- **Lines of Code**: ~10,000+ (viewer application)
- **Documented Functions**: 100+ with standard descriptions
- **Subsystems Covered**: 2 (VFS, Storage) + complete architecture
- **Interactive Nodes**: Every function in call paths
- **Documentation Files**: 8+ comprehensive guides

---

**Built with ❤️ for the Linux kernel community**

**Web Access**: http://136.243.110.13:3001

**Status**: ✅ Live and Operational
