# Linux VFS (Virtual File System) Subsystem
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
The VFS provides a **unified abstraction layer** that allows the kernel and userspace programs to interact with different filesystem types (ext4, XFS, btrfs, NFS, procfs, etc.) through a **single, consistent API**. It decouples filesystem-agnostic operations from filesystem-specific implementations.

### Position in System Architecture
```
┌─────────────────────────────────────────┐
│     User Space (applications)           │
│     open(), read(), write(), stat()     │
└─────────────────┬───────────────────────┘
                  │ System Calls
┌─────────────────▼───────────────────────┐
│          VFS Layer (fs/)                 │
│  - Path resolution (namei.c)             │
│  - File operations dispatch              │
│  - Dentry/Inode caching                  │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│ Block Layer   │   │ Network Stack    │
│ (local FS)    │   │ (network FS)     │
└───────────────┘   └──────────────────┘
```

### Interaction with Other Subsystems
- **Memory Management (mm/)**: Page cache, mmap(), buffer heads
- **Block Layer (block/)**: I/O submission for block-based filesystems
- **Network Stack (net/)**: Network filesystems (NFS, CIFS)
- **Security (security/)**: LSM hooks for access control
- **Namespace (kernel/)**: Mount namespaces for containerization

---

## 2️⃣ Directory Mapping

```
fs/
├── namei.c              # Path resolution (pathname → inode lookup)
├── open.c               # File opening logic
├── read_write.c         # read(), write(), pread(), pwrite()
├── inode.c              # Inode operations
├── dcache.c             # Dentry cache
├── file_table.c         # File descriptor table management
├── super.c              # Superblock operations
├── namespace.c          # Mount namespace management
├── stat.c               # stat(), fstat() system calls
├── splice.c             # Splice/sendfile operations
├── select.c             # select(), poll(), epoll()
├── pipe.c               # Pipe implementation
├── locks.c              # File locking (flock, fcntl)
├── buffer.c             # Buffer head management
├── mpage.c              # Multi-page I/O
├── direct-io.c          # Direct I/O (O_DIRECT)
├── aio.c                # Asynchronous I/O
├── io_uring.c           # io_uring interface
├── iomap/               # Modern I/O mapping framework
├── ext4/                # ext4 filesystem
├── xfs/                 # XFS filesystem
├── btrfs/               # btrfs filesystem
├── nfs/                 # NFS client
├── overlayfs/           # Overlay filesystem (containers)
├── proc/                # /proc filesystem
├── sysfs/               # /sys filesystem
└── debugfs/             # Debug filesystem
```

---

## 3️⃣ Core Source Files

| File | Purpose |
|------|---------|
| `fs/namei.c` | **Path resolution** - Converts pathname to dentry/inode |
| `fs/open.c` | **File opening** - Implements open(), creat() syscalls |
| `fs/read_write.c` | **I/O operations** - read(), write(), lseek() |
| `fs/dcache.c` | **Dentry cache** - Caches pathname → inode mappings |
| `fs/inode.c` | **Inode management** - Inode allocation, lifecycle |
| `fs/file_table.c` | **File descriptor table** - Per-process fd management |
| `fs/super.c` | **Superblock operations** - Filesystem mounting |
| `fs/namespace.c` | **Mount management** - Mount namespace operations |
| `fs/buffer.c` | **Buffer heads** - Legacy buffer cache |
| `fs/direct-io.c` | **Direct I/O** - Bypasses page cache |
| `fs/splice.c` | **Zero-copy I/O** - splice(), sendfile() |
| `fs/iomap/` | **Modern I/O path** - Unified I/O mapping for filesystems |

---

## 4️⃣ Core Data Structures

### struct super_block (include/linux/fs.h)
**Purpose**: Represents a mounted filesystem instance

**Key Fields**:
```c
struct super_block {
    struct list_head    s_list;           // Link in global superblock list
    dev_t               s_dev;            // Device identifier
    unsigned long       s_blocksize;      // Block size (512, 1024, 4096, etc.)
    loff_t              s_maxbytes;       // Max file size
    struct file_system_type *s_type;      // Filesystem type (ext4, xfs, etc.)
    const struct super_operations *s_op;  // Superblock operations
    struct dentry       *s_root;          // Root dentry of this mount
    struct rw_semaphore s_umount;         // Unmount lock
    int                 s_count;          // Reference count
    atomic_t            s_active;         // Active reference count
    struct list_head    s_inodes;         // List of all inodes
    struct hlist_bl_head s_roots;         // Dcache roots
    struct list_head    s_mounts;         // List of mounts
    struct block_device *s_bdev;          // Associated block device
    void                *s_fs_info;       // Filesystem-specific data
    unsigned int        s_flags;          // Mount flags (MS_RDONLY, etc.)
};
```

