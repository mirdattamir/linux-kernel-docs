# Linux Memory Management Subsystem
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
The memory management subsystem manages the entire physical and virtual memory hierarchy of the system. It provides efficient allocation/deallocation of memory at multiple granularities (pages, objects, virtual regions), implements demand paging with copy-on-write optimization, manages the page cache for file I/O performance, handles memory reclamation under pressure, and enforces memory protection and isolation between processes. It bridges the gap between limited physical RAM and virtually unlimited virtual address space.

### Position in System Architecture
```
┌─────────────────────────────────────────┐
│   User Space Applications                │
│   malloc(), mmap(), brk()                │
└─────────────────┬───────────────────────┘
                  │ System calls
┌─────────────────▼───────────────────────┐
│     MEMORY MANAGEMENT SUBSYSTEM          │
│  - Virtual Memory (VMA management)       │
│  - Page Allocator (buddy system)         │
│  - Slab Allocator (kmalloc, kmem_cache)  │
│  - Page Cache & Swap                     │
│  - Page Reclaim (kswapd, direct reclaim) │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│   Hardware    │   │  File Systems    │
│   MMU / TLB   │   │  Block Layer     │
└───────────────┘   └──────────────────┘
```

### Interaction with Other Subsystems
- **Scheduler**: Allocates stacks, task_struct; handles page faults that block tasks
- **VFS**: Page cache for file data; memory-mapped files
- **Block Layer**: Swap I/O; dirty page writeback
- **Architecture**: Page table management, TLB flushes, cache operations
- **Drivers**: DMA buffers, reserved memory regions
- **Networking**: Socket buffers, zero-copy operations

---

## 2️⃣ Directory Mapping

```
mm/
├── page_alloc.c           # Buddy allocator - physical page allocation
├── slab.c                 # SLAB allocator (legacy)
├── slub.c                 # SLUB allocator (default) - kmalloc, kmem_cache
├── slob.c                 # SLOB allocator (tiny systems)
├── vmalloc.c              # Virtual memory allocation for kernel
├── mmap.c                 # mmap() system call, VMA management
├── memory.c               # Page fault handling, do_page_fault, COW
├── vmscan.c               # Page reclamation, kswapd, direct reclaim
├── swap.c                 # Swap cache and page rotation
├── swapfile.c             # Swap file management
├── filemap.c              # Page cache operations, read/write
├── readahead.c            # File readahead logic
├── truncate.c             # File truncation and invalidation
├── oom_kill.c             # Out-of-memory killer
├── nommu.c                # No-MMU systems support
├── highmem.c              # High memory (32-bit systems)
├── mempool.c              # Memory pools for guaranteed allocation
├── memblock.c             # Early boot memory allocator
├── sparse.c               # Sparse memory model
├── compaction.c           # Memory compaction for huge pages
├── migrate.c              # Page migration (NUMA, compaction)
├── mprotect.c             # Memory protection (mprotect syscall)
├── mremap.c               # Memory remap (mremap syscall)
├── msync.c                # Memory sync (msync syscall)
├── madvise.c              # Memory advice (madvise syscall)
├── mlock.c                # Memory locking (mlock syscall)
├── huge_memory.c          # Transparent huge pages (THP)
├── hugetlb.c              # Explicit huge pages (hugetlbfs)
├── khugepaged.c           # Huge page daemon
├── shmem.c                # tmpfs and shared memory
├── percpu.c               # Per-CPU memory allocation
├── memcontrol.c           # Memory cgroup controller
└── kasan/                 # Kernel address sanitizer
```

---

## 3️⃣ Core Source Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| mm/page_alloc.c | Buddy allocator - manages free pages | __alloc_pages(), free_pages(), __get_free_pages() |
| mm/slub.c | SLUB object allocator | kmalloc(), kfree(), kmem_cache_create(), kmem_cache_alloc() |
| mm/mmap.c | Virtual memory area management | do_mmap(), do_munmap(), find_vma(), merge_vma() |
| mm/memory.c | Page fault handling and COW | handle_mm_fault(), do_anonymous_page(), do_wp_page() |
| mm/filemap.c | Page cache operations | filemap_fault(), add_to_page_cache(), find_get_page() |
| mm/vmscan.c | Page reclamation under memory pressure | kswapd(), shrink_active_list(), try_to_free_pages() |
| mm/swap.c | Page activation/deactivation | lru_add_drain(), mark_page_accessed(), activate_page() |
| mm/oom_kill.c | Out-of-memory task selection and killing | out_of_memory(), oom_kill_process(), select_bad_process() |
| mm/vmalloc.c | Virtually contiguous kernel allocations | vmalloc(), vfree(), ioremap(), iounmap() |

---

## 4️⃣ Core Data Structures

### Structure 1: `struct page`

**Purpose**: Represents a single physical page frame (4KB on x86, 16KB on some ARM)

