# Linux Storage Subsystem
## Full Architecture Documentation (Block Layer + Storage Drivers)

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
The Storage Subsystem provides a **unified I/O pipeline** for all block-based storage devices. It handles:
- **I/O scheduling and merging** for optimal disk access patterns
- **Multi-queue architecture (blk-mq)** for parallelism on modern hardware
- **Request queueing and dispatching** to device drivers
- **Block device abstraction** for consistent interface to storage

### Position in System Architecture
```
┌─────────────────────────────────────────┐
│     VFS Layer (filesystems)             │
│     Page cache, buffer heads            │
└─────────────────┬───────────────────────┘
                  │ submit_bio()
┌─────────────────▼───────────────────────┐
│     Block Layer (block/)                 │
│  - BIO management                        │
│  - Request queue (blk-mq)                │
│  - I/O scheduling                        │
│  - I/O accounting                        │
└─────────────────┬───────────────────────┘
                  │ queue_rq()
┌─────────────────▼───────────────────────┐
│   Storage Drivers                        │
│   - NVMe (drivers/nvme/)                 │
│   - SCSI (drivers/scsi/)                 │
│   - ATA (drivers/ata/)                   │
└─────────────────┬───────────────────────┘
                  │ PCIe/DMA
┌─────────────────▼───────────────────────┐
│     Hardware (SSD, HDD, RAID)           │
└─────────────────────────────────────────┘
```

### Interaction with Other Subsystems
- **VFS/Filesystems**: Receives I/O requests via `submit_bio()`
- **Memory Management**: Uses page allocator for bounce buffers, DMA mapping
- **Device Model**: Integrates with kernel device hierarchy (sysfs)
- **Power Management**: Handles device suspend/resume
- **Tracing**: Blktrace/ftrace integration for I/O observability

---

## 2️⃣ Directory Mapping

### Block Layer
```
block/
├── blk-core.c           # Core block layer initialization
├── blk-mq.c             # Multi-queue block layer (main logic)
├── blk-mq-tag.c         # Tag allocation for requests
├── blk-mq-sched.c       # I/O scheduler interface
├── blk-merge.c          # I/O request merging
├── blk-settings.c       # Queue limits and settings
├── blk-sysfs.c          # Sysfs interface (/sys/block/)
├── blk-timeout.c        # Request timeout handling
├── blk-flush.c          # Cache flush handling (barriers)
├── blk-integrity.c      # Data integrity (T10 DIF/DIX)
├── blk-crypto.c         # Inline encryption
├── bio.c                # BIO allocation and management
├── bfq-iosched.c        # BFQ I/O scheduler (Budget Fair Queueing)
├── mq-deadline.c        # mq-deadline I/O scheduler
├── kyber-iosched.c      # Kyber I/O scheduler
├── blk-cgroup.c         # Cgroup I/O control
├── blk-stat.c           # I/O statistics
├── blk-wbt.c            # Writeback throttling
├── blk-iocost.c         # I/O cost model (QoS)
├── blk-iolatency.c      # Latency-based QoS
└── partitions/          # Partition detection
```

### Storage Drivers
```
drivers/nvme/
├── host/
│   ├── core.c           # NVMe core logic
│   ├── pci.c            # NVMe PCIe driver
│   ├── multipath.c      # NVMe multipathing
│   ├── nvme.h           # NVMe data structures
│   └── ioctl.c          # NVMe ioctl interface
└── target/              # NVMe target (for creating NVMe devices)

drivers/scsi/
├── scsi.c               # SCSI mid-layer core
├── scsi_lib.c           # SCSI request queue management
├── scsi_error.c         # SCSI error handling
├── sd.c                 # SCSI disk driver
├── sg.c                 # SCSI generic driver
├── scsi_sysfs.c         # Sysfs integration
└── [hardware-specific]  # megaraid, mpt3sas, etc.

drivers/ata/
├── libata-core.c        # libata core
├── libata-scsi.c        # ATA-to-SCSI translation
├── libata-eh.c          # Error handling
└── ahci.c               # AHCI controller driver
```

---

## 3️⃣ Core Source Files

