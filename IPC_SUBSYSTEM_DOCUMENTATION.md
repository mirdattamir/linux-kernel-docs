# Linux IPC (Inter-Process Communication) Subsystem
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
The IPC subsystem provides mechanisms for processes to communicate and synchronize with each other. It implements multiple IPC paradigms: System V IPC (shared memory, semaphores, message queues), POSIX IPC, pipes (anonymous and named), Unix domain sockets, signals, and futexes (fast userspace mutexes). These primitives enable processes to share data, coordinate access to shared resources, pass messages, and implement complex synchronization patterns essential for multi-process applications.

### Position in System Architecture
```
┌─────────────────────────────────────────┐
│   User Space Applications                │
│   shmget(), msgget(), semget(), pipe()   │
└─────────────────┬───────────────────────┘
                  │ System calls
┌─────────────────▼───────────────────────┐
│     IPC SUBSYSTEM                        │
│  - System V Shared Memory (shmget/shmat) │
│  - System V Semaphores (semget/semop)    │
│  - System V Message Queues (msgget/msgsnd)│
│  - POSIX Shared Memory (shm_open)        │
│  - POSIX Semaphores (sem_open)           │
│  - POSIX Message Queues (mq_open)        │
│  - Pipes & FIFOs (pipe, mkfifo)          │
│  - Futexes (futex syscall)               │
│  - Signals (kill, sigaction)             │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│  Memory       │   │  Scheduler       │
│  Management   │   │  (wait queues)   │
└───────────────┘   └──────────────────┘
```

### Interaction with Other Subsystems
- **Memory Management**: Shared memory regions (shmem), page cache for POSIX shared memory
- **VFS**: POSIX IPC implemented as pseudo-filesystems (mqueue, shm)
- **Scheduler**: Wait queues for blocking operations, futex wait/wake
- **Security**: IPC permissions, SELinux controls on IPC objects
- **Namespaces**: IPC namespace isolation (containers)

---

## 2️⃣ Directory Mapping

```
ipc/
├── util.c                 # Common IPC utilities, namespace support
├── util.h                 # IPC internal definitions
├── shm.c                  # System V shared memory
├── msg.c                  # System V message queues
├── sem.c                  # System V semaphores
├── mqueue.c               # POSIX message queues
├── namespace.c            # IPC namespace implementation
└── syscall.c              # IPC system call wrappers

fs/pipe.c                  # Pipes and FIFOs
kernel/futex.c             # Fast userspace mutexes
kernel/signal.c            # Signal handling

mm/shmem.c                 # Shared memory (tmpfs) backing
```

---

## 3️⃣ Core Source Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| ipc/shm.c | System V shared memory | sys_shmget(), sys_shmat(), sys_shmdt(), sys_shmctl() |
| ipc/sem.c | System V semaphores | sys_semget(), sys_semop(), sys_semtimedop(), sys_semctl() |
| ipc/msg.c | System V message queues | sys_msgget(), sys_msgsnd(), sys_msgrcv(), sys_msgctl() |
| ipc/mqueue.c | POSIX message queues | sys_mq_open(), sys_mq_send(), sys_mq_receive() |
| fs/pipe.c | Pipes and FIFOs | sys_pipe(), sys_pipe2(), pipe_read(), pipe_write() |
| kernel/futex.c | Futexes (fast mutexes) | sys_futex(), futex_wait(), futex_wake() |
| kernel/signal.c | Signals | sys_kill(), sys_rt_sigaction(), do_signal() |
| mm/shmem.c | tmpfs/shared memory | shmem_file_setup(), shmem_read_mapping_page() |

---

## 4️⃣ Core Data Structures

### Structure 1: `struct shmid_kernel` (System V Shared Memory)

**Purpose**: Represents a System V shared memory segment

**Definition** (`ipc/shm.c`):
```c
struct shmid_kernel {
    struct kern_ipc_perm    shm_perm;     // Permissions
    struct file             *shm_file;    // Backing file (tmpfs)
    unsigned long           shm_nattch;   // Number of attaches
    unsigned long           shm_segsz;    // Segment size
    time64_t                shm_atim;     // Last attach time
    time64_t                shm_dtim;     // Last detach time
    time64_t                shm_ctim;     // Last change time
    struct pid              *shm_cprid;   // Creator PID
    struct pid              *shm_lprid;   // Last operator PID
    struct user_struct      *mlock_user;  // User for locked pages
    struct task_struct      *shm_creator; // Creator task
    struct list_head        shm_clist;    // Creator's attached list
};
```

