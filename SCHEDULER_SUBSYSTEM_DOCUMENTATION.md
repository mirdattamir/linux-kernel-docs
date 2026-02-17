# Linux Scheduler Subsystem
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
The Linux scheduler is responsible for fair and efficient time-sharing of CPU resources among competing processes and threads. It decides which task runs next, for how long, and on which CPU core, balancing between throughput, latency, fairness, and energy efficiency across diverse workloads from real-time systems to interactive desktops to massive server deployments.

### Position in System Architecture
```
┌─────────────────────────────────────────┐
│   System Calls & User Space             │
│   fork(), sched_setscheduler()           │
└─────────────────┬───────────────────────┘
                  │ System call interface
┌─────────────────▼───────────────────────┐
│     SCHEDULER SUBSYSTEM                  │
│  - Task selection (CFS, RT, Deadline)    │
│  - Load balancing                        │
│  - CPU affinity management               │
│  - Context switching                     │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│  Architecture │   │  Process/Thread  │
│  Context SW   │   │  Management      │
└───────────────┘   └──────────────────┘
```

### Interaction with Other Subsystems
- **Memory Management**: Allocates task_struct, stacks; handles page faults that block tasks
- **Timer Subsystem**: Tick interrupts drive scheduler decisions; hrtimers for precise timing
- **Architecture**: Context switch (register save/restore, TLB flushes, FPU state)
- **Power Management**: CPU frequency scaling (cpufreq), idle state management (cpuidle)
- **Interrupt Handling**: Softirq scheduling, workqueue task scheduling
- **Cgroups**: CPU bandwidth control, priority inheritance across control groups

---

## 2️⃣ Directory Mapping

```
kernel/sched/
├── core.c                 # Main scheduler logic, schedule(), context switching
├── fair.c                 # Completely Fair Scheduler (CFS) - default scheduler class
├── rt.c                   # Real-time scheduler (SCHED_FIFO, SCHED_RR)
├── deadline.c             # Deadline scheduler (SCHED_DEADLINE)
├── idle.c                 # Idle task scheduling
├── wait.c                 # Wait queues implementation
├── loadavg.c              # System load average calculation
├── topology.c             # CPU topology and scheduling domains
├── fair_numa.c            # NUMA balancing for CFS
├── pelt.c                 # Per-Entity Load Tracking
├── cputime.c              # CPU time accounting
├── stats.c                # Scheduler statistics
├── debug.c                # Debugging and /proc interface
├── clock.c                # Scheduler clock management
├── cpufreq.c              # CPU frequency scaling hooks
├── cpudeadline.c          # Deadline scheduler helpers
├── cpupri.c               # CPU priority management for RT
└── autogroup.c            # Automatic task grouping
```

---

## 3️⃣ Core Source Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| kernel/sched/core.c | Main scheduler entry, context switch, runqueue management | schedule(), pick_next_task(), context_switch(), sched_fork(), wake_up_new_task() |
| kernel/sched/fair.c | CFS implementation with red-black tree runqueue | enqueue_task_fair(), dequeue_task_fair(), pick_next_task_fair(), task_tick_fair() |
| kernel/sched/rt.c | Real-time scheduler with priority-ordered lists | enqueue_task_rt(), pick_next_task_rt(), task_tick_rt() |
| kernel/sched/deadline.c | EDF-based deadline scheduler | enqueue_task_dl(), pick_next_task_dl(), update_curr_dl() |
| kernel/sched/topology.c | CPU topology discovery, scheduling domain setup | build_sched_domains(), update_top_cache_domain() |
| kernel/sched/wait.c | Wait queue implementation for blocking tasks | prepare_to_wait(), finish_wait(), wake_up() |

---

## 4️⃣ Core Data Structures

### Structure 1: `struct task_struct`

**Purpose**: Process/thread descriptor - the fundamental unit of scheduling

