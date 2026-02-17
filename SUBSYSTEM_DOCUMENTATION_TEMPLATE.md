# Linux [SUBSYSTEM_NAME] Subsystem
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
[Brief description of the core problem this subsystem solves - 2-3 sentences]

### Position in System Architecture
```
┌─────────────────────────────────────────┐
│     [Layer Above]                        │
│     [Key interfaces/APIs]                │
└─────────────────┬───────────────────────┘
                  │ [API/Interface]
┌─────────────────▼───────────────────────┐
│     [THIS SUBSYSTEM]                     │
│  - [Key component 1]                     │
│  - [Key component 2]                     │
│  - [Key component 3]                     │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│ [Component A] │   │  [Component B]   │
└───────────────┘   └──────────────────┘
```

### Interaction with Other Subsystems
- **[Subsystem 1]**: [How they interact]
- **[Subsystem 2]**: [How they interact]
- **[Subsystem 3]**: [How they interact]

---

## 2️⃣ Directory Mapping

```
[subsystem]/
├── [file1.c]              # [Purpose - detailed]
├── [file2.c]              # [Purpose - detailed]
├── [file3.c]              # [Purpose - detailed]
├── [subdir1]/             # [Purpose - detailed]
│   ├── [file.c]
│   └── [file.c]
└── [subdir2]/             # [Purpose - detailed]
    ├── [file.c]
    └── [file.c]
```

---

## 3️⃣ Core Source Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| [path/to/file.c] | [Detailed purpose] | [function1()], [function2()] |
| [path/to/file.c] | [Detailed purpose] | [function1()], [function2()] |

---

## 4️⃣ Core Data Structures

### Structure 1: `struct [name]`

**Purpose**: [What this structure represents]

**Definition** (`[include/path/to/file.h]`):
```c
struct [name] {
    [type]  [field1];    // [Purpose and usage]
    [type]  [field2];    // [Purpose and usage]
    [type]  [field3];    // [Purpose and usage]
};
```

**Key Fields**:
| Field | Type | Purpose |
|-------|------|---------|
| `[field1]` | `[type]` | [Detailed explanation] |
| `[field2]` | `[type]` | [Detailed explanation] |

**Lifetime**: [When created, when destroyed]

**Locking Rules**: [Which locks protect this structure]

**Reference Counting**: [How references are managed]

**Ownership**: [Who owns/manages this structure]

---

## 5️⃣ Call Path Tracing

### Path 1: [Operation Name] (e.g., "read() System Call")

**Overview**: [Brief description of what this path does]

```
User Space:  [user-space-call]
              ↓
System Call: sys_[name]() [fs/file.c]  // Entry point for [syscall]
              ↓
[function2]() [path/to/file.c]  // [What this function does]
              ↓
[function3]() [path/to/file.c]  // [What this function does]
  ├→ [helper1]() [path/file.c]  // [Helper function purpose]
  ├→ [helper2]() [path/file.c]  // [Helper function purpose]
  └→ [helper3]() [path/file.c]  // [Helper function purpose]
              ↓
[function4]() [path/to/file.c]  // [What this function does]
              ↓
Hardware: [Hardware interaction]
```

**Detailed Function Information**:

#### `sys_[name]()`
- **File**: `fs/file.c:123`
- **Purpose**: Entry point for the [name]() system call
- **Parameters**:
  - `int fd` - File descriptor
  - `void __user *buf` - User-space buffer pointer
  - `size_t count` - Number of bytes to read
- **Return**: `ssize_t` - Number of bytes read or error code
- **Description**: Validates parameters, transitions from user to kernel space, and dispatches to VFS layer

#### `[function2]()`
- **File**: `path/to/file.c:456`
- **Purpose**: [Detailed purpose]
- **Parameters**: [List of parameters]
- **Return**: `[type]` - [What it returns]
- **Description**: [Detailed description of what this function does, including key operations and important details]

[... Continue for all key functions in the path ...]

---

### Path 2: [Another Operation]

[Follow same structure as Path 1]

---

## 6️⃣ Concurrency Model

### Locking Hierarchy