**Lifetime**: Created during mount, destroyed during unmount
**Ownership**: Managed by VFS mount subsystem
**Locking**: `s_umount` rwsem protects unmount operations
**Reference Counting**: `s_count` for structural refs, `s_active` for active refs

---

### struct inode (include/linux/fs.h)
**Purpose**: Represents a filesystem object (file, directory, device, etc.)

**Key Fields**:
```c
struct inode {
    umode_t             i_mode;           // File type and permissions
    unsigned short      i_opflags;        // Opcode flags
    kuid_t              i_uid;            // User ID
    kgid_t              i_gid;            // Group ID
    unsigned int        i_flags;          // Inode flags
    const struct inode_operations *i_op;  // Inode operations
    struct super_block  *i_sb;            // Associated superblock
    struct address_space *i_mapping;      // Page cache mapping
    unsigned long       i_ino;            // Inode number
    atomic_t            i_count;          // Reference count
    unsigned int        i_nlink;          // Hard link count
    dev_t               i_rdev;           // Device number (if device file)
    loff_t              i_size;           // File size in bytes
    struct timespec64   i_atime;          // Last access time
    struct timespec64   i_mtime;          // Last modification time
    struct timespec64   i_ctime;          // Last change time
    spinlock_t          i_lock;           // Protects inode fields
    unsigned short      i_bytes;          // Bytes consumed
    blkcnt_t            i_blocks;         // File size in blocks
    const struct file_operations *i_fop;  // File operations
    struct address_space i_data;          // Page cache for file data
    struct list_head    i_lru;            // LRU list for eviction
    struct list_head    i_sb_list;        // Superblock's inode list
    union {
        struct hlist_head   i_dentry;     // List of dentries (hard links)
        struct rcu_head     i_rcu;        // RCU delayed free
    };
    atomic64_t          i_version;        // Version number
    void                *i_private;       // Filesystem-specific data
};
```

**Lifetime**: Created on first access, cached in memory, evicted when memory pressure occurs
**Ownership**: Referenced by dentries, file structs, and page cache
**Locking**: `i_lock` spinlock protects most fields; `i_rwsem` for read/write serialization
**Reference Counting**: `i_count` atomic reference counter

---

### struct dentry (include/linux/dcache.h)
**Purpose**: Represents a directory entry (pathname component cache)

**Key Fields**:
```c
struct dentry {
    unsigned int        d_flags;          // Dentry flags
    seqcount_spinlock_t d_seq;            // Sequence lock for RCU
    struct hlist_bl_node d_hash;          // Hash list for quick lookup
    struct dentry       *d_parent;        // Parent dentry
    struct qstr         d_name;           // Name of this entry
    struct inode        *d_inode;         // Associated inode (NULL if negative)
    unsigned char       d_iname[DNAME_INLINE_LEN]; // Inline name storage
    struct lockref      d_lockref;        // Lock + reference count
    const struct dentry_operations *d_op; // Dentry operations
    struct super_block  *d_sb;            // Superblock
    unsigned long       d_time;           // Revalidation time
    void                *d_fsdata;        // Filesystem-specific data
    union {
        struct list_head d_lru;           // LRU list
        wait_queue_head_t *d_wait;        // Wait queue
    };
    struct list_head    d_child;          // Child of parent list
    struct list_head    d_subdirs;        // Subdirectories list
    struct hlist_node   d_alias;          // Inode alias list
    struct rcu_head     d_rcu;            // RCU delayed free
};
```

**Lifetime**: Created during pathname lookup, cached indefinitely (unless memory pressure)
**Ownership**: Referenced by parent dentry and child processes
**Locking**: `d_lockref` combines spinlock and refcount; RCU for lockless reads
**Reference Counting**: Embedded in `d_lockref` structure

**Negative Dentries**: Dentries with `d_inode == NULL` cache failed lookups for performance

---

### struct file (include/linux/fs.h)
**Purpose**: Represents an open file descriptor in a process

**Key Fields**:
```c
struct file {
    struct path         f_path;           // Dentry and vfsmount
    struct inode        *f_inode;         // Cached inode pointer
    const struct file_operations *f_op;   // File operations
    spinlock_t          f_lock;           // Protects f_* fields
    atomic_long_t       f_count;          // Reference count
    unsigned int        f_flags;          // O_RDONLY, O_NONBLOCK, etc.
    fmode_t             f_mode;           // FMODE_READ, FMODE_WRITE
    loff_t              f_pos;            // Current file position
    struct fown_struct  f_owner;          // Owner for signals
    const struct cred   *f_cred;          // Credentials at open time
    struct file_ra_state f_ra;            // Readahead state
    u64                 f_version;        // Version number
    void                *private_data;    // Filesystem/driver private data
    struct address_space *f_mapping;      // Page cache mapping
};
```