**Definition** (`include/linux/sched.h`):
```c
struct task_struct {
    struct thread_info    thread_info;     // Architecture-specific thread info
    unsigned int          __state;         // Task state (RUNNING, INTERRUPTIBLE, etc.)
    void                  *stack;          // Kernel stack pointer

    int                   prio;            // Dynamic priority
    int                   static_prio;     // Static priority (nice value)
    int                   normal_prio;     // Priority without RT component
    unsigned int          rt_priority;     // Real-time priority

    const struct sched_class *sched_class; // Scheduling policy (CFS, RT, DL)
    struct sched_entity   se;              // CFS scheduling entity
    struct sched_rt_entity rt;             // RT scheduling entity
    struct sched_dl_entity dl;             // Deadline scheduling entity

    struct list_head      tasks;           // Global task list
    struct mm_struct      *mm;             // Memory descriptor
    struct mm_struct      *active_mm;      // Active mm for kernel threads

    int                   on_cpu;          // Currently executing on a CPU
    int                   on_rq;           // On a runqueue
    cpumask_t             cpus_mask;       // CPU affinity mask

    u64                   utime;           // User mode CPU time
    u64                   stime;           // Kernel mode CPU time
};
```

**Lifetime**: Created in fork() via copy_process(), destroyed in release_task() after exit

**Locking Rules**: Protected by rq->lock (runqueue lock) when on runqueue; task->pi_lock for PI (priority inheritance)

**Reference Counting**: get_task_struct() / put_task_struct() manage refcount

---

### Structure 2: `struct rq` (runqueue)

**Purpose**: Per-CPU runqueue holding all runnable tasks for that CPU

**Definition** (`kernel/sched/sched.h`):
```c
struct rq {
    raw_spinlock_t        lock;            // Runqueue lock
    unsigned int          nr_running;      // Number of runnable tasks

    struct cfs_rq         cfs;             // CFS runqueue
    struct rt_rq          rt;              // Real-time runqueue
    struct dl_rq          dl;              // Deadline runqueue

    struct task_struct    *curr;           // Currently running task
    struct task_struct    *idle;           // Idle task for this CPU
    struct task_struct    *stop;           // Highest priority stop task

    u64                   clock;           // Runqueue clock
    u64                   clock_task;      // Task clock (excludes IRQ time)

    unsigned long         nr_uninterruptible; // Tasks in UNINTERRUPTIBLE state
    u64                   nr_switches;     // Context switch count

    struct load_weight    load;            // Aggregate load on this runqueue
    unsigned long         cpu_capacity;    // CPU compute capacity

    int                   cpu;             // CPU ID for this runqueue
    int                   online;          // CPU is online
};
```

**Locking**: Always use raw_spin_lock_rq() / raw_spin_unlock_rq() with IRQs disabled

---

### Structure 3: `struct sched_entity`

**Purpose**: CFS scheduling entity - tracks virtual runtime and position in red-black tree

**Definition** (`include/linux/sched.h`):
```c
struct sched_entity {
    struct load_weight    load;            // Weight for load calculations
    struct rb_node        run_node;        // Red-black tree node
    struct list_head      group_node;      // List of entities in group
    unsigned int          on_rq;           // On a runqueue

    u64                   exec_start;      // Last execution start time
    u64                   sum_exec_runtime; // Total execution time
    u64                   vruntime;        // Virtual runtime (key for fairness)
    u64                   prev_sum_exec_runtime; // Previous total exec time

    u64                   nr_migrations;   // Number of CPU migrations
    struct sched_statistics statistics;   // Detailed statistics

    struct sched_entity   *parent;         // Parent entity for hierarchical scheduling
    struct cfs_rq         *cfs_rq;         // CFS runqueue this entity belongs to
    struct cfs_rq         *my_q;           // Own CFS runqueue if group entity
};
```

**Key Concept**: `vruntime` is the virtual runtime that determines task ordering in CFS. Lower vruntime = runs sooner.

---

### Structure 4: `struct cfs_rq`

**Purpose**: CFS-specific runqueue using red-black tree

**Definition** (`kernel/sched/sched.h`):
```c
struct cfs_rq {
    struct load_weight    load;            // Total load of all tasks
    unsigned long         runnable_weight; // Runnable task weight
    unsigned int          nr_running;      // Number of runnable tasks

    u64                   exec_clock;      // Total execution time
    u64                   min_vruntime;    // Minimum vruntime in tree (monotonic)

    struct rb_root_cached tasks_timeline; // Red-black tree of sched_entities
    struct sched_entity   *curr;           // Currently running entity
    struct sched_entity   *next;           // Next entity to run
    struct sched_entity   *last;           // Last entity that ran
    struct sched_entity   *skip;           // Entity to skip

    struct rq             *rq;             // Parent runqueue
};
```