**Key Fields**:
| Field | Type | Purpose |
|-------|------|---------|
| `shm_perm` | `struct kern_ipc_perm` | Permissions (uid, gid, mode, key) |
| `shm_file` | `struct file *` | Backing file in tmpfs providing actual memory |
| `shm_nattch` | `unsigned long` | Count of processes with segment attached |
| `shm_segsz` | `unsigned long` | Size of segment in bytes |

**Lifetime**: Created by shmget(), destroyed when no processes attached and marked for deletion

---

### Structure 2: `struct sem_array` (System V Semaphore Set)

**Purpose**: Represents a set of System V semaphores

**Definition** (`ipc/sem.c`):
```c
struct sem_array {
    struct kern_ipc_perm    sem_perm;     // Permissions
    time64_t                sem_ctime;    // Last change time
    struct list_head        pending_alter; // Pending operations (alter)
    struct list_head        pending_const; // Pending operations (read)
    struct list_head        list_id;      // IPC namespace list
    int                     sem_nsems;    // Number of semaphores in set
    int                     complex_count; // Complex operations count
    unsigned int            use_global_lock; // Use global lock flag
    spinlock_t              sem_lock;     // Semaphore array lock

    struct sem              sems[];       // Actual semaphores (flexible array)
};

struct sem {
    int     semval;         // Semaphore value
    int     sempid;         // PID of last operation
    spinlock_t lock;        // Per-semaphore lock
    struct list_head pending_alter;
    struct list_head pending_const;
};
```

**Key Concept**: Each semaphore has a value. semop() atomically modifies values. If operation would block (e.g., decrement below 0), process sleeps on pending list.

---

### Structure 3: `struct msg_queue` (System V Message Queue)

**Purpose**: Represents a System V message queue

**Definition** (`ipc/msg.c`):
```c
struct msg_queue {
    struct kern_ipc_perm    q_perm;       // Permissions
    time64_t                q_stime;      // Last send time
    time64_t                q_rtime;      // Last receive time
    time64_t                q_ctime;      // Last change time
    unsigned long           q_cbytes;     // Current bytes in queue
    unsigned long           q_qnum;       // Number of messages
    unsigned long           q_qbytes;     // Max bytes allowed
    struct pid              *q_lspid;     // PID of last sender
    struct pid              *q_lrpid;     // PID of last receiver

    struct list_head        q_messages;   // List of messages
    struct list_head        q_receivers;  // Waiting receivers
    struct list_head        q_senders;    // Waiting senders
};

struct msg_msg {
    struct list_head m_list;
    long m_type;                          // Message type
    size_t m_ts;                          // Message text size
    struct msg_msgseg *next;              // Next segment (large messages)
    void *security;                       // Security context
    /* message data follows */
};
```

**Key Concept**: Messages have type (long integer). msgrcv() can selectively receive messages by type (FIFO within type).

---

### Structure 4: `struct pipe_inode_info` (Pipes)

**Purpose**: Represents a pipe (anonymous or named FIFO)

**Definition** (`include/linux/pipe_fs_i.h`):
```c
struct pipe_inode_info {
    struct mutex            mutex;        // Pipe lock
    wait_queue_head_t       rd_wait;      // Readers wait here
    wait_queue_head_t       wr_wait;      // Writers wait here
    unsigned int            head;         // Write position
    unsigned int            tail;         // Read position
    unsigned int            max_usage;    // Max buffers used
    unsigned int            ring_size;    // Number of buffers (power of 2)
    unsigned int            nr_accounted; // Accounted buffers
    unsigned int            readers;      // Number of readers
    unsigned int            writers;      // Number of writers
    unsigned int            files;        // File count
    unsigned int            r_counter;    // Reader counter
    unsigned int            w_counter;    // Writer counter
    struct page             *tmp_page;    // Temp page for writes
    struct fasync_struct    *fasync_readers;
    struct fasync_struct    *fasync_writers;
    struct pipe_buffer      *bufs;        // Circular buffer of pipe_buffer
    struct user_struct      *user;        // User for accounting
};

struct pipe_buffer {
    struct page *page;                    // Page holding data
    unsigned int offset;                  // Offset in page
    unsigned int len;                     // Bytes in this buffer
    const struct pipe_buf_operations *ops;
    unsigned int flags;
    unsigned long private;
};
```