**Definition** (`include/linux/mm_types.h`):
```c
struct page {
    unsigned long flags;              // Page flags (PG_locked, PG_dirty, PG_lru, etc.)
    atomic_t _refcount;               // Reference count
    atomic_t _mapcount;               // Count of page table mappings

    union {
        struct {                      // Page cache and anonymous pages
            struct list_head lru;     // LRU list linkage
            struct address_space *mapping; // Owner of page (inode or anon)
            pgoff_t index;            // Offset in file / anon VMA
            unsigned long private;    // Filesystem private data
        };
        struct {                      // Slab allocator
            struct kmem_cache *slab_cache;
            void *freelist;           // First free object
            void *s_mem;              // Slab address
        };
        struct {                      // Buddy allocator
            unsigned long private;    // Buddy order
            struct list_head lru;     // Free list linkage
        };
    };

    union {
        struct mm_struct *mm;         // Anonymous page's mm
        void *virtual;                // Virtual address (if mapped)
    };
};
```

**Key Fields**:
| Field | Type | Purpose |
|-------|------|---------|
| `flags` | `unsigned long` | Page state bits (locked, dirty, writeback, LRU, slab, etc.) |
| `_refcount` | `atomic_t` | Reference count - page freed when reaches 0 |
| `_mapcount` | `atomic_t` | Number of page table entries mapping this page |
| `lru` | `struct list_head` | Linkage in LRU lists (active/inactive) |
| `mapping` | `struct address_space *` | Page cache: file inode; Anonymous: anon_vma |
| `index` | `pgoff_t` | Offset in file (page cache) or VMA (anonymous) |

**Lifetime**: Allocated from buddy system, freed when refcount reaches zero

**Locking**: Page lock (PG_locked flag) protects page contents; individual fields have different locking

**Reference Counting**: get_page() / put_page() manage refcount atomically

---

### Structure 2: `struct mm_struct`

**Purpose**: Memory descriptor for a process - describes entire virtual address space

**Definition** (`include/linux/mm_types.h`):
```c
struct mm_struct {
    struct vm_area_struct *mmap;      // List of VMAs
    struct rb_root mm_rb;             // Red-black tree of VMAs
    unsigned long task_size;          // Size of userspace
    unsigned long start_code, end_code; // Code segment bounds
    unsigned long start_data, end_data; // Data segment bounds
    unsigned long start_brk, brk;     // Heap bounds
    unsigned long start_stack;        // Stack start
    unsigned long arg_start, arg_end; // Arguments
    unsigned long env_start, env_end; // Environment

    atomic_t mm_users;                // User space users (threads)
    atomic_t mm_count;                // Primary reference count

    pgd_t *pgd;                       // Page global directory (top-level page table)

    atomic_long_t nr_ptes;            // Page table pages allocated
    unsigned long hiwater_rss;        // Peak RSS (resident set size)
    unsigned long total_vm;           // Total pages mapped
    unsigned long locked_vm;          // Pages locked in memory
    unsigned long data_vm;            // Data segment pages
    unsigned long exec_vm;            // Executable pages
    unsigned long stack_vm;           // Stack pages

    spinlock_t page_table_lock;       // Page table lock
    struct rw_semaphore mmap_lock;    // VMA list lock

    struct list_head mmlist;          // List of all mm_structs
};
```

**Lifetime**: Created in fork(), destroyed when last thread exits and mm_users reaches zero

**Locking**:
- `mmap_lock` (rwsem): Protects VMA list and page table changes
- `page_table_lock` (spinlock): Protects individual page table entries

**Reference Counting**:
- `mm_users`: Number of threads using this mm
- `mm_count`: Primary refcount including kernel references

---

### Structure 3: `struct vm_area_struct` (VMA)

**Purpose**: Represents a contiguous virtual memory region with uniform properties

**Definition** (`include/linux/mm_types.h`):
```c
struct vm_area_struct {
    unsigned long vm_start;           // Start address (inclusive)
    unsigned long vm_end;             // End address (exclusive)
    struct vm_area_struct *vm_next;   // Next VMA in list
    struct rb_node vm_rb;             // Red-black tree node

    struct mm_struct *vm_mm;          // Owning mm_struct
    pgprot_t vm_page_prot;            // Access permissions (R/W/X)
    unsigned long vm_flags;           // Flags (VM_READ, VM_WRITE, VM_EXEC, etc.)

    struct {
        struct rb_node rb;
        unsigned long rb_subtree_last;
    } shared;                         // Shared mapping rb-tree

    struct list_head anon_vma_chain;  // Reverse mapping for anonymous pages
    struct anon_vma *anon_vma;        // Anonymous VMA for this region

    const struct vm_operations_struct *vm_ops; // Operations (fault, etc.)

    unsigned long vm_pgoff;           // Offset in file (pages)
    struct file *vm_file;             // Mapped file (NULL for anonymous)
    void *vm_private_data;            // Private data
};
```

**Key Concepts**:
- Each VMA represents a single mmap() region (code, data, stack, libraries, files)
- VMAs stored in both a linked list (fast iteration) and red-black tree (fast lookup)
- vm_ops provides fault handler for this region

**Locking**: Protected by mm->mmap_lock (read during fault, write during mmap/munmap)

---

### Structure 4: `struct zone`

**Purpose**: Memory zone representing a range of physical pages (DMA, DMA32, Normal, HighMem)