**Key Concept**: Red-black tree keeps tasks ordered by `vruntime`. Leftmost node = next to run.

---

## 5️⃣ Call Path Tracing

### Path 1: Task Scheduling Decision (schedule())

**Overview**: Core scheduler function called when kernel needs to select next task to run

```
Voluntary: schedule()                               [kernel/sched/core.c:6487]
Involuntary: scheduler_tick() → resched_curr()
Wakeup: try_to_wake_up() → ttwu_queue()
              ↓
__schedule(SM_NONE)                                 [kernel/sched/core.c:6395] // Main scheduling logic
              ↓
  pick_next_task()                                  [kernel/sched/core.c:5815] // Select next task
    ├→ pick_next_task_idle()                        [kernel/sched/idle.c]     // If no runnable tasks
    ├→ pick_next_task_rt()                          [kernel/sched/rt.c:1682]  // RT tasks first
    ├→ pick_next_task_dl()                          [kernel/sched/deadline.c] // Deadline before RT
    └→ pick_next_task_fair()                        [kernel/sched/fair.c:7890] // CFS for normal tasks
              ↓
context_switch()                                    [kernel/sched/core.c:5155] // Switch to new task
  ├→ prepare_task_switch()                          [kernel/sched/core.c:5097] // Pre-switch hooks
  ├→ switch_mm()                                    [arch/x86/mm/tlb.c]       // Switch memory context
  ├→ switch_to()                                    [arch/x86/include/asm/switch_to.h] // Register swap
  └→ finish_task_switch()                           [kernel/sched/core.c:5120] // Post-switch cleanup
              ↓
Hardware: Load new instruction pointer, stack pointer, page tables
```

**Detailed Function Information**:

#### `__schedule()`
- **File**: `kernel/sched/core.c:6395`
- **Purpose**: Main scheduling function - selects next task and performs context switch
- **Parameters**:
  - `unsigned int sched_mode` - Scheduling mode flags (SM_NONE, SM_PREEMPT, etc.)
- **Return**: `void`
- **Description**: Disables preemption, acquires runqueue lock, picks next task using scheduling class methods, performs context switch if different task selected, handles load balancing triggers. This is the heart of the scheduler.

#### `pick_next_task()`
- **File**: `kernel/sched/core.c:5815`
- **Purpose**: Selects the next task to run from all scheduling classes
- **Parameters**:
  - `struct rq *rq` - Runqueue to pick from
  - `struct task_struct *prev` - Previously running task
- **Return**: `struct task_struct *` - Next task to run
- **Description**: Iterates through scheduling classes in priority order (stop > deadline > realtime > cfs > idle). Each class's pick_next_task() method selects highest priority task in that class. Returns immediately when a task is found.

#### `pick_next_task_fair()`
- **File**: `kernel/sched/fair.c:7890`
- **Purpose**: CFS scheduler - picks task with smallest vruntime from red-black tree
- **Parameters**:
  - `struct rq *rq` - Runqueue
  - `struct task_struct *prev` - Previous task
- **Return**: `struct task_struct *` - Next CFS task to run
- **Description**: Selects leftmost node from CFS red-black tree (lowest vruntime). If hierarchical group scheduling enabled, walks down group hierarchy. Updates statistics and sets next entity to run.

#### `context_switch()`
- **File**: `kernel/sched/core.c:5155`
- **Purpose**: Switches CPU from prev task to next task
- **Parameters**:
  - `struct rq *rq` - Runqueue
  - `struct task_struct *prev` - Previous task
  - `struct task_struct *next` - Next task
- **Return**: `struct rq *` - Runqueue pointer (may change during switch)
- **Description**: Switches memory context (mm_struct), calls architecture-specific switch_to() to save/restore registers, stack pointer, FPU state, and instruction pointer. Handles kernel thread special cases (no mm). Returns with next task running.