**Key Concept**: Ring buffer of pages. Writers add data at head, readers consume from tail. Blocks when full (writers) or empty (readers).

---

### Structure 5: `struct futex_hash_bucket` (Futexes)

**Purpose**: Hash table bucket for futex wait queues

**Definition** (`kernel/futex.c`):
```c
struct futex_hash_bucket {
    atomic_t waiters;                     // Waiters count
    spinlock_t lock;                      // Bucket lock
    struct plist_head chain;              // Priority list of waiters
};

struct futex_q {
    struct plist_node list;               // Priority list node
    struct task_struct *task;             // Waiting task
    spinlock_t *lock_ptr;                 // Lock pointer
    union futex_key key;                  // Futex key (address hash)
    struct futex_pi_state *pi_state;      // Priority inheritance state
    struct rt_mutex_waiter *rt_waiter;
    union futex_key *requeue_pi_key;
    u32 bitset;                           // Bitset for wake
};
```

**Key Concept**: Futexes are userspace atomic variables. Fast path: CAS in userspace. Slow path: futex() syscall to sleep/wake. Kernel maintains wait queue hashed by address.

---

## 5️⃣ Call Path Tracing

### Path 1: System V Shared Memory (shmget + shmat)

**Overview**: Create and attach shared memory segment

```
User Space: shmget(IPC_PRIVATE, size, IPC_CREAT | 0666)
              ↓
System Call: sys_shmget()                           [ipc/shm.c:689]
              ↓
ksys_shmget()                                       [ipc/shm.c:674]
  ├→ ipc_obtain_object_check()                      // Check if key exists
  └→ newseg()                                       [ipc/shm.c:614] // Create new segment
      ├→ ipc_rcu_alloc()                            // Allocate shmid_kernel
      ├→ shmem_kernel_file_setup()                  [mm/shmem.c:4535] // Create tmpfs file
      │   └→ __shmem_file_setup()                   [mm/shmem.c:4485]
      │       ├→ shmem_get_inode()                  // Allocate inode
      │       └→ alloc_file_pseudo()                // Create file
      ├→ shm->shm_file = file
      ├→ ipc_addid()                                // Add to namespace
      └→ return shmid
              ↓
User Space: shmat(shmid, NULL, 0)
              ↓
System Call: sys_shmat()                            [ipc/shm.c:1676]
              ↓
do_shmat()                                          [ipc/shm.c:1551]
  ├→ shm_obtain_object()                            // Get shmid_kernel by ID
  ├→ ipcperms()                                     // Check permissions
  ├→ shm_file = shp->shm_file
  ├→ do_mmap()                                      [mm/mmap.c] // Map file into address space
  │   └→ mmap_region()                              // Create VMA
  ├→ shm->shm_nattch++                              // Increment attach count
  └→ return vma->vm_start                           // Return address
              ↓
User Space: Shared memory accessible at returned address
```

**Detailed Function Information**:

#### `newseg()`
- **File**: `ipc/shm.c:614`
- **Purpose**: Create new System V shared memory segment
- **Parameters**:
  - `struct ipc_namespace *ns` - IPC namespace
  - `struct ipc_params *params` - Parameters (key, size, flags)
- **Return**: `int` - Segment ID or error
- **Description**: Allocates shmid_kernel structure. Creates backing file in tmpfs via shmem_kernel_file_setup(). Assigns unique ID. Adds to namespace's shared memory list. Initializes permissions, timestamps. Returns segment ID to userspace.

#### `do_shmat()`
- **File**: `ipc/shm.c:1551`
- **Purpose**: Attach shared memory segment to process address space
- **Parameters**:
  - `int shmid` - Segment ID
  - `char __user *shmaddr` - Desired address (NULL for automatic)
  - `int shmflg` - Flags (SHM_RDONLY, SHM_REMAP, etc.)