**Definition** (`include/linux/mmzone.h`):
```c
struct zone {
    unsigned long _watermark[NR_WMARK];  // Free page watermarks (min, low, high)
    unsigned long nr_reserved_highatomic; // Reserved for atomic allocations

    long lowmem_reserve[MAX_NR_ZONES];   // Protection from lower zones

    struct pglist_data *zone_pgdat;      // Parent NUMA node
    struct per_cpu_pages *per_cpu_pageset; // Per-CPU page lists

    unsigned long zone_start_pfn;        // First page frame number
    atomic_long_t managed_pages;         // Managed pages in zone
    unsigned long spanned_pages;         // Total pages spanned
    unsigned long present_pages;         // Physical pages present

    const char *name;                    // Zone name ("DMA", "Normal", etc.)

    spinlock_t lock;                     // Zone lock
    struct free_area free_area[MAX_ORDER]; // Buddy allocator free lists

    unsigned long flags;                 // Zone flags
    atomic_long_t vm_stat[NR_VM_ZONE_STAT_ITEMS]; // Zone statistics
};
```

**Purpose of Zones**:
- **DMA**: Pages for ISA DMA (0-16MB on x86)
- **DMA32**: Pages for 32-bit DMA (0-4GB on x86-64)
- **Normal**: Regular pages
- **HighMem**: Pages above kernel virtual mapping (32-bit only)

**Watermarks**: Control when kswapd wakes up and direct reclaim starts

---

### Structure 5: `struct kmem_cache`

**Purpose**: SLUB cache for efficient allocation of same-sized kernel objects

**Definition** (`include/linux/slub_def.h`):
```c
struct kmem_cache {
    struct kmem_cache_cpu *cpu_slab;  // Per-CPU slab cache
    slab_flags_t flags;               // Cache flags (SLAB_HWCACHE_ALIGN, etc.)
    unsigned long min_partial;        // Min partial slabs to keep
    unsigned int size;                // Object size including alignment
    unsigned int object_size;         // Actual object size
    unsigned int offset;              // Free pointer offset
    unsigned int cpu_partial;         // Per-CPU partial slabs

    struct kmem_cache_order_objects oo; // Order and objects per slab
    struct kmem_cache_order_objects max;
    struct kmem_cache_order_objects min;

    gfp_t allocflags;                 // GFP flags for page allocation
    int refcount;                     // Reference count
    void (*ctor)(void *);             // Constructor
    const char *name;                 // Cache name
    struct list_head list;            // Cache list linkage

    struct kmem_cache_node *node[MAX_NUMNODES]; // Per-node lists
};
```

**Usage**: `kmem_cache_create()` creates cache, `kmem_cache_alloc()` allocates from it

---

## 5️⃣ Call Path Tracing

### Path 1: Page Fault Handling

**Overview**: How demand paging works when accessing unmapped or swapped-out memory

```
User Space: Access unmapped address (e.g., after malloc, first write to COW page)
              ↓
Hardware: Page fault exception
              ↓
Interrupt: Page fault handler                       [arch/x86/mm/fault.c:1520]
              ↓
do_user_addr_fault()                                [arch/x86/mm/fault.c:1420]
              ↓
handle_mm_fault()                                   [mm/memory.c:5103] // Main MM fault handler
  ├→ __handle_mm_fault()                            [mm/memory.c:4931]
  │   ├→ pgd_none() ? pgd_alloc() : NULL            // Allocate PGD if needed
  │   ├→ p4d_alloc()                                // Allocate P4D
  │   ├→ pud_alloc()                                [mm/memory.c:4628] // Allocate PUD
  │   ├→ pmd_alloc()                                [mm/memory.c:4614] // Allocate PMD
  │   └→ handle_pte_fault()                         [mm/memory.c:4838] // PTE-level fault
  │       ├→ do_anonymous_page()                    [mm/memory.c:3863] // Anonymous page fault
  │       │   ├→ alloc_zeroed_user_highpage_movable() [mm/memory.c:3819] // Allocate zero page
  │       │   ├→ mk_pte()                           // Create PTE
  │       │   └→ set_pte_at()                       // Install PTE in page table
  │       ├→ do_fault()                             [mm/memory.c:4553] // File-backed fault
  │       │   └→ vma->vm_ops->fault()               // Call filesystem fault handler
  │       │       └→ filemap_fault()                [mm/filemap.c:3191] // Page cache fault
  │       ├→ do_swap_page()                         [mm/memory.c:3620] // Swap-in page
  │       └→ do_wp_page()                           [mm/memory.c:3176] // Copy-on-write fault
  │           ├→ wp_page_copy()                     [mm/memory.c:3068] // COW: copy page
  │           │   ├→ alloc_page_vma()               // Allocate new page
  │           │   ├→ copy_user_highpage()           // Copy old page to new
  │           │   └→ set_pte_at_notify()            // Update PTE
  │           └→ wp_page_reuse()                    [mm/memory.c:3144] // Reuse if possible
  └→ tlb_finish_mmu()                               // TLB flush if needed
              ↓
Return to User Space: Instruction retried
```

**Detailed Function Information**:

#### `handle_mm_fault()`
- **File**: `mm/memory.c:5103`
- **Purpose**: Main entry point for all page faults
- **Parameters**:
  - `struct vm_area_struct *vma` - VMA where fault occurred
  - `unsigned long address` - Faulting address
  - `unsigned int flags` - Fault flags (FAULT_FLAG_WRITE, FAULT_FLAG_USER, etc.)
- **Return**: `vm_fault_t` - Fault result (VM_FAULT_SIGBUS, VM_FAULT_OOM, etc.)
- **Description**: Walks page table hierarchy (PGD→P4D→PUD→PMD→PTE), allocating missing levels. Dispatches to appropriate handler based on fault type (anonymous, file-backed, swap, COW). Handles huge pages and THP. Returns fault status to architecture code.