### Block Layer
| File | Purpose |
|------|---------|
| `block/bio.c` | **BIO management** - Allocate/free BIOs, bio_vec management |
| `block/blk-mq.c` | **Multi-queue core** - Request allocation, queue management, dispatch |
| `block/blk-mq-tag.c` | **Tag allocation** - Track outstanding requests (like IOMMU tags) |
| `block/blk-merge.c` | **I/O merging** - Merge adjacent requests for efficiency |
| `block/blk-flush.c` | **Cache flushing** - Handle FUA/PREFLUSH for data integrity |
| `block/bfq-iosched.c` | **BFQ scheduler** - Fair queueing for interactive workloads |
| `block/mq-deadline.c` | **Deadline scheduler** - Latency-focused scheduling |

### NVMe Driver
| File | Purpose |
|------|---------|
| `drivers/nvme/host/pci.c` | **PCIe driver** - PCI probe, queue setup, interrupt handling |
| `drivers/nvme/host/core.c` | **Core logic** - Namespace management, command submission |
| `drivers/nvme/host/multipath.c` | **Multipathing** - Path selection for redundant controllers |

### SCSI Layer
| File | Purpose |
|------|---------|
| `drivers/scsi/scsi_lib.c` | **Queue management** - SCSI command queueing |
| `drivers/scsi/sd.c` | **SCSI disk** - Block device interface for SCSI disks |
| `drivers/scsi/scsi_error.c` | **Error recovery** - Retry, reset, abort logic |

---

## 4️⃣ Core Data Structures

### struct bio (include/linux/blk_types.h)
**Purpose**: Represents a block I/O request at the page level

**Key Fields**:
```c
struct bio {
    struct bio              *bi_next;        // Next bio in chain
    struct block_device     *bi_bdev;        // Target block device
    unsigned int            bi_opf;          // Operation flags (READ/WRITE/FLUSH)
    unsigned short          bi_flags;        // Status flags
    unsigned short          bi_ioprio;       // I/O priority
    blk_status_t            bi_status;       // I/O status
    atomic_t                __bi_remaining;  // Reference count
    struct bvec_iter        bi_iter;         // Current position in bio_vec
    bio_end_io_t            *bi_end_io;      // Completion callback
    void                    *bi_private;     // Private data for callback
    unsigned short          bi_vcnt;         // Number of bio_vecs
    unsigned short          bi_max_vecs;     // Max bio_vecs allocated
    atomic_t                __bi_cnt;        // Reference count
    struct bio_vec          *bi_io_vec;      // Array of bio_vec segments
    struct bio_vec          bi_inline_vecs[]; // Inline storage for small I/O
};
```

**bio_vec (segment)**:
```c
struct bio_vec {
    struct page     *bv_page;       // Physical page
    unsigned int    bv_len;         // Length in bytes
    unsigned int    bv_offset;      // Offset within page
};
```

**Lifetime**: Allocated by filesystem/block layer, freed after I/O completion
**Ownership**: Submitted by upper layers, owned by block layer during processing
**Locking**: Reference counted (`__bi_cnt`), no explicit locks
**Memory Layout**: Inline bio_vecs for small I/O (typically 1-4 pages)

---

### struct request (include/linux/blk-mq.h)
**Purpose**: Represents a block device request (higher level than bio)

**Key Fields**:
```c
struct request {
    struct request_queue    *q;              // Associated queue
    struct blk_mq_ctx       *mq_ctx;         // Submission context (per-CPU)
    struct blk_mq_hw_ctx    *mq_hctx;        // Hardware queue context
    unsigned int            cmd_flags;       // Command flags
    req_flags_t             rq_flags;        // Request flags
    int                     tag;             // Unique tag for this request
    int                     internal_tag;    // Internal tag
    unsigned int            __data_len;      // Total data length
    sector_t                __sector;        // Starting sector
    struct bio              *bio;            // First bio in chain
    struct bio              *biotail;        // Last bio in chain
    struct list_head        queuelist;       // Link in various lists
    rq_end_io_fn            *end_io;         // Completion callback
    void                    *end_io_data;    // Private data
    ktime_t                 io_start_time_ns;// I/O start timestamp
    unsigned short          stats_sectors;   // Sectors for stats
    unsigned short          nr_phys_segments;// Physical segments (for DMA)
    unsigned short          ioprio;          // I/O priority
};
```

**Lifetime**: Allocated from blk-mq tag set, freed after completion
**Ownership**: Owned by block layer, passed to driver
**Locking**: Tag-based synchronization, no explicit locks
**Reference Counting**: Implicit via tag allocation