---

### Path 2: Process Creation (fork/clone)

**Overview**: How scheduler initializes new tasks during fork()

```
User Space:  fork() / clone()
              ↓
System Call: sys_clone()                            [kernel/fork.c:2850]
              ↓
kernel_clone()                                      [kernel/fork.c:2723]
              ↓
copy_process()                                      [kernel/fork.c:2279] // Create new task_struct
  ├→ dup_task_struct()                              [kernel/fork.c:993]  // Allocate task_struct
  ├→ sched_fork()                                   [kernel/sched/core.c:4844] // Initialize scheduler fields
  │   ├→ __sched_fork()                             [kernel/sched/core.c:4784] // Zero scheduler stats
  │   └→ p->sched_class->task_fork()                [kernel/sched/fair.c] // CFS-specific init
  └→ copy_thread()                                  [arch/x86/kernel/process.c] // Architecture-specific
              ↓
wake_up_new_task()                                  [kernel/sched/core.c:4961] // Place on runqueue
  ├→ activate_task()                                [kernel/sched/core.c:2036]
  │   └→ enqueue_task()                             [kernel/sched/core.c:2010]
  │       └→ p->sched_class->enqueue_task()         [kernel/sched/fair.c:11584] // Add to CFS rbtree
  └→ check_preempt_curr()                           [kernel/sched/core.c:2237] // Preempt if higher priority
              ↓
Scheduler: New task now runnable, will be scheduled via normal path
```

**Detailed Function Information**:

#### `sched_fork()`
- **File**: `kernel/sched/core.c:4844`
- **Purpose**: Initialize scheduler-specific fields for newly forked task
- **Parameters**:
  - `struct task_struct *p` - New task being created
- **Return**: `int` - 0 on success, error code on failure
- **Description**: Sets initial task state to TASK_NEW, initializes scheduling entity (vruntime, load weight), assigns scheduling class (inherits from parent), sets priority fields, initializes cpumask for affinity. Does NOT place on runqueue yet.

#### `wake_up_new_task()`
- **File**: `kernel/sched/core.c:4961`
- **Purpose**: Activate newly created task and add to runqueue
- **Parameters**:
  - `struct task_struct *p` - Newly created task
- **Return**: `void`
- **Description**: Selects initial CPU for task (often same as parent for cache locality), sets task state to TASK_RUNNING, calls activate_task() to enqueue on runqueue, checks if new task should preempt current, updates scheduler statistics. After this, task is eligible to be scheduled.

---

### Path 3: Task Wakeup (try_to_wake_up)

**Overview**: How blocked tasks transition to runnable state

```
Wakeup Trigger: wake_up_process()                   [kernel/sched/core.c:4370]
              ↓
try_to_wake_up()                                    [kernel/sched/core.c:4208] // Main wakeup logic
  ├→ select_task_rq()                               [kernel/sched/core.c:4085] // Choose target CPU
  │   └→ p->sched_class->select_task_rq()           [kernel/sched/fair.c:7330] // CFS CPU selection
  ├→ ttwu_queue()                                   [kernel/sched/core.c:4142] // Queue wakeup
  │   ├→ ttwu_do_activate()                         [kernel/sched/core.c:3933]
  │   │   └→ activate_task()                        [kernel/sched/core.c:2036]
  │   │       └→ enqueue_task_fair()                [kernel/sched/fair.c:11584] // Add to rbtree
  │   └→ check_preempt_curr()                       [kernel/sched/core.c:2237] // Check preemption
  │       └→ resched_curr()                         [kernel/sched/core.c:1044] // Set TIF_NEED_RESCHED
  └→ ttwu_stat()                                    [kernel/sched/core.c:4176] // Update statistics
              ↓
Return to Interrupt Handler or Syscall Exit
              ↓
schedule() called when returning to userspace (TIF_NEED_RESCHED set)
```

**Detailed Function Information**:

#### `try_to_wake_up()`
- **File**: `kernel/sched/core.c:4208`
- **Purpose**: Wake up a sleeping task and make it runnable
- **Parameters**:
  - `struct task_struct *p` - Task to wake up
  - `unsigned int state` - States that can be woken (TASK_NORMAL, etc.)
  - `int wake_flags` - Wake flags (WF_SYNC, WF_FORK, etc.)
