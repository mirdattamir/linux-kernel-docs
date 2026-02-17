# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This directory contains the Linux kernel source code (version 6.19) and a directive document (`linux_full_system_architecture_claude_directive.md`) for generating comprehensive Linux architecture documentation.

### Structure
- `linux-6.10/linux-6 (2).19/` - Full Linux kernel source tree
- `linux_full_system_architecture_claude_directive.md` - Directive for Linux architecture documentation mode

## Build Commands

### Configure and Build Kernel
```bash
cd "linux-6.10/linux-6 (2).19"

# Generate default config
make defconfig

# Interactive configuration
make menuconfig

# Build kernel
make -j$(nproc)

# Build specific target
make vmlinux
make modules
```

### Verbose Build
```bash
make V=1    # Show full commands
make V=2    # Show rebuild reasons
```

### Static Analysis
```bash
make C=1    # Check re-compiled files with sparse
make C=2    # Check all source files with sparse
```

### Documentation
```bash
make htmldocs   # Build HTML documentation
make pdfdocs    # Build PDF documentation
```

### External Module Build
```bash
make M=path/to/module
```

## Kernel Source Architecture

### Core Directories
| Directory | Purpose |
|-----------|---------|
| `kernel/` | Core kernel: scheduler (`sched/`), workqueues, timers, signals |
| `mm/` | Memory management: page allocator, slab/SLUB, vmalloc, mmap |
| `fs/` | Virtual File System and filesystem implementations |
| `block/` | Block layer: bio, request queues, blk-mq, I/O schedulers |
| `net/` | Networking stack: TCP/IP, sockets, NAPI, netfilter |
| `drivers/` | Device drivers: storage, network, GPU, platform |
| `arch/` | Architecture-specific: x86, arm64, entry points, context switch |
| `include/` | Kernel headers and API definitions |
| `ipc/` | Inter-process communication: shm, semaphores, message queues |
| `security/` | Security modules: LSM, SELinux, AppArmor, seccomp |
| `virt/` | Virtualization: KVM support |

### Key Source Files
- `kernel/sched/core.c` - Main scheduler logic
- `mm/page_alloc.c` - Physical page allocator (buddy system)
- `mm/slub.c` - SLUB memory allocator
- `fs/namei.c` - Pathname resolution
- `block/blk-mq.c` - Multi-queue block layer
- `net/core/dev.c` - Network device handling

## Architecture Documentation Mode

When the user references `linux_full_system_architecture_claude_directive.md`, operate in Full Linux Architecture Decomposition Mode. For each subsystem, provide:

1. **High-Level Purpose** - What problem it solves, system position, subsystem interactions
2. **Directory Mapping** - Real kernel directories
3. **Core Source Files** - Critical files with purpose
4. **Core Data Structures** - Purpose, key fields, lifetime, ownership, locking rules
5. **Call Path Tracing** - Real kernel execution paths (e.g., `sys_read() → vfs_read() → file->f_op->read_iter()`)
6. **Concurrency Model** - spinlocks, mutexes, RCU, per-CPU data, softirq/hardirq
7. **Memory Model** - Allocators, GFP flags, NUMA, DMA mapping
8. **Hardware Interaction** - PCIe, MMIO, DMA, interrupts
9. **Performance Considerations** - Cacheline alignment, lock contention, NUMA locality

Include ASCII diagrams, call graphs, and struct relationship maps. Use real function names, struct names, and file paths.

## Working with Kernel Code

### Finding Code
```bash
# Find function definitions
grep -rn "function_name" kernel/ mm/ fs/

# Find struct definitions
grep -rn "struct struct_name {" include/
```

### Key Data Structures to Understand
- `struct task_struct` - Process/thread descriptor
- `struct mm_struct` - Memory descriptor
- `struct file` / `struct inode` - VFS objects
- `struct bio` / `struct request` - Block I/O
- `struct sk_buff` - Network packet buffer
- `struct device` - Device model base

### Concurrency Primitives
- `spinlock_t` - CPU-level mutual exclusion
- `struct mutex` - Sleeping locks
- RCU - Read-Copy-Update for read-heavy scenarios
- `atomic_t` / `atomic64_t` - Atomic operations
- `per_cpu` - Per-CPU data structures