---

### struct request_queue (include/linux/blkdev.h)
**Purpose**: Per-device request queue (one per block device)

**Key Fields**:
```c
struct request_queue {
    struct request          *last_merge;     // Last merged request
    struct elevator_queue   *elevator;       // I/O scheduler
    struct blk_mq_tag_set   *tag_set;        // Tag set for requests
    struct queue_limits     limits;          // Queue limits (max sectors, etc.)
    unsigned int            nr_hw_queues;    // Number of hardware queues
    unsigned int            queue_depth;     // Max outstanding requests
    spinlock_t              queue_lock;      // Queue lock (legacy)
    struct kobject          kobj;            // Sysfs representation
    struct device           *dev;            // Associated device
    unsigned long           queue_flags;     // Queue flags
    atomic_t                mq_freeze_depth; // Freeze counter
    struct blk_mq_hw_ctx    **queue_hw_ctx;  // Array of hardware contexts
    unsigned int            nr_requests;     // Total requests available
};
```

**Lifetime**: Created during device initialization, destroyed on device removal
**Ownership**: Owned by block device
**Locking**: `queue_lock` for legacy single-queue, mostly lockless in blk-mq

---

### struct blk_mq_hw_ctx (block/blk-mq.h)
**Purpose**: Per-hardware-queue context (for parallel submission)

**Key Fields**:
```c
struct blk_mq_hw_ctx {
    struct {
        spinlock_t      lock;               // Protects dispatch list
        struct list_head dispatch;          // Dispatch list
    } ____cacheline_aligned_in_smp;

    unsigned long       state;              // Queue state
    struct request_queue *queue;            // Back pointer to queue
    unsigned int        queue_num;          // Hardware queue number
    unsigned int        nr_ctx;             // Number of software contexts
    struct blk_mq_ctx   **ctxs;             // Software contexts
    struct sbitmap      ctx_map;            // Bitmap of active contexts
    struct blk_mq_tags  *tags;              // Tag set
    struct blk_mq_tags  *sched_tags;        // Scheduler tags
    unsigned long       run_work;           // Work flags
    cpumask_t           cpumask;            // CPU affinity mask
    atomic_t            nr_active;          // Active requests
    struct hlist_node   cpuhp_online;       // CPU hotplug list
    struct delayed_work run_work;           // Async dispatch work
};
```

**Purpose**: Enables parallel I/O submission on multi-core systems
**Affinity**: Each hw_ctx typically mapped to specific CPUs for locality

---

### struct blk_mq_ctx (block/blk-mq.h)
**Purpose**: Per-CPU software context for request submission

**Key Fields**:
```c
struct blk_mq_ctx {
    struct {
        spinlock_t      lock;               // Protects request list
        struct list_head rq_lists[HCTX_MAX_TYPES]; // Request lists
    } ____cacheline_aligned_in_smp;

    unsigned int        cpu;                // CPU number
    unsigned short      index_hw[HCTX_MAX_TYPES]; // Hardware queue indices
    struct blk_mq_hw_ctx *hctxs[HCTX_MAX_TYPES];  // Hardware contexts
    struct request_queue *queue;            // Back pointer
    struct kobject      kobj;               // Sysfs representation
};
```

**Purpose**: Per-CPU submission to avoid lock contention

---

### NVMe Data Structures

### struct nvme_dev (drivers/nvme/host/pci.c)
**Purpose**: Represents an NVMe controller (PCIe device)

**Key Fields**:
```c
struct nvme_dev {
    struct nvme_ctrl    ctrl;               // Generic controller
    struct pci_dev      *pdev;              // PCIe device
    struct nvme_queue   *queues;            // I/O queues (Admin + I/O)
    struct dma_pool     *prp_page_pool;     // PRP (Physical Region Page) pool
    struct dma_pool     *prp_small_pool;    // Small PRP pool
    unsigned int        online_queues;      // Active queues
    unsigned int        max_qid;            // Max queue ID
    unsigned int        io_queues[HCTX_MAX_TYPES]; // I/O queue counts
    unsigned int        num_vecs;           // MSI-X vectors
    u32                 db_stride;          // Doorbell stride
    void __iomem        *bar;               // MMIO BAR
    unsigned long       bar_mapped_size;    // BAR size
    struct work_struct  remove_work;        // Device removal work
};
```