- **Return**: `long` - Virtual address or error
- **Description**: Looks up segment by ID. Checks permissions. Calls do_mmap() to map backing file into process address space. Increments attach count. Returns virtual address where segment mapped. Process can now access shared memory directly.

---

### Path 2: System V Semaphores (semget + semop)

**Overview**: Create semaphore set and perform atomic operations

```
User Space: semget(IPC_PRIVATE, nsems, IPC_CREAT | 0666)
              ↓
System Call: sys_semget()                           [ipc/sem.c:594]
              ↓
ksys_semget()                                       [ipc/sem.c:579]
  └→ newary()                                       [ipc/sem.c:554] // Create semaphore array
      ├→ ipc_rcu_alloc()                            // Allocate sem_array
      ├→ Initialize semaphores (semval = 0, sempid = 0)
      ├→ INIT_LIST_HEAD(&sma->pending_alter)
      ├→ ipc_addid()                                // Add to namespace
      └→ return semid
              ↓
User Space: semop(semid, sembuf, nsops)
              ↓
System Call: sys_semop()                            [ipc/sem.c:2262]
              ↓
sys_semtimedop()                                    [ipc/sem.c:2232]
  └→ do_semtimedop()                                [ipc/sem.c:2070]
      ├→ sem_obtain_object()                        // Get sem_array
      ├→ ipcperms()                                 // Check permissions
      ├→ perform_atomic_semop()                     [ipc/sem.c:734] // Try atomic operations
      │   ├→ For each sembuf: check if operation can proceed
      │   ├→ If any would block: return -EAGAIN
      │   └→ If all OK: update semval, sempid, wakeup waiters
      └→ If would block:
          ├→ queue = kmalloc(sizeof(*queue))        // Allocate pending operation
          ├→ list_add_tail(&queue->list, &sma->pending_alter)
          └→ schedule_timeout()                     // Sleep until woken
              ↓
Return: 0 on success
```

**Detailed Function Information**:

#### `do_semtimedop()`
- **File**: `ipc/sem.c:2070`
- **Purpose**: Perform atomic semaphore operations (P/V operations)
- **Parameters**:
  - `int semid` - Semaphore set ID
  - `struct sembuf __user *sops` - Operations array
  - `unsigned nsops` - Number of operations
  - `const struct timespec64 *timeout` - Timeout (NULL for infinite)
- **Return**: `long` - 0 on success, error code on failure
- **Description**: Validates operations. Attempts to perform all operations atomically. If any operation would block (e.g., decrement semaphore below 0), adds to pending queue and sleeps. When woken (by another semop that may unblock us), retries. Implements SysV semaphore semantics with undo support.

#### `perform_atomic_semop()`
- **File**: `ipc/sem.c:734`
- **Purpose**: Try to perform semaphore operations atomically (no sleep)
- **Parameters**:
  - `struct sem_array *sma` - Semaphore array
  - `struct sem_queue *q` - Pending queue entry
- **Return**: `int` - 0 if successful, 1 if would block
- **Description**: Checks if all operations can complete without blocking. For each operation: if sem_op > 0 (V), add to semval; if sem_op < 0 (P), check if semval + sem_op >= 0, else would block; if sem_op == 0, check if semval == 0. If all pass, applies changes and wakes pending operations.

---

### Path 3: Pipes (pipe + read/write)

**Overview**: Create pipe and transfer data