#### `do_anonymous_page()`
- **File**: `mm/memory.c:3863`
- **Purpose**: Handle fault on anonymous (non-file-backed) memory
- **Parameters**:
  - `struct vm_fault *vmf` - Fault information structure
- **Return**: `vm_fault_t` - Fault result
- **Description**: First write to anonymous VMA. Allocates zero-filled page, creates PTE, installs in page table. For writable faults, marks PTE writable immediately. For read faults, may use zero page (shared, COW). Updates RSS statistics. This implements demand paging for heap and stack.

#### `do_wp_page()`
- **File**: `mm/memory.c:3176`
- **Purpose**: Handle write to read-only page (copy-on-write)
- **Parameters**:
  - `struct vm_fault *vmf` - Fault information
- **Return**: `vm_fault_t` - Result
- **Description**: Triggered by write to COW page (forked process writing parent's page, write to private file mapping). Checks if page can be reused (only one reference). If not, allocates new page, copies contents, updates PTE to point to new page with write permission. This implements efficient fork() by deferring page copying until write.

#### `filemap_fault()`
- **File**: `mm/filemap.c:3191`
- **Purpose**: Handle page fault on file-backed memory (mmap'd file)
- **Parameters**:
  - `struct vm_fault *vmf` - Fault information
- **Return**: `vm_fault_t` - Result
- **Description**: Looks up page in page cache. If present, maps it. If not present, calls filesystem's readpage() to load from disk, adds to page cache, maps it. Handles readahead to prefetch surrounding pages. This provides memory-mapped file I/O.

---

### Path 2: Memory Allocation (kmalloc)

**Overview**: How kernel allocates small objects via SLUB allocator

```
Kernel Code: kmalloc(size, GFP_KERNEL)             [include/linux/slab.h:584]
              ↓
__kmalloc()                                         [mm/slub.c:4521]
              ↓
slab_alloc()                                        [mm/slub.c:3212]
  ├→ slab_alloc_node()                              [mm/slub.c:3177]
  │   ├→ __cmpxchg_double_slab()                    [mm/slub.c:3084] // Try fast path (per-CPU freelist)
  │   │   └→ this_cpu_cmpxchg_double()              // Atomic allocation from CPU freelist
  │   └→ __slab_alloc()                             [mm/slub.c:2931] // Slow path
  │       ├→ ___slab_alloc()                        [mm/slub.c:2836]
  │       │   ├→ get_partial()                      [mm/slub.c:2102] // Try partial slab
  │       │   │   └→ get_partial_node()             [mm/slub.c:2055] // Get from node partial list
  │       │   └→ new_slab()                         [mm/slub.c:1923] // Allocate new slab
  │       │       ├→ allocate_slab()                [mm/slub.c:1834]
  │       │       │   └→ alloc_slab_page()          [mm/slub.c:1778]
  │       │       │       └→ __alloc_pages()        [mm/page_alloc.c] // Get pages from buddy
  │       │       └→ setup_slab_debug()             // Initialize slab
  │       └→ return object pointer
  └→ slab_post_alloc_hook()                         [mm/slab.h:581] // KASAN, initialization
              ↓
Return: void * pointer to allocated memory
```

**Detailed Function Information**:

#### `__kmalloc()`
- **File**: `mm/slub.c:4521`
- **Purpose**: Main kernel memory allocation function
- **Parameters**:
  - `size_t size` - Bytes to allocate
  - `gfp_t flags` - Allocation flags (GFP_KERNEL, GFP_ATOMIC, etc.)
- **Return**: `void *` - Pointer to allocated memory, or NULL on failure
- **Description**: Determines appropriate kmalloc cache based on size (8, 16, 32, ..., 8192 bytes). Calls slab_alloc() on that cache. Fast path: allocates from per-CPU freelist without locks. Slow path: refills per-CPU freelist from partial slabs or allocates new slab from buddy allocator.

#### `new_slab()`
- **File**: `mm/slub.c:1923`
- **Purpose**: Allocate and initialize a new slab from page allocator
- **Parameters**:
  - `struct kmem_cache *s` - Cache to allocate slab for
  - `gfp_t flags` - GFP flags
  - `int node` - NUMA node
- **Return**: `struct page *` - Slab page
- **Description**: Allocates pages from buddy allocator (usually order-0), initializes slab metadata, creates freelist linking all objects, sets page->slab_cache pointer. Returns page for use as slab.

---

### Path 3: Page Allocation (Buddy Allocator)

**Overview**: Low-level physical page allocation

```
Kernel Code: __get_free_pages(GFP_KERNEL, order)   [mm/page_alloc.c:5442]
              ↓
alloc_pages()                                       [include/linux/gfp.h:262]
              ↓
__alloc_pages()                                     [mm/page_alloc.c:5330] // Main allocation logic
  ├→ __alloc_pages_slowpath()                       [mm/page_alloc.c:5115] // Slow path if fast path fails
  │   ├→ wake_all_kswapds()                         [mm/page_alloc.c:4819] // Wake kswapd for async reclaim
  │   ├→ get_page_from_freelist()                   [mm/page_alloc.c:3976] // Try allocation
  │   ├→ __alloc_pages_direct_compact()             [mm/page_alloc.c:4603] // Try compaction
  │   ├→ __alloc_pages_direct_reclaim()             [mm/page_alloc.c:4530] // Try direct reclaim
  │   │   └→ __perform_reclaim()                    [mm/page_alloc.c:4507]
  │   │       └→ try_to_free_pages()                [mm/vmscan.c:3787]
  │   │           └→ shrink_zones()                 [mm/vmscan.c:3689]
  │   │               └→ shrink_node()              [mm/vmscan.c:3484]
  │   │                   └→ shrink_lruvec()        [mm/vmscan.c:3161]
  │   │                       └→ shrink_active_list() / shrink_inactive_list()
  │   ├→ __alloc_pages_may_oom()                    [mm/page_alloc.c:4390] // Invoke OOM killer
  │   └→ out_of_memory()                            [mm/oom_kill.c:1100]
  └→ get_page_from_freelist()                       [mm/page_alloc.c:3976] // Fast path
      └→ rmqueue()                                   [mm/page_alloc.c:3619] // Remove from free list
          ├→ rmqueue_pcplist()                      [mm/page_alloc.c:3558] // Per-CPU page list
          └→ __rmqueue()                            [mm/page_alloc.c:3134] // Buddy allocator
              └→ __rmqueue_smallest()               [mm/page_alloc.c:3058] // Find smallest suitable block
                  └→ expand()                       [mm/page_alloc.c:2466] // Split larger block
              ↓
Return: struct page * to first page of allocation
```

**Detailed Function Information**:

#### `__alloc_pages()`
- **File**: `mm/page_alloc.c:5330`
- **Purpose**: Core page allocation function (buddy allocator entry point)
- **Parameters**:
  - `gfp_t gfp` - Allocation flags
  - `unsigned int order` - Allocation order (2^order pages)
  - `int preferred_nid` - Preferred NUMA node
  - `nodemask_t *nodemask` - Allowed NUMA nodes
- **Return**: `struct page *` - First page of allocation, or NULL
- **Description**: Tries to allocate 2^order contiguous pages. Fast path: tries per-CPU lists and free lists. Slow path: wakes kswapd, tries direct reclaim, compaction, and finally OOM killer. Respects zone watermarks. This is the foundation of all memory allocation.

#### `get_page_from_freelist()`
- **File**: `mm/page_alloc.c:3976`
- **Purpose**: Attempt to allocate from zone free lists
- **Parameters**:
  - `gfp_t gfp_mask` - Allocation flags
  - `unsigned int order` - Order
  - `int alloc_flags` - Internal flags
  - `const struct alloc_context *ac` - Allocation context
- **Return**: `struct page *` - Allocated page or NULL
- **Description**: Iterates through zones in fallback order. For each zone, checks watermarks. If above watermarks, calls rmqueue() to allocate. Handles per-CPU page lists for order-0 allocations (fast, no locking). For higher orders, uses buddy allocator with zone lock.

#### `__rmqueue_smallest()`
- **File**: `mm/page_alloc.c:3058`
- **Purpose**: Buddy allocator - find and remove smallest suitable free block
- **Parameters**:
  - `struct zone *zone` - Zone to allocate from
  - `unsigned int order` - Desired order
  - `int migratetype` - Migration type (unmovable, movable, reclaimable)
- **Return**: `struct page *` - Allocated block
- **Description**: Searches free_area[] starting at requested order up to MAX_ORDER. Finds first non-empty free list. If larger than needed, splits block (expand()) and returns buddies to smaller free lists. This implements the binary buddy system.

---

### Path 4: Memory Reclamation (kswapd)

**Overview**: Background page reclamation to maintain free memory

```
Kernel Thread: kswapd                               [mm/vmscan.c:4310]
              ↓
kswapd()                                            [mm/vmscan.c:4310] // Per-node reclaim thread
  └→ kswapd_try_to_sleep()                          [mm/vmscan.c:4268] // Sleep until woken
  ↓ (Woken by __alloc_pages when watermarks breached)
balance_pgdat()                                     [mm/vmscan.c:4146] // Balance zones in node
  └→ kswapd_shrink_node()                           [mm/vmscan.c:4063]
      └→ shrink_node()                              [mm/vmscan.c:3484] // Reclaim from node
          ├→ shrink_node_memcgs()                   [mm/vmscan.c:3406]
          │   └→ shrink_lruvec()                    [mm/vmscan.c:3161] // Reclaim from LRU lists
          │       ├→ get_scan_count()               [mm/vmscan.c:2723] // Determine anon/file ratio
          │       ├→ shrink_list()                  [mm/vmscan.c:3079]
          │       │   ├→ shrink_active_list()       [mm/vmscan.c:2399] // Age active pages
          │       │   │   └→ move_pages_to_lru()    [mm/vmscan.c:2345] // Move to inactive
          │       │   └→ shrink_inactive_list()     [mm/vmscan.c:2177] // Reclaim inactive pages
          │       │       ├→ isolate_lru_pages()    [mm/vmscan.c:1857] // Remove from LRU
          │       │       ├→ shrink_page_list()     [mm/vmscan.c:1469] // Actually reclaim
          │       │       │   ├→ pageout()          [mm/vmscan.c:886] // Write dirty page
          │       │       │   └→ __remove_mapping()  [mm/vmscan.c:1101] // Remove from page cache
          │       │       └→ putback_inactive_pages() [mm/vmscan.c:2272]
          │       └→ shrink_slab()                  [mm/vmscan.c:858] // Reclaim slab objects
          └→ reclaim_pages()
              ↓
Free pages returned to buddy allocator
```

**Detailed Function Information**:

#### `kswapd()`
- **File**: `mm/vmscan.c:4310`
- **Purpose**: Per-NUMA-node background page reclaim kernel thread
- **Parameters**:
  - `void *p` - pglist_data (NUMA node)
- **Return**: `int` - Thread exit code
- **Description**: Wakes when zone free pages drop below low watermark. Calls balance_pgdat() to free pages until high watermark reached. Prioritizes reclaim (how aggressively to scan). Sleeps when watermarks satisfied. Goal: prevent allocation failures by maintaining free page reserve.

#### `shrink_inactive_list()`
- **File**: `mm/vmscan.c:2177`
- **Purpose**: Scan inactive LRU list and reclaim pages
- **Parameters**:
  - `unsigned long nr_to_scan` - Pages to scan
  - `struct lruvec *lruvec` - LRU vector
  - `struct scan_control *sc` - Scan control (priority, targets)
- **Return**: `unsigned long` - Pages reclaimed
- **Description**: Isolates pages from inactive LRU list. For each page: checks if dirty (write to disk), referenced (move to active), or clean (reclaim immediately). Clean unreferenced pages freed. Dirty pages written to backing store or swap. This implements LRU page replacement policy.

#### `shrink_page_list()`
- **File**: `mm/vmscan.c:1469`
- **Purpose**: Process list of isolated pages and reclaim them
- **Parameters**:
  - `struct list_head *page_list` - Pages to reclaim
  - `struct pglist_data *pgdat` - NUMA node
  - `struct scan_control *sc` - Scan control
- **Return**: `unsigned reclaimed` - Number of pages reclaimed
- **Description**: For each page: checks references (skip if recently accessed), checks if dirty (call pageout()), checks if mapped (try to unmap), removes from page cache/swap cache, frees to buddy allocator. Handles writeback, truncate races, locked pages. Core reclaim logic.

---

## 6️⃣ Concurrency Model

### Locking Hierarchy

1. **Memory cgroup lock**: `memcg->move_lock`
   - **Protects**: Memory cgroup page charge movement
   - **Type**: spinlock

2. **MM mmap lock**: `rwsem` (`mm->mmap_lock`)
   - **Protects**: VMA list, page table changes (mmap, munmap, mprotect)
   - **Acquired**: Read for page faults, write for address space changes
   - **Type**: Read-write semaphore (sleepable)

3. **Page table lock**: `spinlock_t` (`mm->page_table_lock` or per-PMD locks)
   - **Protects**: Individual page table entry modifications
   - **Acquired**: During page fault, COW, reclaim
   - **Type**: Spinlock

4. **Zone lock**: `spinlock_t` (`zone->lock`)
   - **Protects**: Free page lists in buddy allocator
   - **Acquired**: During page allocation/freeing (order > 0)
   - **Type**: Spinlock

5. **LRU lock**: `spinlock_t` (`lruvec->lru_lock`)
   - **Protects**: LRU list membership
   - **Acquired**: During page activation, reclaim, isolation
   - **Type**: Spinlock

6. **Page lock**: Flag (`PG_locked`)
   - **Protects**: Page contents during I/O
   - **Acquired**: During page cache I/O, reclaim, migration
   - **Type**: Bit lock (sleepable)

### Synchronization Mechanisms

- **RCU**: Used for page table traversal without locking (fast GUP - get user pages)
- **Seqlocks**: Used for statistics that can tolerate races
- **Atomic Operations**: Page refcount (_refcount), mapcount (_mapcount), zone statistics
- **Per-CPU Data**: Per-CPU page lists (PCP) for order-0 allocations - lockless fast path
- **Page Lock (PG_locked)**: Prevents concurrent access to page during I/O or reclaim

### Lock Ordering Rules

```
mmap_lock → page_table_lock → lru_lock → page lock
```

**Critical Rules**:
- Never acquire mmap_lock while holding page_table_lock
- Never acquire page lock while holding zone lock (can deadlock with reclaim)
- LRU lock must be innermost (shortest hold time)

### Split Locks Optimization

**Per-PMD page table locks**: Instead of single mm->page_table_lock, each PMD has own lock. Reduces contention on multi-threaded workloads.

**Per-memcg LRU locks**: Each memory cgroup has separate LRU lock, reducing global contention.

---

## 7️⃣ Memory Model

### Allocation Granularities

1. **Pages**: 4KB (x86), 16KB (some ARM), 64KB (some platforms)
   - Allocated via: `alloc_pages()`, `__get_free_pages()`
   - Use case: Page tables, large buffers, DMA

2. **Slabs (Objects)**: 8B to 8KB typically
   - Allocated via: `kmalloc()`, `kmem_cache_alloc()`
   - Use case: Small kernel data structures (dentries, inodes, task_struct)

3. **vmalloc**: Virtually contiguous (not physically)
   - Allocated via: `vmalloc()`, `vzalloc()`
   - Use case: Large kernel buffers, modules

4. **Per-CPU**: Per-CPU variables
   - Allocated via: `alloc_percpu()`
   - Use case: Statistics, per-CPU caches

### GFP Flags (Get Free Pages)

| Flag | Meaning | When to Use |
|------|---------|-------------|
| `GFP_KERNEL` | Can sleep, can reclaim | Normal kernel allocations (process context) |
| `GFP_ATOMIC` | Cannot sleep | Interrupt handlers, spinlock critical sections |
| `GFP_NOWAIT` | Cannot sleep, no reclaim | Similar to ATOMIC but less aggressive |
| `GFP_USER` | User allocation | Can trigger OOM killer |
| `GFP_DMA` | DMA-able memory | ISA DMA (0-16MB on x86) |
| `GFP_DMA32` | 32-bit DMA | Devices with 32-bit DMA (0-4GB on x86-64) |
| `GFP_HIGHUSER` | Highmem for userspace | User pages on 32-bit systems |

**Modifiers**:
- `__GFP_ZERO`: Zero-fill allocated pages
- `__GFP_COLD`: Prefer cold pages (not in CPU cache)
- `__GFP_NOWARN`: Don't warn on allocation failure
- `__GFP_RETRY_MAYFAIL`: Retry allocation before giving up

### NUMA (Non-Uniform Memory Access)

- **Allocation Policy**: Allocate on local node by default (where task running)
- **Fallback**: If local node exhausted, fall back to nearby nodes
- **Migration**: Automatic NUMA balancing migrates pages to node where task runs
- **Interleaving**: Can spread allocations across nodes for bandwidth

### Memory Zones Rationale

**Why zones exist**: Hardware limitations
- Old ISA devices only do DMA to first 16MB (DMA zone)
- Some devices only have 32-bit DMA addressing (DMA32 zone)
- On 32-bit systems, kernel can't map all physical memory (HighMem zone)

### Memory Models

1. **FLATMEM**: Simple model - single mem_map array
2. **DISCONTIGMEM**: Multiple memory banks with holes
3. **SPARSEMEM**: Fine-grained, memory sections, hotplug support (most flexible)

---

## 8️⃣ Hardware Interaction

### Memory Management Unit (MMU)

**Page Tables**: Multi-level radix tree structure
- **x86-64 (4-level)**: PGD → PUD → PMD → PTE
- **x86-64 (5-level)**: PGD → P4D → PUD → PMD → PTE
- **ARM64**: PGD → PUD → PMD → PTE

**TLB (Translation Lookaside Buffer)**: Caches virtual-to-physical translations
- **Flush Triggers**: Page table updates, context switch (if different mm), memory unmap
- **Optimization**: Lazy TLB - kernel threads reuse previous mm's TLB entries

### Page Table Entry Bits

| Bit | x86 Name | Purpose |
|-----|----------|---------|
| Present | P | Page present in memory (vs swapped) |
| Write | W | Writable (vs read-only) |
| User | U | User-accessible (vs kernel-only) |
| Accessed | A | Page accessed (set by hardware) |
| Dirty | D | Page written (set by hardware) |
| NX | XD | No-execute (security) |

### Cache Coherency

- **x86**: Hardware cache coherency (MESI protocol)
- **ARM**: May require explicit cache operations (flush, invalidate)
- **DMA**: `dma_alloc_coherent()` for DMA buffers (uncached or cache-coherent)

### Memory Barriers

- `smp_wmb()`: Write memory barrier (store ordering)
- `smp_rmb()`: Read memory barrier (load ordering)
- `smp_mb()`: Full memory barrier
- Used around page table updates and TLB flushes

---

## 9️⃣ Performance Considerations

### Critical Hot Paths

- **Page Fault**: Extremely hot (every first access to page). Optimizations:
  - Fast path for anonymous pages (avoid lock contention)
  - Speculative page table population
  - Huge pages reduce faults by 512x (2MB vs 4KB)

- **Page Allocation**: Very hot. Optimizations:
  - Per-CPU page lists (order-0 allocations lockless)
  - SLUB per-CPU freelist (kmalloc lockless in common case)
  - High and low watermarks prevent allocation failures

- **Page Cache Lookup**: Extremely hot (every file I/O). Optimizations:
  - XArray (radix tree) for O(log n) lookup
  - RCU for lockless lookups
  - Readahead to amortize overhead

### Huge Pages

**Transparent Huge Pages (THP)**: Automatic 2MB pages
- **Benefit**: 512x fewer page table entries, 512x fewer TLB misses, 512x fewer page faults
- **Cost**: Memory fragmentation, compaction overhead
- **Khugepaged**: Background daemon to merge 4KB pages into 2MB

**Explicit Huge Pages (hugetlbfs)**: Pre-allocated, never swapped
- **Sizes**: 2MB, 1GB (x86-64)
- **Use**: Databases, scientific computing

### Memory Compaction

**Problem**: Fragmentation prevents high-order allocations (huge pages, large DMA buffers)

**Solution**: Compact memory by migrating movable pages to create contiguous free blocks
- **kcompactd**: Background compaction daemon
- **Direct compaction**: Synchronous compaction during allocation

### NUMA Optimization

- **First-touch**: Page allocated on node where first accessed
- **Task Placement**: Scheduler prefers CPU on same node as task's memory
- **Interleaving**: Spread memory across nodes for bandwidth-bound workloads
- **Page Migration**: Migrate pages to follow task migrations

### Cacheline Considerations

- **struct page**: 64 bytes (one cacheline) on x86-64
- **Alignment**: Frequently accessed structures cacheline-aligned
- **False Sharing**: Per-CPU data prevents false sharing of statistics

### Lock Contention Hotspots

- **Zone lock**: Reduced by per-CPU page lists (order-0 fast path)
- **LRU lock**: Split per-memcg and per-node
- **mmap_lock**: Read-mostly, allows concurrent page faults

---

## 🔟 Error Handling

### Common Error Codes

| Error Code | Meaning | Triggered When |
|------------|---------|----------------|
| `-ENOMEM` | Out of memory | Allocation fails even after reclaim |
| `-EFAULT` | Bad address | User pointer invalid in syscall |
| `-EINVAL` | Invalid argument | mmap flags invalid, size misaligned |
| `-EACCES` | Permission denied | mprotect removing permissions not allowed |
| `-EAGAIN` | Try again | Transient allocation failure (GFP_NOWAIT) |
| `-EBUSY` | Device busy | Page locked or migration in progress |

### OOM (Out-of-Memory) Killer

**Trigger**: When all reclaim attempts fail and allocation cannot proceed

**Selection**: Chooses "least important" process based on:
- Memory usage (higher = more likely)
- Nice value (nicer = more likely)
- OOM score adjustment (`/proc/<pid>/oom_score_adj`)
- Never kills kernel threads or init

**Action**: Sends SIGKILL to selected process, frees its memory

**Prevention**:
- Memory cgroups with hard limits
- Sufficient swap space
- Overcommit limits (`vm.overcommit_memory`)

### Memory Corruption Detection

- **KASAN (Kernel Address Sanitizer)**: Detects use-after-free, out-of-bounds, etc.
- **SLUB Debug**: Poison freed objects, detect double-free
- **Page Poisoning**: Fill freed pages with pattern, detect use-after-free

---

## 📚 Additional Resources

### Kernel Documentation

- `Documentation/mm/` - Memory management documentation
- `Documentation/vm/` - Virtual memory subsystem
- `Documentation/admin-guide/mm/` - MM tuning and monitoring

### Key Header Files

- `include/linux/mm.h` - Core MM definitions
- `include/linux/mm_types.h` - MM data structures (page, mm_struct, vma)
- `include/linux/gfp.h` - GFP flags and page allocation
- `include/linux/slab.h` - Slab allocator API (kmalloc, kmem_cache)
- `include/linux/vmalloc.h` - vmalloc API
- `include/linux/swap.h` - Swap and page reclaim
- `include/linux/mmzone.h` - Memory zones and nodes

### Debugging

**Tracepoints**:
- `mm:mm_page_alloc` - Page allocations
- `mm:mm_page_free` - Page frees
- `kmem:kmalloc` - Slab allocations
- `kmem:kfree` - Slab frees
- `mm:mm_page_fault` - Page faults
- `vmscan:mm_vmscan_*` - Page reclaim events

**Debugfs**: `/sys/kernel/debug/`
- `extfrag/` - Fragmentation info
- `kmemleak` - Memory leak detector

**Procfs**:
- `/proc/meminfo` - System memory statistics
- `/proc/buddyinfo` - Buddy allocator free lists
- `/proc/pagetypeinfo` - Page migration types
- `/proc/slabinfo` - Slab cache statistics
- `/proc/<pid>/maps` - Process VMAs
- `/proc/<pid>/smaps` - Detailed VMA statistics
- `/proc/<pid>/pagemap` - Physical addresses of pages

**Sysfs**:
- `/sys/kernel/mm/transparent_hugepage/` - THP control
- `/sys/kernel/mm/hugepages/` - Huge page statistics

---

## 🔍 Common Operations Reference

### Operation 1: mmap() - Memory Mapping
**User API**: `mmap(addr, length, prot, flags, fd, offset)`
**Entry Point**: `sys_mmap()` [arch/x86/kernel/sys_x86_64.c]
**Flow**: `sys_mmap() → ksys_mmap_pgoff() → vm_mmap_pgoff() → do_mmap()`
**Result**: New VMA created, added to mm_struct, no pages allocated until first access (demand paging)

### Operation 2: Page Fault - First Access
**Trigger**: Access to unmapped address in valid VMA
**Entry Point**: `do_user_addr_fault()` [arch/x86/mm/fault.c]
**Flow**: `do_user_addr_fault() → handle_mm_fault() → __handle_mm_fault() → handle_pte_fault() → do_anonymous_page()`
**Result**: Page allocated, zeroed, mapped into page table, TLB updated

### Operation 3: fork() - Copy Address Space
**User API**: `fork()`
**Entry Point**: `sys_clone()` [kernel/fork.c]
**Flow**: `sys_clone() → kernel_clone() → copy_process() → copy_mm() → dup_mmap()`
**Result**: Child gets copy of parent's VMAs, page tables marked copy-on-write (no actual page copying until write)

### Operation 4: brk() - Heap Expansion
**User API**: `brk(addr)` (used by malloc)
**Entry Point**: `sys_brk()` [mm/mmap.c]
**Flow**: `sys_brk() → do_brk_flags() → do_mas_align_munmap() + vma_merge()`
**Result**: Heap VMA expanded or shrunk, no actual page allocation until access

---

**End of Memory Management Subsystem Documentation**