**Lifetime**: Created during PCIe probe, destroyed on removal
**Ownership**: Owned by NVMe driver
**Locking**: Per-queue locks for I/O submission

---

### struct nvme_queue (drivers/nvme/host/pci.c)
**Purpose**: NVMe submission/completion queue pair

**Key Fields**:
```c
struct nvme_queue {
    struct nvme_dev     *dev;               // Parent device
    spinlock_t          sq_lock;            // Submission queue lock
    struct nvme_command *sq_cmds;           // Submission queue commands
    struct nvme_completion *cqes;           // Completion queue entries
    dma_addr_t          sq_dma_addr;        // SQ DMA address
    dma_addr_t          cq_dma_addr;        // CQ DMA address
    u16                 q_depth;            // Queue depth
    u16                 cq_vector;          // MSI-X vector
    u16                 sq_tail;            // SQ tail pointer
    u16                 cq_head;            // CQ head pointer
    u16                 qid;                // Queue ID
    u8                  cq_phase;           // Phase bit
    unsigned long       flags;              // Queue flags
};
```

**DMA**: Uses DMA-coherent memory for queues
**Doorbells**: MMIO writes to notify device of new commands

---

## 5️⃣ Call Path Tracing

### Path 1: I/O Submission (Write)
```
Filesystem: ext4_file_write_iter()
              ↓
iomap_file_buffered_write() [fs/iomap/buffered-io.c]
              ↓
iomap_writepages() - Writeback daemon
              ↓
submit_bio() [block/bio.c]
    ├─→ bio_set_dev() - Set target block device
    ├─→ generic_make_request()
    └─→ blk_mq_submit_bio() [block/blk-mq.c]
          ├─→ blk_mq_get_request() - Allocate request from tag set
          ├─→ blk_mq_bio_to_request() - Convert bio to request
          ├─→ blk_mq_sched_insert_request() - Insert into scheduler
          │     └─→ mq_deadline_insert_requests() [if deadline scheduler]
          └─→ blk_mq_run_hw_queue() - Trigger dispatch
                ├─→ __blk_mq_delay_run_hw_queue()
                └─→ __blk_mq_run_hw_queue()
                      └─→ blk_mq_sched_dispatch_requests()
                            ├─→ blk_mq_do_dispatch_sched() - From scheduler
                            └─→ blk_mq_dispatch_rq_list()
                                  └─→ queue->mq_ops->queue_rq() - Driver callback
                                        ↓
                                  nvme_queue_rq() [drivers/nvme/host/core.c]
                                        ├─→ nvme_setup_cmd() - Build NVMe command
                                        ├─→ nvme_submit_cmd() - Submit to SQ
                                        │     ├─→ Write command to SQ
                                        │     ├─→ Increment SQ tail
                                        │     └─→ writel(sq_tail, doorbell) - MMIO write
                                        └─→ Return BLK_STS_OK

Device Side: NVMe controller fetches command via DMA, executes I/O

Interrupt: MSI-X interrupt fires on completion
              ↓
nvme_irq() [drivers/nvme/host/pci.c]
              ↓
nvme_process_cq() - Process completion queue
    ├─→ Read CQ entry
    ├─→ Check phase bit
    ├─→ Increment CQ head
    ├─→ writel(cq_head, doorbell) - Acknowledge completion
    └─→ nvme_complete_rq()
          └─→ blk_mq_complete_request() [block/blk-mq.c]
                ├─→ blk_mq_end_request()
                │     └─→ request->end_io() - Block layer callback
                │           └─→ bio->bi_end_io() - Filesystem callback
                └─→ blk_mq_free_request() - Return request to tag pool
```

### Path 2: Direct I/O (O_DIRECT)
```
User Space: pwrite(fd, buf, size, offset) with O_DIRECT
              ↓
vfs_write() → ext4_file_write_iter()
              ↓
iomap_dio_rw() [fs/iomap/direct-io.c]
    ├─→ get_user_pages() - Pin user pages
    ├─→ iomap_dio_bio_iter() - Build BIO from user pages
    └─→ submit_bio_wait() - Submit and wait synchronously
          ↓
[Same path as above through block layer and NVMe driver]
          ↓
Wait for completion
          ↓
unpin_user_pages() - Release pinned pages
          ↓
Return to user space
```