**Lifetime**: Created by open(), destroyed by close() (when refcount reaches 0)
**Ownership**: Referenced by process file descriptor table, may be shared (dup, fork)
**Locking**: `f_lock` spinlock protects position and flags
**Reference Counting**: `f_count` atomic counter

---

### struct file_operations (include/linux/fs.h)
**Purpose**: Function pointers for file-specific operations

**Key Operations**:
```c
struct file_operations {
    loff_t (*llseek) (struct file *, loff_t, int);
    ssize_t (*read) (struct file *, char __user *, size_t, loff_t *);
    ssize_t (*write) (struct file *, const char __user *, size_t, loff_t *);
    ssize_t (*read_iter) (struct kiocb *, struct iov_iter *);
    ssize_t (*write_iter) (struct kiocb *, struct iov_iter *);
    int (*mmap) (struct file *, struct vm_area_struct *);
    int (*open) (struct inode *, struct file *);
    int (*release) (struct inode *, struct file *);
    int (*fsync) (struct file *, loff_t, loff_t, int);
    __poll_t (*poll) (struct file *, struct poll_table_struct *);
    long (*unlocked_ioctl) (struct file *, unsigned int, unsigned long);
    int (*flock) (struct file *, int, struct file_lock *);
    // ... more operations
};
```

**Purpose**: Each filesystem/driver provides its own implementation

---

## 5️⃣ Call Path Tracing

### Path 1: open() System Call
```
User Space:  fd = open("/home/user/file.txt", O_RDONLY);
              ↓
System Call: sys_openat() [fs/open.c]
              ↓
do_sys_openat() [fs/open.c]
              ↓
do_filp_open() [fs/namei.c]
              ↓
path_openat() [fs/namei.c]
    ├─→ path_init() - Initialize path lookup state
    ├─→ link_path_walk() - Walk pathname components
    │     └─→ walk_component()
    │           ├─→ lookup_fast() - Try dentry cache (fast path)
    │           └─→ lookup_slow() - Call filesystem lookup (slow path)
    │                 └─→ inode->i_op->lookup() - Filesystem-specific
    ├─→ do_last() - Handle final component
    │     └─→ vfs_open()
    │           └─→ do_dentry_open()
    │                 ├─→ inode->i_fop->open() - Filesystem-specific open
    │                 └─→ Allocate struct file
    └─→ Return file descriptor

Process FD Table: fd → struct file → dentry → inode
```

### Path 2: read() System Call
```
User Space:  ssize_t n = read(fd, buf, count);
              ↓
System Call: sys_read() [fs/read_write.c]
              ↓
ksys_read()
              ↓
vfs_read() [fs/read_write.c]
    ├─→ Check file mode (FMODE_READ)
    ├─→ rw_verify_area() - Security checks
    └─→ file->f_op->read_iter() - Dispatch to filesystem
          ↓
generic_file_read_iter() [mm/filemap.c] (common case)
    ├─→ Check for direct I/O
    ├─→ generic_file_buffered_read()
    │     ├─→ find_get_page() - Check page cache
    │     ├─→ If miss: page_cache_sync_readahead()
    │     │     └─→ inode->i_mapping->a_ops->readahead()
    │     │           └─→ mpage_readahead()
    │     │                 └─→ submit_bio() - To block layer
    │     └─→ copy_page_to_iter() - Copy to user space
    └─→ Update file position (f_pos)

Return: bytes read
```

### Path 3: write() System Call
```
User Space:  ssize_t n = write(fd, buf, count);
              ↓
System Call: sys_write() [fs/read_write.c]
              ↓
ksys_write()
              ↓
vfs_write() [fs/read_write.c]
    ├─→ Check file mode (FMODE_WRITE)
    ├─→ rw_verify_area()
    └─→ file->f_op->write_iter()
          ↓
generic_file_write_iter() [mm/filemap.c]
    ├─→ Check for direct I/O (O_DIRECT)
    ├─→ generic_perform_write()
    │     ├─→ grab_cache_page_write_begin()
    │     ├─→ inode->i_mapping->a_ops->write_begin()
    │     ├─→ copy_from_iter() - Copy from user space
    │     ├─→ inode->i_mapping->a_ops->write_end()
    │     └─→ Mark page dirty
    └─→ Update file position

Background Writeback:
    ├─→ wb_workfn() [mm/backing-dev.c]
    └─→ writeback_sb_inodes()
          └─→ __writeback_single_inode()
                └─→ do_writepages()
                      └─→ inode->i_mapping->a_ops->writepages()
                            └─→ mpage_writepages()
                                  └─→ submit_bio() - To block layer
```