- **Return**: `int` - 1 if task was woken, 0 if already running
- **Description**: Checks task state matches wake condition, selects optimal CPU considering cache locality and load balance, sets task to TASK_RUNNING, enqueues on target runqueue, checks if woken task should preempt current task on target CPU. Handles cross-CPU wakeups with IPI if necessary.

#### `enqueue_task_fair()`
- **File**: `kernel/sched/fair.c:11584`
- **Purpose**: Add CFS task to red-black tree runqueue
- **Parameters**:
  - `struct rq *rq` - Target runqueue
  - `struct task_struct *p` - Task to enqueue
  - `int flags` - Enqueue flags (ENQUEUE_WAKEUP, etc.)
- **Return**: `void`
- **Description**: Walks scheduling entity hierarchy (for group scheduling), updates load weight, inserts entity into CFS red-black tree ordered by vruntime, updates min_vruntime, increments nr_running counter, updates PELT (Per-Entity Load Tracking) metrics.

---

### Path 4: Periodic Tick Processing

**Overview**: Timer tick drives scheduler updates and preemption checks

```
Hardware: Timer interrupt fires (CONFIG_HZ frequency, typically 250-1000 Hz)
              ↓
Interrupt: IRQ handler → do_IRQ()                   [arch/x86/kernel/irq.c]
              ↓
tick_periodic() or tick_sched_timer()               [kernel/time/tick-*.c]
              ↓
update_process_times()                              [kernel/time/timer.c:1842]
              ↓
scheduler_tick()                                    [kernel/sched/core.c:5540] // Scheduler tick processing
  ├→ curr->sched_class->task_tick()                 [kernel/sched/fair.c:11754] // CFS tick
  │   └→ task_tick_fair()
  │       └→ entity_tick()                          [kernel/sched/fair.c:4788]
  │           ├→ update_curr()                      [kernel/sched/fair.c:896] // Update runtime stats
  │           └→ check_preempt_tick()               [kernel/sched/fair.c:4688] // Check if time slice expired
  │               └→ resched_curr()                 [kernel/sched/core.c:1044] // Set need_resched flag
  ├→ update_rq_clock()                              [kernel/sched/core.c:795] // Update runqueue clock
  └→ trigger_load_balance()                         [kernel/sched/fair.c:11919] // Periodic load balancing
              ↓
Return from Interrupt
              ↓
schedule() if TIF_NEED_RESCHED set
```

**Detailed Function Information**:

#### `scheduler_tick()`
- **File**: `kernel/sched/core.c:5540`
- **Purpose**: Periodic scheduler update called from timer interrupt
- **Parameters**: None
- **Return**: `void`
- **Description**: Updates runqueue clock, calls current task's scheduling class tick handler, updates CPU load statistics, triggers periodic load balancing across CPUs, updates thermal pressure, handles RCU callbacks. Runs in hard IRQ context with interrupts disabled.

#### `task_tick_fair()`
- **File**: `kernel/sched/fair.c:11754`
- **Purpose**: CFS per-tick processing for currently running task
- **Parameters**:
  - `struct rq *rq` - Runqueue
  - `struct task_struct *curr` - Currently running task
  - `int queued` - Whether task is queued
- **Return**: `void`
- **Description**: Updates current task's runtime statistics (vruntime), checks if task has exceeded its time slice (based on load and number of runnable tasks), sets need_resched if preemption needed, updates PELT metrics, handles NUMA balancing hints.

---

## 6️⃣ Concurrency Model

### Locking Hierarchy

1. **Runqueue Lock**: `raw_spinlock_t` (`rq->lock`)
   - **Protects**: All runqueue state, task runqueue membership, nr_running, curr/idle pointers
   - **Acquired**: During enqueue/dequeue, schedule(), load balance
   - **Type**: Raw spinlock (no preemption, IRQs disabled)
   - **Ordering**: When locking multiple runqueues, always lock in CPU ID order to prevent deadlock