### Path 3: Read with Page Cache Miss
```
sys_read() → vfs_read() → ext4_file_read_iter()
              ↓
generic_file_buffered_read() [mm/filemap.c]
    ├─→ find_get_page() - Check page cache → MISS
    ├─→ page_cache_alloc() - Allocate new page
    └─→ iomap_readahead() [fs/iomap/buffered-io.c]
          ├─→ iomap_iter() - Get extent mapping
          └─→ iomap_readpage_iter()
                └─→ submit_bio() with READ operation
                      ↓
[Same path through block layer and NVMe driver]
                      ↓
Completion callback: iomap_read_end_io()
    ├─→ SetPageUptodate(page)
    ├─→ unlock_page(page)
    └─→ Wake up waiting readers

generic_file_buffered_read() resumes:
    └─→ copy_page_to_iter() - Copy to user space
```

### Path 4: Flush/FUA (Force Unit Access)
```
fsync(fd) → vfs_fsync() → ext4_sync_file()
              ↓
filemap_write_and_wait_range() - Write dirty pages
              ↓
blkdev_issue_flush() [block/blk-flush.c]
    ├─→ bio_alloc() with REQ_OP_FLUSH | REQ_PREFLUSH
    └─→ submit_bio_wait()
          ↓
blk_mq_make_request() [block/blk-mq.c]
    └─→ blk_insert_flush() [block/blk-flush.c]
          ├─→ Queue flush request
          └─→ Dispatch to driver
                ↓
nvme_queue_rq() with flush command
    └─→ nvme_setup_flush() - Build flush command
          ↓
NVMe device flushes internal caches
          ↓
Completion returns to filesystem
```

---

## 6️⃣ Concurrency Model

### Block Layer Locking

#### Per-CPU Software Context (blk_mq_ctx)
- **ctx->lock**: Spinlock protecting per-CPU request lists
- **Minimizes contention**: Each CPU has its own submission context

#### Hardware Queue Context (blk_mq_hw_ctx)
- **hctx->lock**: Spinlock protecting dispatch list
- **Lock-free fast path**: Tag-based request tracking
- **RCU**: Used for queue freeze/unfreeze operations

#### Tag Allocation
- **Sbitmap**: Lock-free bitmap for tag allocation
- **Per-hardware-queue tags**: Parallel tag allocation across queues
- **Wait queue**: Blocks when tags exhausted

### NVMe Driver Locking

#### Submission Queue Lock (nvme_queue->sq_lock)
- **Purpose**: Protects SQ tail pointer updates
- **Scope**: Per-queue (multiple queues for parallelism)
- **Held during**: Command submission, doorbell writes

#### Completion Queue Processing
- **IRQ context**: Runs in interrupt handler
- **No locks needed**: Single threaded per CQ
- **Softirq**: Can defer to NAPI-like polling

### Lock Ordering
```
1. queue_lock (legacy, rarely used in blk-mq)
2. ctx->lock (per-CPU context)
3. hctx->lock (hardware queue)
4. nvme_queue->sq_lock (driver)
```

### Atomic Operations
- **request->__bi_remaining**: Atomic reference count for split BIOs
- **request->__bi_cnt**: Atomic reference count
- **Tag bitmap**: Lock-free atomic bit operations

### RCU Usage
- **Queue freeze**: RCU-protected queue state transitions
- **Request completion**: RCU for request lifecycle

### Per-CPU Optimizations
- **blk_mq_ctx**: One per CPU to avoid contention
- **Statistics**: Per-CPU counters (disk_stats)
- **Tag caching**: Per-CPU tag cache for fast allocation

### Interrupt Context
- **nvme_irq()**: Runs in hardirq context
- **Completion processing**: Can run in softirq or threaded IRQ
- **Doorbell writes**: MMIO writes are serialized by hardware

---

## 7️⃣ Memory Model

### BIO Memory Management

**Allocation**:
- **bio_alloc()**: SLUB allocator (`fs_bio_set`)
- **bio_vec**: Inline for small I/O (<= 4 pages), separate allocation for larger
- **GFP flags**:
  - `GFP_NOIO` - During writeback (no recursion)
  - `GFP_KERNEL` - Normal allocation

**Memory Layout**:
```
struct bio (cacheline aligned)
    ↓
bio_vec array (inline or separate)
    ↓
Points to struct page (from page cache or user pages)
```