### Path 4: stat() System Call
```
User Space:  struct stat st; stat("/path/to/file", &st);
              ↓
System Call: sys_newstat() [fs/stat.c]
              ↓
vfs_stat()
    ├─→ user_path_at() [fs/namei.c]
    │     └─→ filename_lookup()
    │           └─→ path_lookupat() - Same as open()
    └─→ vfs_getattr()
          ├─→ inode->i_op->getattr() - Filesystem may override
          └─→ generic_fillattr() - Fill stat structure
                ├─→ Copy inode fields to stat
                └─→ Return to user space
```

---

## 6️⃣ Concurrency Model

### Dentry Cache (dcache) Locking
- **RCU Read-Side**: Lockless pathname lookups using RCU
  ```c
  rcu_read_lock();
  dentry = __d_lookup_rcu(parent, name);
  rcu_read_unlock();
  ```
- **d_lockref**: Combined spinlock + refcount for efficiency
- **d_seq**: Sequence counter for detecting concurrent modifications
- **rename_lock**: Global seqlock for rename operations

### Inode Locking
- **i_lock**: Spinlock protecting inode fields
- **i_rwsem**: Read-write semaphore for serializing file I/O
  - Read: Shared lock for concurrent reads
  - Write: Exclusive lock for writes
- **RCU**: Used for inode destruction (call_rcu)

### File Position Locking
- **f_lock**: Spinlock protecting `f_pos` (file offset)
- **f_count**: Atomic reference counting

### Page Cache Locking
- **Page Lock (PG_locked)**: Exclusive access to a page
- **xa_lock**: XArray lock for radix tree modifications
- **i_pages**: XArray for page cache indexing

### Filesystem-Specific Locking
- **Journal locks**: For journaling filesystems (ext4, XFS)
- **Extent tree locks**: For extent-based filesystems
- **B-tree locks**: For metadata structures

### Lock Ordering (Deadlock Prevention)
```
1. rename_lock (global)
2. i_rwsem (parent → child order)
3. i_lock
4. page lock
5. xa_lock
```

### Per-CPU Optimizations
- **File descriptor allocation**: Per-CPU caching
- **Dentry allocation**: Per-CPU slab caches
- **Statistics**: Per-CPU counters to avoid cacheline bouncing

### Softirq Context
- **Writeback**: Runs in process context (workqueues)
- **Page cache reclaim**: Can run in softirq (kswapd)

---

## 7️⃣ Memory Model

### Page Cache (mm/filemap.c)
**Purpose**: Cache file data in memory to avoid repeated disk I/O

**Allocator**: Uses page allocator (`alloc_pages()`) and XArray for indexing

**Key Operations**:
- `find_get_page()` - Lookup page in cache
- `add_to_page_cache_locked()` - Insert page into cache
- `delete_from_page_cache()` - Remove page from cache

**GFP Flags**:
- `GFP_KERNEL` - Normal allocation, may sleep
- `GFP_NOFS` - No filesystem recursion (used during writeback)
- `GFP_NOIO` - No I/O allowed (used during memory reclaim)

### Buffer Heads (Legacy)
**Purpose**: Manage block-sized I/O for block devices

**Allocator**: SLUB (`kmem_cache_alloc()`)

**Structure**:
```c
struct buffer_head {
    sector_t b_blocknr;        // Block number on device
    struct page *b_page;       // Associated page
    char *b_data;              // Pointer to data
    unsigned long b_state;     // BH_Uptodate, BH_Dirty, etc.
    // ...
};
```

**Use Cases**: Still used by ext4, but modern filesystems prefer iomap

### NUMA Awareness
- **Inode allocation**: Allocated on local NUMA node
- **Page cache**: Pages allocated on node where accessed
- **Dentry cache**: Per-node slab caches

### DMA Mapping
- **Direct I/O**: Uses `get_user_pages()` to pin user pages
- **DMA mapping API**: `dma_map_page()` for block layer

### Memory Reclaim Integration
- **Shrinkers**: Registered for dentry cache and inode cache
  ```c
  register_shrinker(&dcache_shrinker);
  register_shrinker(&inode_shrinker);
  ```
- **LRU Lists**: Dentries and inodes on LRU for eviction
- **Writeback**: Dirty pages written back under memory pressure