2. **Task PI Lock**: `raw_spinlock_t` (`task->pi_lock`)
   - **Protects**: Task state transitions, priority changes, CPU affinity changes
   - **Acquired**: During try_to_wake_up(), set_cpus_allowed(), priority inheritance
   - **Type**: Raw spinlock
   - **Ordering**: pi_lock can be acquired while holding rq->lock, never reverse

3. **Wait Queue Lock**: `spinlock_t` (embedded in wait_queue_head_t)
   - **Protects**: Wait queue list membership
   - **Acquired**: During wake_up(), prepare_to_wait()
   - **Type**: Regular spinlock

### Synchronization Mechanisms

- **Runqueue Spinlocks**: Protect all per-CPU runqueue state. Critical for scheduler correctness. Very hot locks - optimized with techniques like double_rq_lock() for migration.

- **RCU (Read-Copy-Update)**: Used for task list traversal (for_each_process). Allows lockless reads of task list while rare updates use synchronize_rcu().

- **Per-CPU Runqueues**: Fundamental scalability technique - each CPU has own runqueue, eliminating need for global scheduler lock. Tasks migrate between runqueues during load balancing.

- **Atomic Operations**: Used for task state changes (set_current_state, set_task_cpu), reference counting (get_task_struct/put_task_struct).

- **Preemption Disable**: preempt_disable()/preempt_enable() prevent involuntary preemption during critical sections that aren't interrupt-safe.

- **Memory Barriers**: smp_wmb(), smp_rmb() ensure visibility of scheduler state changes across CPUs (especially task state and need_resched flag).

### Lock Ordering Rules

```
1. Migration locks (rq1->lock, rq2->lock) - always in CPU ID order
2. Runqueue lock (rq->lock)
3. Task PI lock (task->pi_lock)
4. Wait queue lock
```

**Critical Rule**: Never acquire rq->lock while holding pi_lock (wrong order). Never acquire lower CPU ID runqueue lock after higher one.

### Preemption Points

- **Voluntary**: cond_resched() in long-running kernel code
- **Involuntary**: Returning from interrupt/syscall when TIF_NEED_RESCHED set
- **Disabled Regions**: Between preempt_disable()/preempt_enable(), spinlock_lock()/unlock() regions

---

## 7️⃣ Memory Model

### Allocation Patterns

- **GFP Flags Used**:
  - `GFP_KERNEL`: Used in fork() path for task_struct allocation (can sleep)
  - `GFP_ATOMIC`: Used in scheduler_tick() and IRQ context (cannot sleep)
  - `GFP_NOWAIT`: Used in some wakeup paths where sleeping not allowed

### Memory Allocators

- **SLUB Cache**: `task_struct_cachep` - dedicated slab cache for task_struct allocation. Improves performance and reduces fragmentation. ~8KB per task_struct on x86-64.

- **Page Allocator**: Kernel stacks allocated via __vmalloc_node_range() (THREAD_SIZE, usually 2 or 4 pages = 8-16KB). Stack guard pages for overflow detection.

- **Per-CPU Allocations**: Runqueues (struct rq) allocated as per-CPU static variables. Critical for scalability - avoids cache line bouncing.

### NUMA Considerations

- **Task Placement**: select_task_rq_fair() prefers CPUs on same NUMA node as task's memory
- **Load Balancing**: NUMA-aware - less aggressive at migrating across NUMA nodes
- **Automatic NUMA Balancing**: kernel scans task memory access patterns, migrates tasks or pages to co-locate computation and data
- **Scheduling Domains**: NUMA topology reflected in scheduling domain hierarchy

### Cache Considerations

- **Cacheline Alignment**: struct rq is ____cacheline_aligned to prevent false sharing between CPUs
- **Hot/Cold Splits**: Frequently accessed fields grouped together in struct task_struct
- **Affinity**: Wakeups prefer last CPU task ran on (cache warm)

---

## 8️⃣ Hardware Interaction

### CPU Discovery and Topology

The scheduler builds a hierarchical view of CPU topology from ACPI/device-tree:
- **Physical packages** (sockets)
- **Cores** (within a package)
- **SMT threads** (hyperthreads within a core)
- **NUMA nodes**
- **Cache domains** (shared L2, L3 caches)