### Request Memory Management

**Allocation**:
- **blk_mq_alloc_request()**: From tag set pool
- **Pre-allocated**: Requests pre-allocated at queue init
- **Tag-based**: Request indexed by tag number

### DMA Mapping

**NVMe PRP (Physical Region Pages)**:
- **PRP lists**: Describe physical memory regions
- **DMA coherent**: Allocated with `dma_alloc_coherent()`
- **DMA pools**: Cached for performance (`prp_page_pool`)

**IOMMU**:
- **dma_map_page()**: Maps pages for device DMA
- **Scatter-gather**: Multiple physical regions in single I/O
- **Unmapping**: `dma_unmap_page()` after completion

### NUMA Awareness
- **Queue allocation**: Allocated on device's NUMA node
- **Request allocation**: From local node
- **Completion processing**: Processed on interrupt's CPU node

### Cacheline Alignment
- **struct request**: Cacheline aligned to avoid false sharing
- **blk_mq_hw_ctx**: Hot fields in first cacheline
- **nvme_queue**: Submission/completion pointers separated

### Memory Reclaim
- **Mempool**: Used for guaranteed allocation during memory pressure
- **GFP_NOIO**: Prevents recursive writeback during reclaim

---

## 8️⃣ Hardware Interaction

### PCIe Enumeration
```
PCI Bus Scan
    ↓
nvme_probe() [drivers/nvme/host/pci.c]
    ├─→ pci_enable_device() - Enable PCIe device
    ├─→ pci_request_mem_regions() - Reserve BAR regions
    ├─→ pci_set_master() - Enable bus mastering (DMA)
    ├─→ dma_set_mask_and_coherent() - Set DMA addressing
    └─→ ioremap() - Map BAR to kernel virtual address
```

### NVMe MMIO Registers (BAR 0)
```
Offset 0x0000: Controller Capabilities (CAP)
Offset 0x0008: Version (VS)
Offset 0x0014: Controller Configuration (CC)
Offset 0x001C: Controller Status (CSTS)
Offset 0x0024: Admin Queue Attributes (AQA)
Offset 0x0028: Admin Submission Queue Base (ASQ)
Offset 0x0030: Admin Completion Queue Base (ACQ)
Offset 0x1000+: Doorbell Registers (SQ/CQ doorbells)
```

### Doorbell Mechanism
**Submission Doorbell** (MMIO write):
```c
writel(queue->sq_tail, queue->q_db);  // Notify device of new commands
```

**Completion Doorbell** (MMIO write after processing):
```c
writel(queue->cq_head, queue->q_db + queue->dev->db_stride); // Acknowledge completions
```

### DMA Operations

**Command Submission (Device reads)**:
1. CPU writes NVMe command to submission queue (DMA-coherent memory)
2. CPU writes doorbell register (MMIO)
3. Device DMA reads command from submission queue
4. Device fetches data using PRPs (DMA read from page cache)

**Data Transfer**:
- **Write**: Device DMA reads from host memory (PRPs point to pages)
- **Read**: Device DMA writes to host memory

**Completion Posting (Device writes)**:
1. Device DMA writes completion entry to completion queue
2. Device raises MSI-X interrupt
3. CPU DMA reads completion queue (check phase bit)
4. CPU writes completion doorbell (MMIO)

### Interrupt Handling

**MSI-X** (Message Signaled Interrupts Extended):
- **Multiple vectors**: One per I/O queue for parallelism
- **CPU affinity**: Interrupt routed to specific CPU
- **Registration**:
```c
pci_alloc_irq_vectors(pdev, 1, num_queues, PCI_IRQ_MSIX);
request_irq(irq, nvme_irq, IRQF_SHARED, "nvme", queue);
```

**IRQ Coalescing**:
- **Interrupt Coalescing**: NVMe feature to batch completions
- **Polling mode**: io_poll() for ultra-low latency

### Device Reset
```
Controller Failure Detection
    ↓
nvme_reset_work() [drivers/nvme/host/pci.c]
    ├─→ nvme_dev_disable() - Disable queues, stop I/O
    ├─→ CC.EN = 0 (MMIO write) - Disable controller
    ├─→ Wait for CSTS.RDY = 0
    ├─→ CC.EN = 1 - Re-enable controller
    ├─→ nvme_setup_io_queues() - Recreate queues
    └─→ nvme_start_queues() - Resume I/O
```