```
User Space: pipe(pipefd)
              ↓
System Call: sys_pipe2()                            [fs/pipe.c:998]
              ↓
do_pipe2()                                          [fs/pipe.c:952]
  ├→ create_pipe_files()                            [fs/pipe.c:897]
  │   ├→ alloc_pipe_info()                          [fs/pipe.c:780] // Allocate pipe_inode_info
  │   │   ├→ Allocate pipe->bufs (16 buffers default)
  │   │   └→ init_waitqueue_head(&pipe->rd_wait, &pipe->wr_wait)
  │   ├→ anon_inode_getfile("[pipe]", &pipefifo_fops) // Create file for read end
  │   └→ anon_inode_getfile("[pipe]", &pipefifo_fops) // Create file for write end
  ├→ fd_install(fdr, fr)                            // Install read fd
  ├→ fd_install(fdw, fw)                            // Install write fd
  └→ copy_to_user(pipefd, [fdr, fdw])               // Return fds to user
              ↓
User Space (Writer): write(pipefd[1], buf, len)
              ↓
VFS: vfs_write()                                    [fs/read_write.c]
  └→ pipe_write()                                   [fs/pipe.c:430]
      ├→ mutex_lock(&pipe->mutex)                   // Lock pipe
      ├→ while (len > 0):
      │   ├→ If pipe full: wake readers, wait on wr_wait
      │   ├→ buf = &pipe->bufs[head & (pipe->ring_size - 1)]
      │   ├→ copy_page_from_iter()                  // Copy from user to pipe buffer
      │   ├→ pipe->head++                           // Advance head
      │   └→ wake_up_interruptible(&pipe->rd_wait)  // Wake readers
      └→ mutex_unlock(&pipe->mutex)
              ↓
User Space (Reader): read(pipefd[0], buf, len)
              ↓
VFS: vfs_read()                                     [fs/read_write.c]
  └→ pipe_read()                                    [fs/pipe.c:262]
      ├→ mutex_lock(&pipe->mutex)
      ├→ while (len > 0):
      │   ├→ If pipe empty: wake writers, wait on rd_wait
      │   ├→ buf = &pipe->bufs[tail & (pipe->ring_size - 1)]
      │   ├→ copy_page_to_iter()                    // Copy from pipe buffer to user
      │   ├→ pipe->tail++                           // Advance tail
      │   └→ wake_up_interruptible(&pipe->wr_wait)  // Wake writers
      └→ mutex_unlock(&pipe->mutex)
              ↓
Return: Bytes written/read
```

**Detailed Function Information**:

#### `pipe_write()`
- **File**: `fs/pipe.c:430`
- **Purpose**: Write data to pipe
- **Parameters**:
  - `struct kiocb *iocb` - I/O control block
  - `struct iov_iter *from` - Source data iterator
- **Return**: `ssize_t` - Bytes written or error
- **Description**: Acquires pipe lock. Tries to copy data from user to pipe buffers. If pipe full (head == tail + ring_size), wakes readers and sleeps on wr_wait. When space available, allocates pipe_buffer page, copies data, advances head. Wakes readers. Handles partial writes, signals (SIGPIPE if no readers). Returns bytes written.

#### `pipe_read()`
- **File**: `fs/pipe.c:262`
- **Purpose**: Read data from pipe
- **Parameters**:
  - `struct kiocb *iocb` - I/O control block
  - `struct iov_iter *to` - Destination data iterator
- **Return**: `ssize_t` - Bytes read or error (0 for EOF)
- **Description**: Acquires pipe lock. If pipe empty (head == tail) and writers exist, sleeps on rd_wait. When data available, copies from pipe buffer to user, advances tail, wakes writers. If no writers and pipe empty, returns 0 (EOF). Handles partial reads, signals. Returns bytes read.

---

### Path 4: Futex Wait/Wake

**Overview**: Fast userspace mutex - wait and wake operations

```
User Space: Userspace atomic variable (*uaddr) = 0
            pthread_mutex_lock() tries CAS (0 → 1):
            If fails (contended):
              futex(uaddr, FUTEX_WAIT, 1, NULL)
              ↓
System Call: sys_futex()                            [kernel/futex.c:3992]
              ↓
do_futex()                                          [kernel/futex.c:3897]
  └→ futex_wait()                                   [kernel/futex.c:2838]
      ├→ get_futex_key()                            [kernel/futex.c:680] // Hash uaddr → key
      │   └→ Hash based on (mm, vaddr) or (inode, offset) for shared
      ├→ futex_hash(&key)                           // Hash key → bucket
      ├→ futex_setup_timer()                        // Setup timeout if needed
      ├→ __get_user(uval, uaddr)                    // Read current value
      ├→ if (uval != val) return -EWOULDBLOCK       // Fast path: value changed
      ├→ queue_lock(hb)                             // Lock hash bucket
      ├→ queue_me(&q, hb)                           // Add to wait queue
      ├→ queue_unlock(hb)
      └→ schedule()                                 // Sleep
          ↓ (Blocked until woken)

Another Thread: Releases mutex, wakes waiter:
            futex(uaddr, FUTEX_WAKE, 1)
              ↓
do_futex()
  └→ futex_wake()                                   [kernel/futex.c:1680]
      ├→ get_futex_key(uaddr)                       // Hash address
      ├→ futex_hash(&key)                           // Get bucket
      ├→ spin_lock(&hb->lock)
      ├→ plist_for_each_entry_safe(&hb->chain):     // Iterate waiters
      │   ├→ if (match_futex(&q->key, &key))        // Key matches?
      │   ├→ wake_q_add(&wake_q, q->task)           // Add to wake queue
      │   └→ if (++ret >= nr_wake) break            // Woke enough
      ├→ spin_unlock(&hb->lock)
      └→ wake_up_q(&wake_q)                         // Actually wake tasks
              ↓
Waiter wakes, returns from futex() → retries lock in userspace
```