This topology drives scheduling domain construction and load balancing decisions.

### Timer Interrupts

**Periodic Tick Mode**: Hardware timer (APIC timer on x86) programmed to fire at CONFIG_HZ frequency. Tick interrupt calls scheduler_tick().

**Tickless (NO_HZ_FULL)**: For isolated CPUs, tick disabled when only one task running. Reduces overhead for real-time and HPC workloads.

### Context Switch Hardware Operations

**switch_to()** performs architecture-specific operations:

1. **Register Save/Restore**: All general purpose registers saved to prev task's kernel stack, loaded from next task's stack
2. **Stack Pointer Switch**: ESP/RSP register loaded with next task's kernel stack
3. **Instruction Pointer**: RIP set to next task's saved RIP (return address)
4. **Page Table Base**: CR3 register loaded with next task's page table (if different mm)
5. **TLB Flush**: If changing address space, TLB invalidated (expensive)
6. **FPU/SIMD State**: Lazy FPU - not saved until next task uses FPU (reduces overhead)
7. **Segment Registers**: FS/GS for thread-local storage

### CPU Hotplug

When CPU goes offline:
- All tasks migrated to other CPUs
- Runqueue torn down
- Scheduling domains rebuilt

---

## 9️⃣ Performance Considerations

### Critical Hot Paths

- **schedule()**: Most critical path - called very frequently (every time quantum, on every block). Heavily optimized:
  - Fast path for common case (CFS, single task)
  - Per-CPU runqueues eliminate global lock
  - Lockless operations where possible