---

## 9️⃣ Performance Considerations

### Blk-MQ Parallelism
- **Multiple hardware queues**: One per CPU or NVMe queue
- **Lock-free fast path**: Tag-based tracking reduces contention
- **Per-CPU submission**: Avoids cross-CPU communication

### I/O Scheduling Tradeoffs
- **None (noop)**: No scheduling overhead (best for NVMe)
- **mq-deadline**: Latency guarantees for HDDs
- **BFQ**: Fair queueing for interactive workloads
- **Kyber**: Latency-based for mixed workloads

### Request Merging
- **Front merge**: Append to existing request start
- **Back merge**: Append to existing request end
- **Full merge**: Merge two requests
- **Tradeoff**: CPU overhead vs. I/O reduction

### Tag Depth Tuning
- **Large depth**: More parallelism, higher memory usage
- **Small depth**: Lower latency variance, less memory
- **NVMe typical**: 1024-4096 tags per queue

### NUMA Locality
- **Queue affinity**: Place queues on device's NUMA node
- **IRQ affinity**: Route interrupts to local CPUs
- **Memory allocation**: Allocate from local node

### Interrupt Mitigation
- **IRQ coalescing**: Batch completions to reduce interrupts
- **Polling mode (io_poll)**: CPU polls CQ instead of interrupts
  - **Tradeoff**: Lower latency but higher CPU usage

### Cacheline Optimization
- **Request alignment**: Avoid false sharing between CPUs
- **Read-mostly fields**: Separate from write-heavy fields
- **Completion processing**: Batch to improve cache reuse

### Direct I/O Benefits
- **Bypass page cache**: Eliminate memory copy
- **User-controlled**: Application manages buffering
- **Use case**: Databases with custom caching

### Writeback Throttling (WBT)
- **Purpose**: Prevent write saturation affecting reads
- **Mechanism**: Throttle writes based on read latency
- **Adaptive**: Adjusts to device characteristics

### I/O Cost Models (blk-iocost)
- **Purpose**: Fair sharing among cgroups
- **Mechanism**: Model device performance, assign costs
- **QoS**: Latency-sensitive vs. throughput-oriented

---

## 🔷 ASCII Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                    FILESYSTEM LAYER                             │
│    ext4 / XFS / btrfs / F2FS / page cache / buffer heads       │
└──────────────────────────┬─────────────────────────────────────┘
                           │ submit_bio()
┌──────────────────────────▼─────────────────────────────────────┐
│                     BLOCK LAYER (block/)                        │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  struct bio (page-level I/O descriptor)                  │  │
│  │  - bi_opf (READ/WRITE/FLUSH)                             │  │
│  │  - bio_vec[] (page, offset, length)                      │  │
│  └──────────────────────┬───────────────────────────────────┘  │
│                         │ blk_mq_submit_bio()                   │
│  ┌──────────────────────▼───────────────────────────────────┐  │
│  │  BLK-MQ (Multi-Queue Block Layer)                        │  │
│  │                                                           │  │
│  │  CPU 0         CPU 1         CPU 2         CPU 3         │  │
│  │  ┌─────┐      ┌─────┐      ┌─────┐      ┌─────┐         │  │
│  │  │ ctx │      │ ctx │      │ ctx │      │ ctx │         │  │
│  │  └──┬──┘      └──┬──┘      └──┬──┘      └──┬──┘         │  │
│  │     └────────────┴────────────┴────────────┘            │  │
│  │                       │                                   │  │
│  │     ┌─────────────────▼──────────────────┐               │  │
│  │     │   I/O Scheduler (optional)         │               │  │
│  │     │   - BFQ / mq-deadline / kyber      │               │  │
│  │     └─────────────────┬──────────────────┘               │  │
│  │                       │                                   │  │
│  │     ┌─────────────────▼──────────────────┐               │  │
│  │     │   Hardware Queue Context (hctx)    │               │  │
│  │     │   HW Queue 0  HW Queue 1  ...      │               │  │
│  │     └─────────────────┬──────────────────┘               │  │
│  │                       │                                   │  │
│  │     ┌─────────────────▼──────────────────┐               │  │
│  │     │   struct request (tag-based)       │               │  │
│  │     │   - Bio list                       │               │  │
│  │     │   - Tag ID                         │               │  │
│  │     └─────────────────┬──────────────────┘               │  │
│  └───────────────────────┼────────────────────────────────────┘
│                          │ queue_rq()                           │
└──────────────────────────┼──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                  STORAGE DRIVERS                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  NVMe Driver (drivers/nvme/host/)                          │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │ │
│  │  │ Queue 0  │  │ Queue 1  │  │ Queue 2  │  │ Queue N  │  │ │
│  │  │ (Admin)  │  │  (I/O)   │  │  (I/O)   │  │  (I/O)   │  │ │
│  │  │          │  │          │  │          │  │          │  │ │
│  │  │ SQ + CQ  │  │ SQ + CQ  │  │ SQ + CQ  │  │ SQ + CQ  │  │ │
│  │  │ (DMA)    │  │ (DMA)    │  │ (DMA)    │  │ (DMA)    │  │ │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │ │
│  │       │             │             │             │         │ │
│  │       └─────────────┴─────────────┴─────────────┘         │ │
│  │                          │                                 │ │
│  │        ┌─────────────────▼──────────────────┐             │ │
│  │        │  Doorbell Writes (MMIO)            │             │ │
│  │        │  writel(sq_tail, doorbell_reg)     │             │ │
│  │        └─────────────────┬──────────────────┘             │ │
│  └──────────────────────────┼────────────────────────────────┘ │
└───────────────────────────┼───────────────────────────────────┘
                            │ PCIe Bus