1. **[Lock Level 1]**: `[lock_type]` (`[lock_name]`)
   - **Protects**: [What data structures/operations]
   - **Acquired**: [When/where acquired]
   - **Type**: [spinlock/mutex/rwlock/RCU]

2. **[Lock Level 2]**: `[lock_type]` (`[lock_name]`)
   - **Protects**: [What data structures/operations]
   - **Acquired**: [When/where acquired]
   - **Type**: [spinlock/mutex/rwlock/RCU]

### Synchronization Mechanisms

- **Spinlocks**: [Where used and why]
- **Mutexes**: [Where used and why]
- **RCU**: [Where used and why]
- **Per-CPU Data**: [What data is per-CPU and why]
- **Atomic Operations**: [Which operations use atomics]

### Lock Ordering Rules

```
[lock_a] → [lock_b] → [lock_c]
```
**Rule**: Always acquire locks in this order to prevent deadlocks

---

## 7️⃣ Memory Model

### Allocation Patterns

- **GFP Flags Used**:
  - `GFP_KERNEL`: [When used]
  - `GFP_ATOMIC`: [When used]
  - `GFP_NOIO`: [When used]

### Memory Allocators

- **SLUB/SLAB**: [Which structures use slab caches]
- **Page Allocator**: [What uses page-level allocation]
- **vmalloc**: [What uses vmalloc and why]

### NUMA Considerations

[How the subsystem handles NUMA - node-local allocations, migrations, etc.]

### DMA Mapping

[How DMA is used - coherent vs streaming mappings]

---

## 8️⃣ Hardware Interaction

### Device Discovery

[How hardware devices are discovered and enumerated]

### MMIO (Memory-Mapped I/O)

[Which registers are accessed via MMIO]

### DMA Operations

[How DMA transfers are set up and managed]

### Interrupt Handling

**IRQ Handler**: `[handler_name]()`
- **Registration**: [How/where registered]
- **Actions**: [What happens in the IRQ handler]
- **Deferred Work**: [Bottom-half processing - softirq, tasklet, workqueue]

---

## 9️⃣ Performance Considerations

### Critical Hot Paths

- **[Hot Path 1]**: [Optimizations applied]
- **[Hot Path 2]**: [Optimizations applied]

### Cacheline Optimization

[Which structures have `____cacheline_aligned` and why]

### Lock Contention

[Known contention points and mitigations]

### NUMA Locality

[How data locality is maintained across NUMA nodes]

---

## 🔟 Error Handling

### Common Error Codes

| Error Code | Meaning | Triggered When |
|------------|---------|----------------|
| `-EINVAL` | Invalid argument | [Conditions] |
| `-ENOMEM` | Out of memory | [Conditions] |
| `-EIO` | I/O error | [Conditions] |

### Error Paths

[How errors propagate through the subsystem]

---

## 📚 Additional Resources

### Kernel Documentation

- `Documentation/[subsystem]/[file].rst`
- `Documentation/ABI/[file]`

### Key Header Files

- `include/linux/[header].h`
- `include/uapi/linux/[header].h`

### Debugging

**Tracepoints**:
- `[subsystem]_[event1]`
- `[subsystem]_[event2]`

**Debugfs**:
- `/sys/kernel/debug/[subsystem]/`

**Sysfs**:
- `/sys/[path]/`

---

## 🔍 Common Operations Reference

### Operation 1: [Name]
**User API**: `[syscall/ioctl]`
**Entry Point**: `[function]()`
**Flow**: `[func1]() → [func2]() → [func3]()`
**Result**: [What happens]

### Operation 2: [Name]
**User API**: `[syscall/ioctl]`
**Entry Point**: `[function]()`
**Flow**: `[func1]() → [func2]() → [func3]()`
**Result**: [What happens]

---

## Notes for Interactive Viewer

### Function Metadata Format

For each function in call paths, provide:
- **Full function name**: `function_name()`
- **File location**: `path/to/file.c:line_number`
- **Detailed description**: Comprehensive explanation of purpose and behavior
- **Parameters**: Complete parameter list with types and descriptions
- **Return type**: Return value type and meaning
- **Called by**: Parent functions in the call hierarchy
- **Calls**: Child functions it invokes

This metadata enables rich interactive tooltips and detail panels when users click on function nodes in the call flow diagrams.