---

## 8️⃣ Hardware Interaction

VFS is **hardware-agnostic** but interacts with hardware through:

### Block Devices (via block layer)
```
VFS → bio submission → blk-mq → NVMe driver → NVMe device
```

### Network Devices (via network stack)
```
VFS (NFS) → RPC → TCP/IP → Network driver → NIC
```

### Memory-Mapped I/O
```
mmap() → vm_area_struct → Page fault → filemap_fault() → Read from storage
```

### Device Files
- **Character devices**: `/dev/tty`, `/dev/null`
- **Block devices**: `/dev/sda`, `/dev/nvme0n1`
- **Device numbers**: major:minor stored in `inode->i_rdev`

---

## 9️⃣ Performance Considerations

### Dentry Cache Efficiency
- **Inline names**: Small names (<36 bytes) stored inline (no allocation)
- **RCU lookup**: Lockless fast path for hot paths
- **Negative dentry caching**: Avoids repeated failed lookups

### Page Cache Hit Rate
- **Readahead**: Predictive prefetching (`page_cache_sync_readahead()`)
- **LRU eviction**: Keeps hot data in memory
- **Direct I/O**: Bypasses cache for streaming workloads (O_DIRECT)

### Lock Contention Hotspots
- **rename_lock**: Global rename lock can bottleneck on rename-heavy workloads
- **i_rwsem**: Per-inode, but can serialize writers
- **Parent directory i_rwsem**: Bottleneck for creates/deletes in same directory

### NUMA Locality
- **Local allocation**: Allocate inodes/dentries on local node
- **Page cache locality**: File data allocated on accessing node

### Cacheline Alignment
- **struct file**: Hot fields grouped to minimize cacheline bouncing
- **struct dentry**: Frequently accessed fields in first cacheline

### Scalability Optimizations
- **Per-CPU statistics**: Avoid atomic operations for stats
- **RCU for reads**: Scale read-side operations
- **Fine-grained locking**: Per-inode locks instead of global

### I/O Merging
- **Writeback clustering**: Merge adjacent dirty pages into single I/O
- **Readahead**: Fetch multiple pages in single request

### Scheduler Fairness vs Throughput
- **CFQ I/O scheduler**: Fairness-focused
- **mq-deadline**: Latency-focused
- **none**: Raw throughput (for fast NVMe devices)

---

## 🔷 ASCII Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER SPACE                                │
│   Process 1          Process 2         Process 3             │
│   fd=3,4,5          fd=3,4,6           fd=3,7                │
└─────────┬───────────────┬──────────────────┬────────────────┘
          │               │                  │
          │  System Calls (open, read, write, stat, etc.)
          │               │                  │
┌─────────▼───────────────▼──────────────────▼────────────────┐
│                    VFS LAYER (fs/)                           │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Path Resolution (namei.c)                             │ │
│  │  /home/user/file.txt → dentry chain → inode           │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Dentry Cache │  │ Inode Cache  │  │ Page Cache   │      │
│  │  (dcache.c)  │  │  (inode.c)   │  │ (filemap.c)  │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  struct file → struct dentry → struct inode            │ │
│  │      ↓               ↓                 ↓               │ │
│  │  file_operations  dentry_ops    inode_operations       │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────┘
                           │
         ┌─────────────────┴──────────────────┐
         │                                    │
┌────────▼─────────┐              ┌───────────▼──────────┐
│  Filesystem      │              │  Filesystem          │
│  Implementations │              │  Implementations     │
│                  │              │                      │
│  ext4/           │              │  nfs/                │
│  xfs/            │              │  cifs/               │
│  btrfs/          │              │  procfs/             │
│  f2fs/           │              │  sysfs/              │
└────────┬─────────┘              └───────────┬──────────┘
         │                                    │
┌────────▼─────────┐              ┌───────────▼──────────┐
│   Block Layer    │              │   Network Stack      │
│   (block/)       │              │   (net/)             │
└────────┬─────────┘              └───────────┬──────────┘
         │                                    │
┌────────▼─────────┐              ┌───────────▼──────────┐
│  Storage Drivers │              │  Network Drivers     │
│  (nvme, scsi)    │              │  (ethernet, wifi)    │
└────────┬─────────┘              └───────────┬──────────┘
         │                                    │
┌────────▼─────────┐              ┌───────────▼──────────┐
│  Hardware        │              │  Hardware            │
│  (SSD, HDD)      │              │  (NIC)               │
└──────────────────┘              └──────────────────────┘
```

---

**END OF VFS DOCUMENTATION**