- **try_to_wake_up()**: Very hot on workloads with blocking/waking (networking, disk I/O):
  - Optimized CPU selection algorithm
  - Wakelist batching to reduce cross-CPU locking
  - WF_SYNC optimization (don't migrate if wakee will run immediately)

- **Context Switch**: Expensive due to cache effects and TLB flush:
  - Minimized by increasing time quantum
  - Lazy TLB - kernel threads don't switch page tables
  - Lazy FPU - FPU state saved only if next task uses it

### Cacheline Optimization

- **struct rq**: ____cacheline_aligned to prevent false sharing - each CPU's runqueue on its own cacheline
- **Hot Fields First**: In task_struct, most frequently accessed fields (state, flags, on_cpu) placed early for cache efficiency
- **Read-Mostly Separation**: Separate cachelines for read-mostly vs write-heavy fields

### Lock Contention

- **Runqueue Lock**: Biggest source of contention in scheduler:
  - Mitigated by per-CPU runqueues
  - Load balancing done lazily and periodically, not on every schedule
  - Double-lock optimization (trylock then lock) for migration

- **Task PI Lock**: Contention during frequent wakeups:
  - Held very briefly
  - Wakelist batching reduces acquisition frequency

### NUMA Locality

- **Initial Placement**: New tasks placed on same NUMA node as parent (fork) or waker (wakeup)
- **Migration Damping**: Load balancer less aggressive across NUMA boundaries
- **Memory Follows CPU**: Automatic NUMA balancing migrates pages to task's NUMA node
- **Domain-Based Balancing**: Balancing happens at multiple levels (SMT, core, NUMA), with different aggressiveness

### Scalability Techniques

- **Per-CPU Runqueues**: Eliminates global lock, scales to thousands of CPUs
- **Hierarchical Load Balancing**: Scheduling domains allow efficient multi-level balancing
- **Lazy Operations**: Load balance only periodically, not on every schedule
- **RCU for Task Lists**: Lockless traversal of global task list
- **Wakelist Batching**: Batch multiple wakeups to same CPU to amortize locking

---

## 🔟 Error Handling

### Common Error Codes

| Error Code | Meaning | Triggered When |
|------------|---------|----------------|
| `-EINVAL` | Invalid argument | Invalid scheduler policy, priority out of range |
| `-EPERM` | Operation not permitted | Non-root setting RT priority, changing affinity of other user's task |
| `-ESRCH` | No such process | Setting scheduler params for non-existent PID |
| `-E2BIG` | Argument list too long | CPU affinity mask too large |
| `-EBUSY` | Device or resource busy | CPU hotplug operation conflicting with affinity |

### Error Paths

- **Fork Failure**: If sched_fork() fails (rare), task_struct freed and -ENOMEM returned to userspace
- **Invalid Priority**: sched_setscheduler() validates priority ranges, returns -EINVAL if out of bounds
- **RT Bandwidth Exceeded**: If RT task group would exceed bandwidth limits, enqueue fails gracefully
- **Migration Failure**: If set_cpus_allowed() cannot migrate to any allowed CPU (all offline), kernel may panic or kill task

### Debugging and Diagnostics

**Tracepoints**:
- `sched:sched_switch` - Every context switch
- `sched:sched_wakeup` - Task wakeups
- `sched:sched_process_fork` - Process creation
- `sched:sched_migrate_task` - Task CPU migrations

**Debugfs**: `/sys/kernel/debug/sched/`
- `debug` - Detailed scheduler state dump
- `preempt` - Preemption statistics
- `numa_balancing` - NUMA balancing stats

**Proc Interface**:
- `/proc/<pid>/sched` - Per-task scheduler statistics
- `/proc/<pid>/status` - Task state, CPU affinity
- `/proc/sched_debug` - Global scheduler debug info
- `/proc/schedstat` - Scheduler statistics

---

## 📚 Additional Resources

### Kernel Documentation

- `Documentation/scheduler/sched-design-CFS.rst` - CFS design and implementation
- `Documentation/scheduler/sched-rt-group.rst` - Real-time group scheduling
- `Documentation/scheduler/sched-deadline.rst` - Deadline scheduler
- `Documentation/scheduler/sched-domains.rst` - Scheduling domains
- `Documentation/scheduler/sched-nice-design.rst` - Nice levels and priorities

### Key Header Files

- `include/linux/sched.h` - Task struct and scheduler APIs
- `include/linux/sched/signal.h` - Signal handling integration
- `include/linux/sched/task.h` - Task management functions
- `kernel/sched/sched.h` - Internal scheduler data structures
- `include/uapi/linux/sched.h` - Userspace scheduler API

### System Calls

- `sched_setscheduler()` / `sched_getscheduler()` - Set/get scheduling policy
- `sched_setparam()` / `sched_getparam()` - Set/get scheduling parameters
- `sched_setaffinity()` / `sched_getaffinity()` - Set/get CPU affinity
- `sched_yield()` - Voluntarily yield CPU
- `nice()` / `setpriority()` / `getpriority()` - Nice value manipulation

---

## 🔍 Common Operations Reference

### Operation 1: Setting Real-Time Priority
**User API**: `sched_setscheduler(pid, SCHED_FIFO, &param)`
**Entry Point**: `sched_setscheduler()` [kernel/sched/core.c]
**Flow**: `sys_sched_setscheduler() → sched_setscheduler() → __sched_setscheduler() → check_class_changed()`
**Result**: Task moved to RT runqueue, scheduled with FIFO policy at specified priority (1-99)

### Operation 2: Setting CPU Affinity
**User API**: `sched_setaffinity(pid, cpusetsize, &mask)`
**Entry Point**: `sched_setaffinity()` [kernel/sched/core.c]
**Flow**: `sys_sched_setaffinity() → sched_setaffinity() → __set_cpus_allowed_ptr() → migration_cpu_stop()`
**Result**: Task's cpus_mask updated, task migrated to allowed CPU if necessary

### Operation 3: Yielding CPU
**User API**: `sched_yield()`
**Entry Point**: `sys_sched_yield()` [kernel/sched/core.c]
**Flow**: `sys_sched_yield() → yield() → schedule()`
**Result**: Task moved to end of its priority queue, schedule() called immediately

### Operation 4: Forking Process
**User API**: `fork()` / `clone()`
**Entry Point**: `sys_clone()` [kernel/fork.c]
**Flow**: `sys_clone() → kernel_clone() → copy_process() → sched_fork() → wake_up_new_task()`
**Result**: New task created with initialized scheduler state, placed on runqueue, eligible for scheduling

---

**End of Scheduler Subsystem Documentation**