┌───────────────────────────▼─────────────────────────────────────┐
│                     HARDWARE LAYER                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  NVMe SSD Controller                                       │ │
│  │  ├─ DMA Engine (reads SQ, writes CQ)                       │ │
│  │  ├─ Flash Translation Layer (FTL)                          │ │
│  │  ├─ NAND Flash Array                                       │ │
│  │  └─ MSI-X Interrupt Generation                             │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘

         ┌─────────────────────────────────────┐
         │  Interrupt Flow (Completion)        │
         │                                     │
         │  1. Device writes CQ entry (DMA)   │
         │  2. Device raises MSI-X IRQ        │
         │  3. nvme_irq() processes CQ        │
         │  4. blk_mq_complete_request()      │
         │  5. bio_endio() callback           │
         │  6. Filesystem completion          │
         └─────────────────────────────────────┘
```

---

## 🔷 Call Graph: NVMe I/O Lifecycle

```
submit_bio(bio)
    │
    ├─→ blk_mq_submit_bio()
    │     ├─→ blk_mq_get_request() [allocate from tag pool]
    │     ├─→ blk_init_request_from_bio() [convert bio → request]
    │     ├─→ blk_mq_sched_insert_request() [insert to scheduler]
    │     └─→ blk_mq_run_hw_queue() [trigger dispatch]
    │           └─→ blk_mq_dispatch_rq_list()
    │                 └─→ nvme_queue_rq() ──────────┐
    │                                               │
    │                                               ▼
    │                              ┌────────────────────────────┐
    │                              │  NVMe Driver (queue_rq)    │
    │                              │  1. nvme_setup_cmd()        │
    │                              │  2. nvme_map_data()         │
    │                              │  3. Write cmd to SQ         │
    │                              │  4. writel(doorbell)        │
    │                              └────────────────────────────┘
    │                                               │
    │                                               ▼
    │                              ┌────────────────────────────┐
    │                              │  NVMe Device               │
    │                              │  1. DMA read SQ            │
    │                              │  2. Execute I/O            │
    │                              │  3. DMA write CQ           │
    │                              │  4. Raise MSI-X IRQ        │
    │                              └────────────────────────────┘
    │                                               │
    │                                               ▼
    └─────────────────────────────────> nvme_irq() [interrupt handler]
                                              │
                                              ├─→ nvme_process_cq()
                                              ├─→ nvme_complete_rq()
                                              └─→ blk_mq_complete_request()
                                                    └─→ blk_mq_end_request()
                                                          └─→ bio_endio()
                                                                └─→ bio->bi_end_io()
                                                                      └─→ [Filesystem callback]
                                                                            └─→ Wake up waiters
                                                                                  └─→ I/O complete
```

---

**END OF STORAGE SUBSYSTEM DOCUMENTATION**