**Detailed Function Information**:

#### `futex_wait()`
- **File**: `kernel/futex.c:2838`
- **Purpose**: Wait on futex (sleep until woken)
- **Parameters**:
  - `u32 __user *uaddr` - Futex address (userspace)
  - `unsigned int flags` - Flags (FUTEX_PRIVATE_FLAG, etc.)
  - `u32 val` - Expected value
  - `ktime_t *abs_time` - Absolute timeout
  - `u32 bitset` - Bitset for selective wake
- **Return**: `int` - 0 if woken, -ETIMEDOUT, -EWOULDBLOCK, etc.
- **Description**: Reads current value at uaddr. If not equal to val, returns immediately (value changed, lock available). Otherwise, adds current task to futex wait queue (hashed by address), sleeps. Woken by futex_wake() on same address. Handles timeouts, signals. Used by pthread_mutex, pthread_cond, etc.

#### `futex_wake()`
- **File**: `kernel/futex.c:1680`
- **Purpose**: Wake waiters on futex
- **Parameters**:
  - `u32 __user *uaddr` - Futex address
  - `unsigned int flags` - Flags
  - `int nr_wake` - Number of waiters to wake
  - `u32 bitset` - Bitset for selective wake
- **Return**: `int` - Number of waiters woken
- **Description**: Finds futex wait queue by hashing address. Iterates wait queue, wakes up to nr_wake waiters. Returns number woken. Typically nr_wake=1 for mutexes, INT_MAX for broadcasts (condition variables). Fast path if no waiters (empty queue).

---

## 6️⃣ Concurrency Model

### Locking Hierarchy

1. **IPC Namespace Lock**: `rw_semaphore` (`ipc_ns->sem`)
   - **Protects**: IPC namespace structure
   - **Acquired**: Rarely (namespace creation/destruction)

2. **IPC ID Lock**: `rw_semaphore` (`ids->rwsem`)
   - **Protects**: IPC ID allocation, namespace's IPC object list
   - **Acquired**: During IPC object creation/deletion, lookups

3. **IPC Object Lock**: (varies by type)
   - **Shared Memory**: No lock (uses file locks)
   - **Semaphores**: `spinlock_t` (`sem->lock`) per semaphore or global `sem_lock`
   - **Message Queues**: `spinlock_t` (`msq->q_perm.lock`)

4. **Futex Hash Bucket Lock**: `spinlock_t` (`hb->lock`)
   - **Protects**: Futex wait queue
   - **Acquired**: During futex_wait/wake

5. **Pipe Lock**: `mutex` (`pipe->mutex`)
   - **Protects**: Pipe buffer, head/tail pointers
   - **Acquired**: During read/write

### Synchronization Mechanisms

- **Wait Queues**: Used extensively (pipe readers/writers, semaphore waiters, message queue waiters)
- **Spinlocks**: Protect short critical sections (futex hash buckets, semaphore operations)
- **Mutexes**: Protect longer critical sections (pipe I/O)
- **RCU**: Used for IPC ID lookups (lockless fast path)

### Deadlock Avoidance

- **Lock Ordering**: Always acquire IPC namespace → IPC ID → IPC object locks in that order
- **Timeouts**: semtimedop(), msgrcv() support timeouts to avoid indefinite waits
- **Non-blocking Modes**: IPC_NOWAIT flag prevents blocking

---

## 7️⃣ Memory Model

### Allocation Patterns

- **System V IPC Objects**: Allocated via slab caches (ipc_rcu_alloc)
- **Shared Memory**: Backed by tmpfs (uses page cache, swappable)
- **Pipe Buffers**: Page allocations (alloc_page)
- **Message Queue Messages**: kmalloc for small messages, multiple segments for large

### GFP Flags

- `GFP_KERNEL`: Used for IPC object allocation (can sleep, can reclaim)
- `GFP_ATOMIC`: Used in interrupt context (rarely in IPC)

### Shared Memory Backing

System V and POSIX shared memory use tmpfs:
- **Advantages**: Swappable, benefits from page cache, file semantics
- **Implementation**: Regular file in tmpfs, mapped into process address spaces

### Memory Accounting

- **Pipe Buffers**: Accounted against user limits (`RLIMIT_PIPE`)
- **Shared Memory**: Counted in process RSS when attached
- **Message Queues**: Limited by `msgmnb` (max bytes per queue), `msgmni` (max queues)

---

## 8️⃣ Hardware Interaction

IPC subsystem has minimal direct hardware interaction:

- **Memory Barriers**: Used in futex operations for SMP correctness (userspace atomic operations + kernel wait queues must be synchronized)
- **Atomic Operations**: Futex relies on userspace atomics (CMPXCHG, etc.) for fast path
- **Cache Coherency**: Shared memory requires hardware cache coherency (x86 MESI protocol ensures all CPUs see writes)

**Futex and Hardware Atomics**:
```c
// Userspace fast path (no syscall):
if (atomic_cmpxchg(futex_word, 0, 1) == 0) {
    // Got lock without kernel
}

// Contended path (syscall):
futex(futex_word, FUTEX_WAIT, 1);
```

Hardware must guarantee:
- Atomic CAS operation
- Memory ordering (acquire/release semantics)
- Cache coherency across CPUs

---

## 9️⃣ Performance Considerations

### Critical Hot Paths

1. **Futex Fast Path**: Entirely in userspace (no syscall) when uncontended
   - **Optimization**: Single atomic instruction for lock/unlock

2. **Pipe I/O**: Circular buffer avoids data copying
   - **Optimization**: Zero-copy possible via splice()

3. **Shared Memory**: Direct memory access after attach
   - **Optimization**: No kernel involvement for reads/writes after shmat()

### Scalability Techniques

- **Per-Namespace IPC**: IPC namespaces allow isolation (containers)
- **Futex Hash Table**: Distributes waiters across buckets (reduces lock contention)
- **Per-Semaphore Locks**: Reduces contention on large semaphore arrays
- **RCU for Lookups**: Lockless IPC ID lookups in common case

### Optimization Strategies

- **Futex**: Minimize syscalls via userspace atomic fast path
- **Shared Memory**: Avoid copying - direct access to shared pages
- **Pipes**: Use splice() for zero-copy between pipe and file/socket
- **Message Queues**: Batching (send multiple messages before blocking)

### Avoiding Overhead

- **Use Futex over Semaphores**: Much faster for simple mutexes
- **Shared Memory over Message Passing**: When high bandwidth needed
- **Unix Sockets over SysV Msg Queues**: Better performance, stream semantics

---

## 🔟 Error Handling

### Common Error Codes

| Error Code | Meaning | Triggered When |
|------------|---------|----------------|
| `-EEXIST` | Object exists | Creating IPC object with existing key (without IPC_EXCL) |
| `-ENOENT` | No such object | Operating on non-existent IPC ID |
| `-EACCES` | Permission denied | IPC permissions check failed |
| `-EINVAL` | Invalid argument | Invalid IPC ID, invalid operation, invalid size |
| `-ENOMEM` | Out of memory | Cannot allocate IPC object |
| `-ENOSPC` | No space left | Reached system limit (too many IPC objects) |
| `-EAGAIN` | Try again | semop() with IPC_NOWAIT would block |
| `-EIDRM` | Identifier removed | IPC object deleted while operation in progress |
| `-EINTR` | Interrupted | Blocking IPC operation interrupted by signal |
| `-ETIMEDOUT` | Timeout | semtimedop() or msgrcv() timed out |

### Signal Handling

- **SIGPIPE**: Sent to process writing to pipe with no readers
- **Interruption**: Blocking IPC operations return -EINTR if signal received
- **Restart**: Some IPC syscalls auto-restart after signal (SA_RESTART)

### Cleanup on Process Exit

- **Shared Memory**: Detached (shm_nattch decremented), but segment persists until explicitly deleted
- **Semaphores**: semadj (undo) values applied to prevent deadlock
- **Message Queues**: No automatic cleanup (messages remain)
- **Pipes**: Closed, buffers freed when all references dropped
- **Futexes**: Kernel wake operations support robust mutexes (FUTEX_OWNER_DIED)

---

## 📚 Additional Resources

### Kernel Documentation

- `Documentation/core-api/ipc.rst` - IPC overview
- `ipc/util.h` - IPC internal utilities

### Key Header Files

- `include/linux/ipc.h` - IPC common definitions
- `include/linux/ipc_namespace.h` - IPC namespace
- `include/linux/shm.h` - Shared memory
- `include/linux/sem.h` - Semaphores
- `include/linux/msg.h` - Message queues
- `include/uapi/linux/futex.h` - Futex API
- `include/linux/pipe_fs_i.h` - Pipe internals

### System Calls

**System V IPC**:
- `shmget()`, `shmat()`, `shmdt()`, `shmctl()` - Shared memory
- `semget()`, `semop()`, `semtimedop()`, `semctl()` - Semaphores
- `msgget()`, `msgsnd()`, `msgrcv()`, `msgctl()` - Message queues

**POSIX IPC**:
- `shm_open()`, `shm_unlink()` - POSIX shared memory
- `sem_open()`, `sem_close()`, `sem_unlink()`, `sem_post()`, `sem_wait()` - POSIX semaphores
- `mq_open()`, `mq_send()`, `mq_receive()`, `mq_close()`, `mq_unlink()` - POSIX message queues

**Others**:
- `pipe()`, `pipe2()` - Create pipe
- `futex()` - Fast userspace mutex

### Debugging

**Procfs**:
- `/proc/sys/kernel/shm*` - Shared memory limits
- `/proc/sys/kernel/sem` - Semaphore limits
- `/proc/sys/kernel/msg*` - Message queue limits
- `/proc/sysvipc/shm` - Active shared memory segments
- `/proc/sysvipc/sem` - Active semaphore sets
- `/proc/sysvipc/msg` - Active message queues

**Tools**:
- `ipcs` - Show IPC status
- `ipcrm` - Remove IPC objects
- `lslocks` - List locks (including semaphores)
- `strace` - Trace IPC system calls

---

## 🔍 Common Operations Reference

### Operation 1: Create Shared Memory
**User API**: `shmget(IPC_PRIVATE, size, IPC_CREAT | 0666)`
**Entry Point**: `sys_shmget()` [ipc/shm.c]
**Flow**: `sys_shmget() → ksys_shmget() → newseg() → shmem_kernel_file_setup()`
**Result**: New shared memory segment created, backed by tmpfs file, returns shmid

### Operation 2: Semaphore P Operation (Wait)
**User API**: `semop(semid, &sembuf{.sem_op=-1}, 1)`
**Entry Point**: `sys_semop()` [ipc/sem.c]
**Flow**: `sys_semop() → sys_semtimedop() → do_semtimedop() → perform_atomic_semop()`
**Result**: Decrements semaphore if possible, otherwise blocks until available

### Operation 3: Send Message
**User API**: `msgsnd(msqid, &msgp, msgsz, 0)`
**Entry Point**: `sys_msgsnd()` [ipc/msg.c]
**Flow**: `sys_msgsnd() → do_msgsnd() → load_msg() → list_add_tail()`
**Result**: Message added to queue, waiting receivers woken

### Operation 4: Futex Wait (Mutex Lock)
**User API**: `futex(uaddr, FUTEX_WAIT, val, NULL)`
**Entry Point**: `sys_futex()` [kernel/futex.c]
**Flow**: `sys_futex() → do_futex() → futex_wait() → schedule()`
**Result**: If *uaddr == val, add to wait queue and sleep; otherwise return immediately

---

**End of IPC Subsystem Documentation**
