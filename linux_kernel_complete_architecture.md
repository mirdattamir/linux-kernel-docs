# Linux Kernel Complete System Architecture Documentation
**Version:** Linux 6.19
**Generated:** 2026-02-16
**Scope:** Complete 12-Layer System Architecture

---

# Table of Contents

1. [Layer 0 - Hardware Architecture](#layer-0---hardware-architecture)
2. [Layer 1 - Architecture-Specific Code](#layer-1---architecture-specific-code)
3. [Layer 2 - Core Kernel](#layer-2---core-kernel)
4. [Layer 3 - Memory Management](#layer-3---memory-management)
5. [Layer 4 - Virtual File System](#layer-4---virtual-file-system)
6. [Layer 5 - Block Layer](#layer-5---block-layer)
7. [Layer 6 - Storage Drivers](#layer-6---storage-drivers)
8. [Layer 7 - Networking Stack](#layer-7---networking-stack)
9. [Layer 8 - IPC](#layer-8---ipc)
10. [Layer 9 - Security](#layer-9---security)
11. [Layer 10 - Virtualization](#layer-10---virtualization)
12. [Layer 11 - Power Management](#layer-11---power-management)
13. [Layer 12 - Device Model](#layer-12---device-model)

---

# Layer 0 - Hardware Architecture

## 1️⃣ High-Level Purpose

Layer 0 represents the physical hardware components that the Linux kernel must directly interface with. This layer defines:

- **CPU architecture**: Instruction sets, privilege levels, execution modes
- **Memory Management Unit (MMU)**: Virtual-to-physical address translation
- **Interrupt controllers**: APIC (x86), GIC (ARM), routing hardware interrupts to CPUs
- **PCIe infrastructure**: Device enumeration, MMIO, DMA, MSI/MSI-X interrupts
- **Storage devices**: NVMe, SATA, SCSI physical interfaces
- **Network devices**: Ethernet controllers, WiFi adapters

**Position in system architecture:**
Hardware is the foundation. All kernel subsystems ultimately interact with hardware through:
- Memory-mapped I/O (MMIO)
- Port I/O (x86)
- DMA transfers
- Interrupts
- CPU instructions

**Interaction with other subsystems:**
- Layer 1 (arch-specific) provides the abstraction layer
- Layer 3 (memory management) manages MMU
- Layer 6 (storage drivers) talks to storage controllers
- Layer 7 (networking) interfaces with NICs

---

## 2️⃣ Hardware Component Mapping

```
Hardware Layer Components:
├── CPU
│   ├── x86_64 (Intel/AMD)
│   ├── ARM64 (Cortex-A series)
│   ├── RISC-V
│   └── Others (PowerPC, MIPS, etc.)
│
├── MMU (Memory Management Unit)
│   ├── Page tables (4-level on x86_64, 4-level on ARM64)
│   ├── TLB (Translation Lookaside Buffer)
│   └── IOMMU (for device DMA translation)
│
├── Interrupt Controllers
│   ├── x86: LAPIC (Local APIC) + I/O APIC
│   ├── ARM: GIC (Generic Interrupt Controller)
│   └── MSI/MSI-X (Message Signaled Interrupts for PCIe)
│
├── PCIe Infrastructure
│   ├── Root Complex
│   ├── PCIe switches
│   ├── Endpoints (devices)
│   └── Configuration space (BARs, capabilities)
│
├── Storage Devices
│   ├── NVMe (PCIe-attached SSDs)
│   ├── AHCI/SATA controllers
│   ├── SCSI/SAS controllers
│   └── eMMC/SD (embedded systems)
│
└── Network Devices
    ├── Ethernet NICs (Intel, Broadcom, Mellanox)
    ├── WiFi adapters
    └── InfiniBand HCAs
```

---

## 3️⃣ Core Interaction Mechanisms

### CPU Instructions and Privilege Levels

**x86_64 Privilege Rings:**
```
Ring 0 (Kernel mode)
  - Full access to all instructions
  - Can execute privileged instructions (IN/OUT, LGDT, MOV CR3, etc.)
  - Accesses kernel memory directly

Ring 3 (User mode)
  - Restricted instruction set
  - Cannot execute privileged instructions
  - Accesses only user-space memory
  - Transitions to Ring 0 via syscall/sysenter
```

**ARM64 Exception Levels:**
```
EL0 (User mode)       - Application code
EL1 (Kernel mode)     - Linux kernel
EL2 (Hypervisor)      - KVM host mode
EL3 (Secure Monitor)  - ARM TrustZone
```

### System Call Entry

**x86_64 syscall mechanism:**
```
User space                    Kernel space
----------                    ------------
syscall instruction    →      SYSCALL_ENTRY_POINT (arch/x86/entry/entry_64.S)
                              ├── Save user registers to pt_regs
                              ├── Switch to kernel stack
                              ├── Switch to kernel GS base
                              └── Jump to syscall handler table
                                   └── do_syscall_64() (arch/x86/entry/common.c)
```

**Hardware state transition:**
```
Before syscall:
  RIP = user instruction pointer
  RSP = user stack pointer
  CS = user code segment (ring 3)

During syscall (CPU does this atomically):
  RCX ← RIP (save return address)
  R11 ← RFLAGS (save flags)
  RIP ← IA32_LSTAR MSR (kernel entry point)
  CS ← kernel code segment (ring 0)
  RSP ← (switched by kernel entry code)

After syscall:
  RIP = kernel syscall handler
  RSP = kernel stack
  CS = kernel segment (ring 0)
```

---

## 4️⃣ Core Hardware Data Structures

### CPU Descriptor Tables (x86_64)

**IDT (Interrupt Descriptor Table)**
```c
/* arch/x86/include/asm/desc_defs.h */
struct gate_struct {
    u16 offset_low;      // Bits 0-15 of handler address
    u16 segment;         // Code segment selector
    u8  ist;            // Interrupt Stack Table index (0-7)
    u8  type:4;         // Gate type (interrupt, trap)
    u8  dpl:2;          // Descriptor Privilege Level
    u8  p:1;            // Present bit
    u16 offset_middle;   // Bits 16-31 of handler address
    u32 offset_high;     // Bits 32-63 of handler address
    u32 reserved;
} __attribute__((packed));

/* 256 entries in IDT (0-255) */
struct idt_data {
    unsigned int    vector;
    unsigned int    segment;
    struct idt_bits bits;
    const void      *addr;
};
```

**Purpose:**
Maps interrupt/exception vectors (0-255) to kernel handler addresses.

**Lifetime:**
Initialized during boot (setup_arch() → idt_setup_apic_and_irq_gates()), persists for system lifetime.

**Locking:**
Not protected by locks (read-only after initialization, per-CPU structure).

---

### Page Tables (MMU)

**x86_64 4-level paging:**
```c
/* arch/x86/include/asm/pgtable_types.h */
typedef struct { pteval_t pte; } pte_t;      // Page Table Entry
typedef struct { pmdval_t pmd; } pmd_t;      // Page Middle Directory
typedef struct { pudval_t pud; } pud_t;      // Page Upper Directory
typedef struct { pgdval_t pgd; } pgd_t;      // Page Global Directory

/* PTE bit layout (64 bits) */
#define _PAGE_PRESENT   (1UL << 0)   // Page is present in memory
#define _PAGE_RW        (1UL << 1)   // Read/write permission
#define _PAGE_USER      (1UL << 2)   // User-accessible
#define _PAGE_PWT       (1UL << 3)   // Page-level write-through
#define _PAGE_PCD       (1UL << 4)   // Page-level cache disable
#define _PAGE_ACCESSED  (1UL << 5)   // Accessed flag (set by CPU)
#define _PAGE_DIRTY     (1UL << 6)   // Dirty flag (set by CPU on write)
#define _PAGE_PSE       (1UL << 7)   // Page Size Extension (huge page)
#define _PAGE_GLOBAL    (1UL << 8)   // Global TLB entry
#define _PAGE_NX        (1UL << 63)  // No-Execute bit
```

**Address translation (4KB pages):**
```
Virtual Address (64 bits):
┌────────────┬─────┬─────┬─────┬─────┬──────────────┐
│   Sign Ext │ PGD │ PUD │ PMD │ PTE │ Page Offset  │
└────────────┴─────┴─────┴─────┴─────┴──────────────┘
   63-48       47-39  38-30  29-21  20-12    11-0

Translation process:
1. CR3 register → PGD physical address
2. Bits [47:39] index into PGD → PUD address
3. Bits [38:30] index into PUD → PMD address
4. Bits [29:21] index into PMD → PTE address
5. Bits [20:12] index into PTE → Physical page frame
6. Bits [11:0] → Offset within 4KB page

Physical Address = PTE[Physical Frame] + Offset
```

**Lifetime:**
Per-process (mm_struct→pgd), allocated on fork(), freed on exit.

**Ownership:**
Owned by struct mm_struct.

**Locking:**
Protected by page table locks (mm→page_table_lock or per-PMD spinlocks).

**Memory layout:**
Each page table level is 4KB (512 entries × 8 bytes).

---

### PCIe Configuration Space

**PCIe device configuration:**
```c
/* include/uapi/linux/pci_regs.h */
#define PCI_VENDOR_ID       0x00    // 16 bits
#define PCI_DEVICE_ID       0x02    // 16 bits
#define PCI_COMMAND         0x04    // Command register
#define PCI_STATUS          0x06    // Status register
#define PCI_CLASS_REVISION  0x08    // Class code + revision
#define PCI_HEADER_TYPE     0x0e    // Header type

/* Base Address Registers (BARs) */
#define PCI_BASE_ADDRESS_0  0x10    // First BAR
#define PCI_BASE_ADDRESS_1  0x14
#define PCI_BASE_ADDRESS_2  0x18
#define PCI_BASE_ADDRESS_3  0x1c
#define PCI_BASE_ADDRESS_4  0x20
#define PCI_BASE_ADDRESS_5  0x24    // Last BAR (Type 0 header)

/* MSI capability */
#define PCI_MSI_FLAGS       0x02    // MSI feature flags
#define PCI_MSI_ADDRESS_LO  0x04    // MSI address lower 32 bits
#define PCI_MSI_ADDRESS_HI  0x08    // MSI address upper 32 bits (64-bit)
#define PCI_MSI_DATA_32     0x08    // MSI data (32-bit address)
#define PCI_MSI_DATA_64     0x0c    // MSI data (64-bit address)
```

**BAR (Base Address Register) decoding:**
```
BAR layout (32-bit):
┌────────────────────────────────────┬──┬─┬─┐
│       Base Address [31:4]          │Pf│T│M│
└────────────────────────────────────┴──┴─┴─┘
  31-4: Base address (16-byte aligned)
  3: Prefetchable
  2-1: Type (00=32-bit, 10=64-bit)
  0: Memory space indicator (0=memory, 1=I/O)

BAR size discovery:
1. Write 0xFFFFFFFF to BAR
2. Read back value
3. Size = ~(value & ~0xF) + 1

Example:
  Original BAR = 0xFEBC0000
  Write 0xFFFFFFFF
  Read back 0xFFFC0000
  Size = ~0xFFFC0000 + 1 = 0x40000 (256KB)
```

---

## 5️⃣ Call Path Tracing

### Interrupt Handling Path

**Hardware interrupt delivery (x86_64):**
```
Hardware Event                    CPU Actions                   Kernel Handler
--------------                    -----------                   --------------
Device asserts                    1. CPU completes current      entry_INTERRUPT_handler
interrupt line         →             instruction                (arch/x86/entry/entry_64.S)
                                  2. Checks IF flag in RFLAGS   │
(For MSI/MSI-X:                   3. Looks up vector in IDT     ├── SAVE_ALL (push registers)
Device writes to                  4. Checks CPL vs DPL          ├── Switch to kernel stack
APIC message address)             5. Switches to kernel mode    ├── Call C handler
                                  6. Pushes SS, RSP, RFLAGS,    │
                                     CS, RIP on kernel stack    └→ common_interrupt()
                                  7. Jumps to IDT entry            (arch/x86/kernel/irq.c)
                                                                   │
                                                                   └→ handle_irq()
                                                                      (kernel/irq/irqdesc.c)
                                                                      │
                                                                      └→ desc→handle_irq()
                                                                         │
                                                                         └→ device_driver_interrupt_handler()
```

**Complete trace for NVMe interrupt:**
```
NVMe device                          Kernel interrupt path
-----------                          ---------------------
nvme_complete_cqes()                 1. NVMe device DMAs completion queue entry
  │                                     to host memory
  └→ Write to doorbell register      2. Device writes MSI-X message to APIC
         ↓
     [MSI-X write to APIC]           3. APIC delivers interrupt to CPU
         ↓
     [CPU vectored interrupt]        4. CPU jumps to IDT entry
         ↓
     entry_INTERRUPT                 5. Save registers, call C handler
         ↓
     common_interrupt()
         ↓
     handle_irq()
         ↓
     nvme_irq()                      6. NVMe driver processes completion
     (drivers/nvme/host/pci.c)          queue, completes BIOs
         ↓
     blk_mq_complete_request()       7. Block layer marks request complete
         ↓
     bio_endio()                     8. Notify upper layers (filesystem, etc.)
```

---

### DMA Transaction Path

**Typical DMA workflow:**
```
Driver prepares DMA              Hardware executes           DMA completion
-------------------              -----------------           --------------
1. Allocate DMA buffer
   dma_alloc_coherent()
      ↓
2. Map buffer for DMA
   dma_map_single()
      ↓
3. Get physical address
   (virtual→physical via MMU)
      ↓
4. Program device registers       5. Device reads memory     9. Device signals
   - DMA source/dest address         via PCIe                   completion via
   - Transfer length                   ↓                         interrupt/MSI-X
   - Control flags                  6. Device transfers data      ↓
      ↓                                via DMA                10. Interrupt handler
5. Write doorbell/start bit           ↓                         - Read status
   (MMIO write to device)          7. Device writes to          - Check errors
                                      destination               - Complete I/O
                                      ↓                            ↓
                                   8. (Optional) Write        11. Clean up DMA
                                      status/completion           dma_unmap_single()
```

**NVMe command submission via DMA:**
```
nvme_submit_cmd()
(drivers/nvme/host/core.c)
   │
   ├→ Allocate command slot in submission queue (SQ)
   │  SQ is DMA-coherent memory shared with device
   │
   ├→ Fill command structure:
   │  struct nvme_command {
   │      __u8 opcode;
   │      __u8 flags;
   │      __u16 command_id;
   │      __le64 prp1;  // Physical region page (DMA address)
   │      __le64 prp2;
   │      ...
   │  }
   │
   ├→ Set PRP1/PRP2 to DMA-mapped data buffer addresses
   │  prp1 = dma_map_single(data_buffer)
   │
   ├→ Write doorbell register (MMIO) to notify device
   │  writel(sq_tail, nvmeq→q_db)
   │
   └→ Device reads command from SQ via DMA
      Device executes command (reads/writes data via DMA)
      Device writes completion to completion queue (CQ) via DMA
      Device sends MSI-X interrupt
```

---

## 6️⃣ Concurrency Model

### Interrupt Context vs Process Context

**Execution contexts:**
```
Process Context
  - Runs in context of a process (current is valid)
  - Can sleep (schedule())
  - Can use mutexes, semaphores
  - Can access user space (with proper checks)

Interrupt Context (Hardirq)
  - Runs when servicing hardware interrupt
  - Cannot sleep
  - Can only use spinlocks
  - Cannot access user space
  - Preempts process context
  - Nested interrupts possible (if enabled)

Softirq Context
  - Deferred interrupt processing
  - Cannot sleep
  - Runs with interrupts enabled
  - Lower priority than hardirq
  - Used for network RX, block completions, tasklets

Bottom Half (Threaded IRQ)
  - Interrupt handler split into top/bottom half
  - Top half: minimal hardirq work
  - Bottom half: longer processing in process context
```

### CPU Synchronization Primitives

**Spinlocks (hardware-level):**
```c
/* include/linux/spinlock.h */
typedef struct spinlock {
    arch_spinlock_t raw_lock;  // Architecture-specific
} spinlock_t;

/* x86 implementation uses LOCK prefix */
static inline void arch_spin_lock(arch_spinlock_t *lock)
{
    asm volatile(
        "1:\n\t"
        "lock; decb %0\n\t"      // Atomic decrement
        "jns 3f\n"               // Jump if not negative (got lock)
        "2:\n\t"
        "pause\n\t"              // CPU hint: we're spinning
        "cmpb $0,%0\n\t"         // Check if lock available
        "jle 2b\n\t"             // Keep spinning
        "jmp 1b\n"               // Try again
        "3:\n\t"
        : "+m" (lock->slock)
        : : "memory"
    );
}
```

**Lock ordering to prevent deadlocks:**
```
Global lock ordering (example):
  1. zone→lock (page allocator)
  2. lruvec→lru_lock (LRU lists)
  3. mapping→tree_lock (page cache)
  4. anon_vma→rwsem (reverse mapping)

Rule: Always acquire locks in this order to prevent AB-BA deadlock
```

---

## 7️⃣ Memory Model

### Cache Coherency (Hardware)

**x86_64 MESI Protocol:**
```
Cache line states:
  M (Modified)   - This cache has dirty data, others invalid
  E (Exclusive)  - This cache has clean data, others invalid
  S (Shared)     - Multiple caches have clean copy
  I (Invalid)    - Cache line is invalid

State transitions on memory access:
  CPU 0 writes address X:
    CPU 0 cache: I → M (invalidate others via bus)
    CPU 1 cache: S → I (invalidated by snoop)

  CPU 1 reads address X:
    CPU 0 cache: M → S (write back to memory)
    CPU 1 cache: I → S (read from memory)
```

**Memory barriers (enforcing ordering):**
```c
/* arch/x86/include/asm/barrier.h */
#define mb()    asm volatile("mfence":::"memory")  // Full barrier
#define rmb()   asm volatile("lfence":::"memory")  // Read barrier
#define wmb()   asm volatile("sfence":::"memory")  // Write barrier

/* Linux kernel barriers */
#define smp_mb()   mb()   // SMP memory barrier
#define smp_rmb()  rmb()  // SMP read barrier
#define smp_wmb()  wmb()  // SMP write barrier

/* Usage example: producer-consumer */
// Producer:
data = new_value;
smp_wmb();         // Ensure data write visible before flag
flag = 1;

// Consumer:
while (flag != 1)
    cpu_relax();
smp_rmb();         // Ensure flag read before data read
consume(data);
```

---

## 8️⃣ Hardware Interaction

### MMIO (Memory-Mapped I/O)

**Mapping device registers:**
```c
/* drivers/nvme/host/pci.c - simplified */
static int nvme_pci_enable(struct nvme_dev *dev)
{
    struct pci_dev *pdev = to_pci_dev(dev→dev);

    /* Enable device */
    if (pci_enable_device_mem(pdev))
        return -ENODEV;

    /* Request MMIO regions */
    if (pci_request_mem_regions(pdev, "nvme"))
        goto disable;

    /* Map BAR 0 (NVMe registers) */
    dev→bar = ioremap(pci_resource_start(pdev, 0),
                      pci_resource_len(pdev, 0));
    if (!dev→bar)
        goto release;

    /* Now can access device registers */
    u32 version = readl(dev→bar + NVME_REG_VS);

    return 0;
}
```

**ioremap() vs direct access:**
```
Physical address space:
0x0000_0000 ─────────────────
            │               │
            │  System RAM   │  (cacheable)
            │               │
0xC000_0000 ─────────────────
            │               │
            │  PCIe MMIO    │  (non-cacheable, via ioremap)
            │  (Device BARs)│
            │               │
0xFFFF_FFFF ─────────────────

ioremap() creates:
  - Uncacheable page table mappings
  - Write-combining or write-through policy
  - Returns virtual address for CPU access
```

---

### MSI/MSI-X Interrupts

**MSI-X configuration:**
```c
/* drivers/pci/msi/msi.c */
struct msi_desc {
    unsigned int irq;              // Linux IRQ number
    unsigned int nvec_used;        // # vectors
    struct device *dev;            // Device owner

    /* MSI address/data (written by device to trigger interrupt) */
    struct {
        u64 address;               // APIC address
        u32 data;                  // Vector + trigger mode
    } msg;
};

/* NVMe driver MSI-X setup */
static int nvme_setup_irqs(struct nvme_dev *dev)
{
    /* Request MSI-X vectors */
    int nr_vectors = pci_alloc_irq_vectors(pdev,
                                           1, nr_io_queues,
                                           PCI_IRQ_MSIX);

    /* For each queue, assign an interrupt */
    for (i = 0; i < nr_vectors; i++) {
        int irq = pci_irq_vector(pdev, i);
        request_irq(irq, nvme_irq, 0, "nvme", &dev→queues[i]);
    }
}
```

**MSI-X transaction:**
```
Device wants to signal interrupt:
1. Device performs memory write to MSI address
   Write to: 0xFEE00000 + (APIC ID << 12)
   Data: Vector number + delivery mode

2. Memory write routed to APIC via PCIe

3. APIC receives write, interprets as interrupt

4. APIC delivers interrupt to target CPU

5. CPU vectors to IDT entry for that vector
```

---

## 9️⃣ Performance Considerations

### NUMA (Non-Uniform Memory Access)

**NUMA topology:**
```
┌─────────────────────────────────────────────────┐
│ Node 0                  Node 1                  │
│ ┌──────┐  ┌────────┐   ┌──────┐  ┌────────┐   │
│ │ CPU0 │──│ Memory │   │ CPU1 │──│ Memory │   │
│ │      │  │ (Local)│   │      │  │ (Local)│   │
│ └──────┘  └────────┘   └──────┘  └────────┘   │
│     │          │            │          │        │
│     └──────────┴────────────┴──────────┘        │
│           Interconnect (QPI/UPI)                │
└─────────────────────────────────────────────────┘

Memory access latency:
  Local memory:  ~100ns
  Remote memory: ~200ns (2x penalty)
```

**NUMA-aware allocation:**
```c
/* mm/mempolicy.c */
/* Allocate on current NUMA node */
page = alloc_pages_node(numa_node_id(), GFP_KERNEL, 0);

/* Allocate on specific node */
page = alloc_pages_node(node, GFP_KERNEL, 0);
```

### Cache Line Effects

**False sharing:**
```c
/* BAD: Two CPUs contending on same cache line */
struct bad_percpu {
    int cpu0_counter;  // Offset 0
    int cpu1_counter;  // Offset 4 (same 64-byte cache line!)
};

/* GOOD: Each on separate cache line */
struct good_percpu {
    int cpu0_counter;
    char pad[60];      // Pad to 64 bytes
    int cpu1_counter;
} ____cacheline_aligned;
```

**Prefetching:**
```c
/* Explicit prefetch (hint to CPU) */
prefetch(ptr);         // Prefetch for read
prefetchw(ptr);        // Prefetch for write

/* Used in linked list traversal */
list_for_each_entry(pos, head, member) {
    prefetch(pos→member.next);  // Prefetch next item
    process(pos);
}
```

---

## 🔟 ASCII Architecture Diagrams

### System Overview

```
┌───────────────────────────────────────────────────────────────┐
│                      USER SPACE APPLICATIONS                   │
│   (browsers, databases, shells, etc.)                         │
└─────────────────────┬─────────────────────────────────────────┘
                      │ syscall/ioctl
                      ↓
┌───────────────────────────────────────────────────────────────┐
│                      LINUX KERNEL                              │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Scheduler   │  │     VFS      │  │   Network    │        │
│  │   (Layer 2)  │  │  (Layer 4)   │  │  (Layer 7)   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Memory     │  │  Block Layer │  │   Security   │        │
│  │   Manager    │  │  (Layer 5)   │  │  (Layer 9)   │        │
│  │  (Layer 3)   │  └──────────────┘  └──────────────┘        │
│  └──────────────┘                                              │
│         ↓                    ↓                ↓                 │
│  ┌──────────────────────────────────────────────────┐         │
│  │        DEVICE DRIVERS (Layer 6)                  │         │
│  │   (NVMe, SCSI, Network, GPU, etc.)               │         │
│  └──────────────────────────────────────────────────┘         │
│         ↓                    ↓                ↓                 │
└─────────┼────────────────────┼────────────────┼───────────────┘
          │                    │                │
          ↓                    ↓                ↓
┌───────────────────────────────────────────────────────────────┐
│              HARDWARE (Layer 0)                                │
│                                                                 │
│  ┌────────┐  ┌───────┐  ┌──────────┐  ┌────────────────┐    │
│  │  CPU   │  │  MMU  │  │   APIC   │  │  PCIe Root     │    │
│  │        │  │       │  │          │  │  Complex       │    │
│  └────────┘  └───────┘  └──────────┘  └────────────────┘    │
│                                               │                │
│                                               ├───┐            │
│                                               ↓   ↓            │
│                                         ┌─────────────┐        │
│                                         │   NVMe SSD  │        │
│                                         └─────────────┘        │
└───────────────────────────────────────────────────────────────┘
```

### Interrupt Flow

```
Device                 PCIe              APIC              CPU           Kernel
------                 ----              ----              ---           ------
  │                      │                 │                │               │
  │ Complete I/O         │                 │                │               │
  │                      │                 │                │               │
  ├─ Write MSI-X ───────>│                 │                │               │
  │  message             │                 │                │               │
  │                      │                 │                │               │
  │                      ├─ Route to ─────>│                │               │
  │                      │   APIC          │                │               │
  │                      │                 │                │               │
  │                      │                 ├─ Deliver ─────>│               │
  │                      │                 │   IRQ          │               │
  │                      │                 │                │               │
  │                      │                 │                ├─ Vector ────>│
  │                      │                 │                │   to IDT     │
  │                      │                 │                │               │
  │                      │                 │                │               ├─ Call handler
  │                      │                 │                │               │
  │                      │                 │                │               ├─ Process CQ
  │                      │                 │                │               │
  │<────────────────────────────────────────────────────────────────────── ACK interrupt
  │                      │                 │                │               │
  │                      │                 │                │               ├─ Complete BIO
  │                      │                 │                │               │
  │                      │                 │                │               ├─ Wake up process
```

---

## Summary of Layer 0

**Hardware layer provides:**
1. **Computational substrate**: CPUs execute kernel code
2. **Memory translation**: MMU provides virtual memory
3. **Interrupt delivery**: APIC/GIC routes hardware events to CPUs
4. **Device connectivity**: PCIe connects peripherals
5. **DMA capability**: Devices access memory directly
6. **Isolation**: Privilege levels separate kernel from user space

**Key takeaways:**
- All software ultimately executes as CPU instructions
- MMU provides virtual memory abstraction
- Interrupts are the primary hardware→software notification mechanism
- DMA enables high-performance I/O without CPU copying
- Cache coherency is maintained by hardware (MESI protocol)
- NUMA topology affects memory access performance
- Understanding hardware is critical for kernel debugging and optimization

---


# Layer 1 - Architecture-Specific Code

## 1️⃣ High-Level Purpose

Layer 1 provides the **architecture-specific abstraction** between hardware (Layer 0) and portable kernel code (Layers 2+). This layer:

- **Bootstraps the system**: Early boot, CPU initialization, memory setup
- **Implements low-level primitives**: System call entry, exception handling, context switching
- **Manages CPU-specific features**: Extended instruction sets (SSE, AVX), virtualization extensions (VMX, SVM)
- **Provides hardware abstractions**: Atomic operations, memory barriers, cache management
- **Handles interrupts and exceptions**: IDT setup, trap handlers, page fault handling

**Position in system architecture:**
Acts as the portability boundary. All code above Layer 1 is (mostly) architecture-independent. Different CPU architectures (x86, ARM, RISC-V) implement the same kernel interfaces differently.

**Interaction with other subsystems:**
- Layer 0 (Hardware): Direct assembly/C interface to CPU features
- Layer 2 (Core Kernel): Provides schedule(), context_switch(), preemption primitives
- Layer 3 (Memory): Provides page table manipulation, TLB management
- All layers: Provides atomic ops, barriers, percpu data

---

## 2️⃣ Directory Mapping

```
arch/
├── x86/                           # x86 (32-bit) and x86_64 (64-bit)
│   ├── entry/                     # System call and exception entry points
│   │   ├── entry_64.S             # 64-bit syscall entry (SYSCALL instruction)
│   │   ├── entry_32.S             # 32-bit syscall entry (INT 0x80)
│   │   ├── entry_64_compat.S      # 32-bit compat on 64-bit kernel
│   │   ├── syscall_64.c           # Syscall table setup
│   │   └── common.c               # Common syscall handling
│   │
│   ├── kernel/                    # Core x86 kernel code
│   │   ├── process_64.c           # Process management (context switch)
│   │   ├── process_32.c           # 32-bit process management
│   │   ├── setup.c                # Early boot setup
│   │   ├── head_64.S              # Early boot assembly (startup_64)
│   │   ├── cpu/                   # CPU feature detection
│   │   │   ├── common.c           # CPU identification, feature setup
│   │   │   ├── intel.c            # Intel-specific setup
│   │   │   ├── amd.c              # AMD-specific setup
│   │   │   └── mce/               # Machine Check Exception handling
│   │   ├── apic/                  # APIC (interrupt controller) drivers
│   │   │   ├── apic.c             # Local APIC management
│   │   │   └── io_apic.c          # I/O APIC management
│   │   ├── traps.c                # Exception handlers (page fault, GPF, etc.)
│   │   ├── irq_64.c               # IRQ handling
│   │   └── smp.c                  # SMP initialization
│   │
│   ├── mm/                        # x86 memory management
│   │   ├── fault.c                # Page fault handler
│   │   ├── tlb.c                  # TLB management
│   │   ├── pgtable.c              # Page table operations
│   │   ├── ioremap.c              # Device memory mapping
│   │   ├── pat.c                  # Page Attribute Table (cache control)
│   │   └── hugetlbpage.c          # Huge page support
│   │
│   ├── lib/                       # x86 optimized library functions
│   │   ├── memcpy_64.S            # Optimized memcpy
│   │   ├── copy_user_64.S         # User space copy (with fault handling)
│   │   └── atomic64_64.c          # 64-bit atomic operations
│   │
│   ├── kvm/                       # KVM virtualization (x86-specific)
│   │   ├── vmx/                   # Intel VMX (VT-x) support
│   │   └── svm/                   # AMD SVM (AMD-V) support
│   │
│   └── include/asm/               # x86 architecture headers
│       ├── processor.h            # struct cpuinfo_x86, CPU features
│       ├── ptrace.h               # struct pt_regs (register state)
│       ├── pgtable.h              # Page table macros
│       ├── atomic.h               # Atomic operations
│       ├── barrier.h              # Memory barriers
│       └── msr.h                  # Model Specific Registers
│
├── arm64/                         # ARM 64-bit
│   ├── kernel/                    # ARM64 kernel code
│   │   ├── entry.S                # Exception/syscall entry
│   │   ├── process.c              # Context switching
│   │   ├── setup.c                # Boot setup
│   │   └── traps.c                # Exception handlers
│   ├── mm/                        # ARM64 memory management
│   │   ├── fault.c                # Page fault handling
│   │   └── mmu.c                  # MMU setup
│   └── include/asm/               # ARM64 headers
│
├── riscv/                         # RISC-V architecture
├── powerpc/                       # PowerPC
├── mips/                          # MIPS
└── [other architectures]
```

---

## 3️⃣ Core Source Files

### x86_64 Critical Files

| File | Purpose |
|------|---------|
| `arch/x86/entry/entry_64.S` | 64-bit syscall entry point (SYSCALL instruction handler) |
| `arch/x86/entry/syscall_64.c` | Syscall table and dispatch |
| `arch/x86/kernel/process_64.c` | Context switching (__switch_to), FPU state management |
| `arch/x86/kernel/head_64.S` | Early boot code (startup_64), identity mapping setup |
| `arch/x86/kernel/setup.c` | Architecture initialization (setup_arch()) |
| `arch/x86/kernel/traps.c` | Exception handlers (do_page_fault, do_general_protection) |
| `arch/x86/kernel/cpu/common.c` | CPU feature detection, GDT/IDT setup |
| `arch/x86/kernel/apic/apic.c` | Local APIC initialization and management |
| `arch/x86/mm/fault.c` | Page fault handler (do_page_fault, do_kern_addr_fault) |
| `arch/x86/mm/tlb.c` | TLB shootdown and synchronization |
| `arch/x86/mm/pgtable.c` | Page table allocation and manipulation |

### ARM64 Critical Files

| File | Purpose |
|------|---------|
| `arch/arm64/kernel/entry.S` | Exception vectors, syscall entry (SVC instruction) |
| `arch/arm64/kernel/process.c` | Context switching (cpu_switch_to) |
| `arch/arm64/mm/fault.c` | Page fault handling |
| `arch/arm64/mm/mmu.c` | MMU initialization, page table setup |

---

## 4️⃣ Core Data Structures

### struct pt_regs - Register State

```c
/* arch/x86/include/uapi/asm/ptrace.h */
struct pt_regs {
    /*
     * C ABI says these regs are callee-preserved. They are saved
     * only when necessary.
     */
    unsigned long r15;
    unsigned long r14;
    unsigned long r13;
    unsigned long r12;
    unsigned long rbp;
    unsigned long rbx;

    /* Arguments to syscall/function: rdi, rsi, rdx, rcx, r8, r9 */
    unsigned long r11;  // Also holds saved RFLAGS on syscall entry
    unsigned long r10;
    unsigned long r9;
    unsigned long r8;
    unsigned long rax;  // Syscall number and return value
    unsigned long rcx;  // Holds return RIP on syscall entry
    unsigned long rdx;
    unsigned long rsi;
    unsigned long rdi;

    /*
     * On syscall entry, this is syscall number. On CPU exception,
     * this is error code.
     */
    unsigned long orig_rax;

    /* Return frame for iretq */
    unsigned long rip;     // Instruction pointer
    unsigned long cs;      // Code segment
    unsigned long eflags;  // CPU flags (RFLAGS)
    unsigned long rsp;     // Stack pointer
    unsigned long ss;      // Stack segment
};
```

**Purpose:**
Saves complete CPU register state when transitioning from user→kernel (syscall, interrupt, exception).

**Lifetime:**
Created on kernel stack during entry, destroyed on exit (SYSRET/IRETQ).

**Usage:**
- Syscall arguments passed in registers (rdi, rsi, rdx, r10, r8, r9)
- Return value in rax
- Preserved across context switches for interrupted tasks
- Used by ptrace for debugging (reading/writing user registers)

---

### struct task_struct (arch-specific part)

```c
/* arch/x86/include/asm/processor.h */
struct thread_struct {
    /* Cached TLS descriptors */
    struct desc_struct  tls_array[GDT_ENTRY_TLS_ENTRIES];

    /* Saved FPU/extended state */
    struct fpu          fpu;

    /* Fault info: */
    unsigned long       cr2;        // Page fault address
    unsigned long       trap_nr;    // Exception number
    unsigned long       error_code; // Exception error code

    /* I/O permissions */
    struct io_bitmap    *io_bitmap; // TSS I/O permission bitmap

    /* Debug registers */
    unsigned long       debugreg0;
    unsigned long       debugreg1;
    unsigned long       debugreg2;
    unsigned long       debugreg3;
    unsigned long       debugreg6;  // DR6 - Debug status
    unsigned long       debugreg7;  // DR7 - Debug control

    /* Segment registers */
    unsigned long       fsindex;    // FS segment selector
    unsigned long       gsindex;    // GS segment selector
    unsigned long       fsbase;     // FS base address
    unsigned long       gsbase;     // GS base address (user)

    /* ... */
};
```

**Purpose:**
Holds architecture-specific per-task state that must be saved/restored on context switch.

**Key fields:**
- `fpu`: FPU/SSE/AVX register state (can be large: up to 2KB for AVX-512)
- `fsbase/gsbase`: Thread-local storage (TLS) base addresses
- `debugreg*`: Hardware breakpoint configuration
- `io_bitmap`: Per-task I/O port permissions (for userspace drivers)

**Lifetime:**
Allocated with task_struct, freed on task exit.

**Locking:**
Protected by task lock when modified by external threads (ptrace).

---

### struct desc_struct - GDT/IDT Entry

```c
/* arch/x86/include/asm/desc_defs.h */
struct desc_struct {
    u16 limit0;          // Limit bits 0-15
    u16 base0;           // Base address bits 0-15
    u16 base1: 8;        // Base address bits 16-23
    u16 type: 4;         // Segment type
    u16 s: 1;            // Descriptor type (0=system, 1=code/data)
    u16 dpl: 2;          // Descriptor Privilege Level
    u16 p: 1;            // Present
    u16 limit1: 4;       // Limit bits 16-19
    u16 avl: 1;          // Available for software use
    u16 l: 1;            // 64-bit code segment
    u16 d: 1;            // Default operation size (32-bit)
    u16 g: 1;            // Granularity
    u16 base2: 8;        // Base address bits 24-31
} __attribute__((packed));
```

**Purpose:**
Defines segments in the Global Descriptor Table (GDT) or Local Descriptor Table (LDT).

**Usage in x86_64:**
- Segmentation is mostly unused (flat memory model)
- CS/SS still checked for privilege levels
- FS/GS used for thread-local storage (via MSRs, not descriptors)
- TLS descriptors in GDT for 32-bit compat mode

---

## 5️⃣ Call Path Tracing

### System Call Entry Path (x86_64)

**Complete trace from userspace to kernel:**

```
User Space                          Kernel Space (arch/x86)
----------                          -----------------------
libc wrapper:
  syscall()                         1. CPU executes SYSCALL instruction
    ↓                                  - RIP → RCX (save return address)
  SYSCALL instruction                  - RFLAGS → R11 (save flags)
    ↓                                  - Load RIP from IA32_LSTAR MSR
                                       - Load CS from IA32_STAR MSR
                                       - Switch to Ring 0

                                    2. entry_SYSCALL_64
                                       (arch/x86/entry/entry_64.S:88)
                                       ├─ swapgs              (Switch GS base to kernel)
                                       ├─ Save user RSP to per-CPU area
                                       ├─ SWITCH_TO_KERNEL_CR3 (Switch page tables)
                                       ├─ Load kernel stack pointer
                                       ├─ Push registers to stack (build pt_regs)
                                       ├─ PUSH_AND_CLEAR_REGS (Clear for Spectre)
                                       └─ Call do_syscall_64()

                                    3. do_syscall_64()
                                       (arch/x86/entry/common.c)
                                       ├─ syscall_enter_from_user_mode()
                                       ├─ instrumentation_begin()
                                       ├─ Extract syscall number from RAX
                                       ├─ Bounds check syscall number
                                       ├─ Look up handler: sys_call_table[nr]
                                       ├─ Call handler: sys_read(), sys_write(), etc.
                                       │
                                       └─ syscall_exit_to_user_mode()

                                    4. Generic syscall handler (e.g., sys_read)
                                       (fs/read_write.c)
                                       ├─ Validate fd
                                       ├─ Get struct file from fd
                                       ├─ Call VFS: vfs_read()
                                       └─ Return value in RAX

                                    5. Return to user space
                                       entry_SYSCALL_64_after_hwframe:
                                       ├─ POP_REGS (restore registers)
                                       ├─ SWITCH_TO_USER_CR3 (switch to user page tables)
                                       ├─ swapgs (switch back to user GS)
                                       └─ SYSRETQ instruction
                                          - RCX → RIP (restore user instruction pointer)
                                          - R11 → RFLAGS (restore flags)
                                          - Switch to Ring 3

Return to user space
  ↓
libc returns to application
```

**Key assembly code from entry_64.S:**

```asm
SYM_CODE_START(entry_SYSCALL_64)
    swapgs                              /* Swap to kernel GS base */
    movq    %rsp, PER_CPU_VAR(cpu_tss_rw + TSS_sp2)  /* Save user RSP */
    SWITCH_TO_KERNEL_CR3 scratch_reg=%rsp            /* Load kernel page tables */
    movq    PER_CPU_VAR(cpu_current_top_of_stack), %rsp  /* Load kernel stack */

    /* Build struct pt_regs on stack */
    pushq   $__USER_DS                  /* SS */
    pushq   PER_CPU_VAR(cpu_tss_rw + TSS_sp2)  /* RSP */
    pushq   %r11                        /* RFLAGS */
    pushq   $__USER_CS                  /* CS */
    pushq   %rcx                        /* RIP */

    /* Save all registers */
    PUSH_AND_CLEAR_REGS rax=$-ENOSYS

    /* Now in kernel mode with full pt_regs */
    movq    %rax, %rdi                  /* Syscall number as arg1 */
    movq    %rsp, %rsi                  /* pt_regs as arg2 */
    call    do_syscall_64               /* Call C handler */

    /* ... exit path ... */
SYM_CODE_END(entry_SYSCALL_64)
```

---

### Page Fault Path (x86_64)

**Hardware to software transition:**

```
Hardware Fault                      Kernel Handler
--------------                      --------------
CPU detects fault:                  1. CPU vectors through IDT
  - Invalid PTE                        entry #14 (Page Fault)
  - Protection violation                   ↓
  - NX bit violation                  2. asm_exc_page_fault
                                         (arch/x86/entry/entry_64.S)
        ↓                                  ├─ Save registers
                                           ├─ Read CR2 (faulting address)
CPU pushes error code:                     ├─ Build pt_regs
  bit 0: Present (0=not present)           └─ Call exc_page_fault()
  bit 1: Write (0=read, 1=write)              ↓
  bit 2: User (0=kernel, 1=user)          3. exc_page_fault()
  bit 3: Reserved bit violation              (arch/x86/mm/fault.c)
  bit 4: Instruction fetch                   ├─ irqentry_state = enter_from_kernel/user
                                             ├─ Read CR2 → address
        ↓                                    ├─ Determine fault type
                                             └─ Call handle_page_fault()
CPU looks up IDT entry 14                         ↓
        ↓                                    4. handle_page_fault()
                                                ├─ Check if fault in kernel/user
CPU saves state:                                ├─ Bad area check
  - Push SS, RSP, RFLAGS, CS, RIP               ├─ VMA lookup (find_vma)
  - Push error code                             ├─ Permission check
        ↓                                       │
                                                ├─ Valid fault?
CPU jumps to fault handler                      │   └→ __do_page_fault()
        ↓                                       │      ├─ Check if page in swap
                                                │      ├─ Demand paging
Kernel handler executes                         │      ├─ COW (copy-on-write)
                                                │      └─ Allocate physical page
                                                │
                                                └─ Invalid fault?
                                                    └→ no_context()
                                                       ├─ Kernel oops
                                                       └─ Send SIGSEGV to user process
```

**Fault handling decision tree:**

```
exc_page_fault(address, error_code)
    |
    ├─ Fault in kernel space? (address >= TASK_SIZE_MAX)
    │   ├─ Vmalloc fault? → vmalloc_fault() → Fix up page tables
    │   └─ Bad kernel access → no_context() → Oops/panic
    │
    └─ Fault in user space
        |
        ├─ find_vma(mm, address)  // Lookup VMA
        │   |
        │   ├─ VMA not found → bad_area() → SIGSEGV
        │   └─ VMA found
        │
        ├─ Check permissions
        │   ├─ Write to read-only? → bad_area_access_error() → SIGSEGV
        │   ├─ Execute NX page? → bad_area_access_error() → SIGSEGV
        │   └─ Permission OK
        │
        └─ handle_mm_fault() (Generic MM code, Layer 3)
            |
            ├─ Page not present? → do_anonymous_page() / do_fault()
            ├─ Copy-on-write? → do_wp_page()
            └─ Swap in page? → do_swap_page()
```

**Real code from arch/x86/mm/fault.c:**

```c
void do_user_addr_fault(struct pt_regs *regs,
                        unsigned long error_code,
                        unsigned long address)
{
    struct vm_area_struct *vma;
    struct task_struct *tsk = current;
    struct mm_struct *mm = tsk->mm;

    /* Find VMA covering faulting address */
    vma = find_vma(mm, address);
    if (!vma) {
        bad_area(regs, error_code, address);
        return;
    }

    /* Check if address is within VMA */
    if (vma->vm_start <= address)
        goto good_area;

good_area:
    /* Check access permissions */
    if (error_code & X86_PF_WRITE) {
        if (!(vma->vm_flags & VM_WRITE)) {
            bad_area_access_error(regs, error_code, address);
            return;
        }
    }

    /* Let generic MM handle the fault */
    fault = handle_mm_fault(vma, address, flags, regs);
    /* ... */
}
```

---

### Context Switch Path

**Process context switch on x86_64:**

```
Scheduler (kernel/sched/core.c)             Architecture (arch/x86)
-------------------------------             -----------------------
schedule()
    ↓
context_switch(prev, next)
    |
    ├─ Switch MM (if different address space)
    │   └─ switch_mm_irqs_off(prev_mm, next_mm, next)
    │       (arch/x86/mm/tlb.c)
    │       ├─ Load next process's CR3 (page table root)
    │       │   write_cr3(__sme_pa(next_mm->pgd))
    │       ├─ Update per-CPU active_mm
    │       └─ Conditional TLB flush
    │
    └─ Switch registers/stack
        └─ switch_to(prev, next, prev)  // Macro
            └─ __switch_to_asm(prev, next)
                (arch/x86/entry/entry_64.S)
                |
                ├─ Save prev registers to prev->thread
                │   PUSH all callee-saved registers (RBX, RBP, R12-R15)
                │   movq %rsp, TASK_threadsp(prev)  // Save RSP
                │
                ├─ Switch stack to next
                │   movq TASK_threadsp(next), %rsp  // Load next RSP
                │
                ├─ Call __switch_to(prev, next)
                │   (arch/x86/kernel/process_64.c)
                │   ├─ Load next task's FS/GS base
                │   │   wrmsrl(MSR_FS_BASE, next->thread.fsbase)
                │   │   wrmsrl(MSR_KERNEL_GS_BASE, next->thread.gsbase)
                │   │
                │   ├─ Switch FPU context (lazy)
                │   │   switch_fpu_prepare/finish()
                │   │
                │   ├─ Load I/O bitmap if needed
                │   │   tss_update_io_bitmap()
                │   │
                │   └─ Update current_task per-CPU variable
                │       this_cpu_write(current_task, next)
                │
                └─ Restore next registers from next->thread
                    POP all callee-saved registers
                    ret  // Return to next task's execution
```

**Assembly implementation (__switch_to_asm):**

```asm
/* arch/x86/entry/entry_64.S */
SYM_FUNC_START(__switch_to_asm)
    /* Save callee-saved registers */
    pushq   %rbp
    pushq   %rbx
    pushq   %r12
    pushq   %r13
    pushq   %r14
    pushq   %r15

    /* Save old stack pointer */
    movq    %rsp, TASK_threadsp(%rdi)   /* prev->thread.sp = rsp */

    /* Load new stack pointer */
    movq    TASK_threadsp(%rsi), %rsp   /* rsp = next->thread.sp */

    /* Call C function to do the rest */
    call    __switch_to

    /* Restore callee-saved registers */
    popq    %r15
    popq    %r14
    popq    %r13
    popq    %r12
    popq    %rbx
    popq    %rbp

    ret    /* Return to next task */
SYM_FUNC_END(__switch_to_asm)
```

---

## 6️⃣ Concurrency Model

### Per-CPU Data

**Purpose:**
Avoid cache line contention by giving each CPU its own copy of frequently accessed data.

**Implementation (x86_64):**

```c
/* include/linux/percpu-defs.h */
#define DEFINE_PER_CPU(type, name) \
    __percpu __attribute__((section(".data..percpu"))) type name

/* Example: per-CPU current task */
DEFINE_PER_CPU(struct task_struct *, current_task);

/* Access from C code */
struct task_struct *task = this_cpu_read(current_task);
this_cpu_write(current_task, new_task);

/* Access from assembly (using GS segment) */
movq %gs:current_task, %rax   /* Read current task */
```

**x86_64 uses GS segment for per-CPU access:**

```
Each CPU has unique GS base (via MSR_GS_BASE):
  CPU 0: GS base = &per_cpu_offset[0]
  CPU 1: GS base = &per_cpu_offset[1]
  ...

Access pattern:
  %gs:variable → [GS_BASE + offset_of(variable)]

Example:
  CPU 0 executes: movq %gs:current_task, %rax
    → Reads from [CPU0_base + offset_of(current_task)]
  CPU 1 executes: movq %gs:current_task, %rax
    → Reads from [CPU1_base + offset_of(current_task)]
  
  Both access same variable name, different memory locations!
```

---

### Atomic Operations

**x86 LOCK prefix:**

```c
/* arch/x86/include/asm/atomic.h */
static __always_inline void arch_atomic_add(int i, atomic_t *v)
{
    asm volatile(LOCK_PREFIX "addl %1,%0"
                 : "+m" (v->counter)
                 : "ir" (i)
                 : "memory");
}

static __always_inline int arch_atomic_add_return(int i, atomic_t *v)
{
    return i + xadd(&v->counter, i);  /* LOCK XADD instruction */
}

/* LOCK XADD: atomic exchange and add */
static __always_inline int xadd(int *addr, int inc)
{
    int old;
    asm volatile(LOCK_PREFIX "xaddl %0, %1"
                 : "=r" (old), "+m" (*addr)
                 : "0" (inc)
                 : "memory");
    return old;
}
```

**Hardware semantics:**
```
LOCK prefix:
  - Asserts CPU's LOCK# signal (or uses cache locking)
  - Ensures atomic RMW (read-modify-write)
  - Implicitly acts as memory barrier
  - Works across multiple CPUs via MESI protocol
```

**Compare-and-swap (CAS):**

```c
/* arch/x86/include/asm/cmpxchg.h */
static __always_inline bool
arch_atomic_cmpxchg(atomic_t *v, int old, int new)
{
    return cmpxchg(&v->counter, old, new) == old;
}

/* CMPXCHG instruction wrapper */
#define cmpxchg(ptr, old, new) \
    __cmpxchg(ptr, old, new, sizeof(*(ptr)))

static inline unsigned long __cmpxchg(volatile void *ptr,
                                      unsigned long old,
                                      unsigned long new,
                                      int size)
{
    unsigned long prev;
    switch (size) {
    case 8:
        asm volatile(LOCK_PREFIX "cmpxchgq %2,%1"
                     : "=a"(prev), "+m"(*(u64 *)ptr)
                     : "r"(new), "0"(old)
                     : "memory");
        break;
    }
    return prev;
}
```

**Usage in spinlocks:**

```c
/* kernel/locking/spinlock.c - simplified */
void spin_lock(spinlock_t *lock)
{
    while (1) {
        if (arch_atomic_cmpxchg(&lock->val, 0, 1) == 0)
            break;  /* Got the lock */
        cpu_relax();  /* Spin with PAUSE instruction */
    }
}

void spin_unlock(spinlock_t *lock)
{
    arch_atomic_set(&lock->val, 0);  /* Release lock */
}
```

---

## 7️⃣ Memory Model

### Page Table Manipulation

**x86_64 page table levels:**

```c
/* arch/x86/include/asm/pgtable_types.h */
typedef struct { pgdval_t pgd; } pgd_t;  /* Level 4 (PGD) */
typedef struct { p4dval_t p4d; } p4d_t;  /* Level 4 (with 5-level paging) */
typedef struct { pudval_t pud; } pud_t;  /* Level 3 (PUD) */
typedef struct { pmdval_t pmd; } pmd_t;  /* Level 2 (PMD) */
typedef struct { pteval_t pte; } pte_t;  /* Level 1 (PTE) */

/* Page table entry flags */
#define _PAGE_PRESENT   (1UL << 0)
#define _PAGE_RW        (1UL << 1)
#define _PAGE_USER      (1UL << 2)
#define _PAGE_PWT       (1UL << 3)
#define _PAGE_PCD       (1UL << 4)
#define _PAGE_ACCESSED  (1UL << 5)
#define _PAGE_DIRTY     (1UL << 6)
#define _PAGE_PSE       (1UL << 7)  /* Huge page */
#define _PAGE_GLOBAL    (1UL << 8)
#define _PAGE_NX        (1UL << 63) /* No-execute */
```

**Page table walk (software):**

```c
/* arch/x86/mm/pgtable.c - simplified */
pte_t *lookup_address(unsigned long address, unsigned int *level)
{
    pgd_t *pgd = pgd_offset(current->mm, address);
    if (pgd_none(*pgd))
        return NULL;

    p4d_t *p4d = p4d_offset(pgd, address);
    if (p4d_none(*p4d))
        return NULL;

    pud_t *pud = pud_offset(p4d, address);
    if (pud_none(*pud))
        return NULL;
    if (pud_large(*pud)) {  /* 1GB huge page */
        *level = PG_LEVEL_1G;
        return (pte_t *)pud;
    }

    pmd_t *pmd = pmd_offset(pud, address);
    if (pmd_none(*pmd))
        return NULL;
    if (pmd_large(*pmd)) {  /* 2MB huge page */
        *level = PG_LEVEL_2M;
        return (pte_t *)pmd;
    }

    *level = PG_LEVEL_4K;
    return pte_offset_kernel(pmd, address);
}
```

---

### TLB Management

**TLB (Translation Lookaside Buffer) invalidation:**

```c
/* arch/x86/include/asm/tlbflush.h */

/* Flush single TLB entry for one address */
static inline void __flush_tlb_one_user(unsigned long addr)
{
    asm volatile("invlpg (%0)" :: "r" (addr) : "memory");
}

/* Flush all TLB entries (reload CR3) */
static inline void __flush_tlb_all(void)
{
    unsigned long cr3;
    cr3 = __read_cr3();
    __write_cr3(cr3);  /* Reload CR3 flushes TLB */
}

/* Flush TLB on all CPUs (TLB shootdown) */
void flush_tlb_mm(struct mm_struct *mm)
{
    /* Send IPI to all CPUs using this mm */
    on_each_cpu_mask(mm_cpumask(mm), flush_tlb_func_local, &info, 1);
}
```

**TLB shootdown protocol:**

```
CPU 0 modifies page table entry
    ↓
1. CPU 0: Modify PTE (e.g., unmap page)
    ↓
2. CPU 0: Send IPI to all other CPUs using this mm
    ↓
3. Other CPUs receive IPI:
    ├─ Save current state
    ├─ Execute flush_tlb_func_local()
    │   └─ invlpg or reload CR3
    └─ Send ACK
    ↓
4. CPU 0: Wait for all ACKs
    ↓
5. CPU 0: Continue (all CPUs have flushed TLBs)
```

---

## 8️⃣ Hardware Interaction

### MSR (Model-Specific Register) Access

**Reading/Writing MSRs:**

```c
/* arch/x86/include/asm/msr.h */

/* Read MSR */
static inline unsigned long long native_read_msr(unsigned int msr)
{
    unsigned long low, high;
    asm volatile("rdmsr" : "=a" (low), "=d" (high) : "c" (msr));
    return ((unsigned long long)high << 32) | low;
}

/* Write MSR */
static inline void native_write_msr(unsigned int msr,
                                    unsigned low, unsigned high)
{
    asm volatile("wrmsr" : : "c" (msr), "a" (low), "d" (high) : "memory");
}

/* Common wrapper */
#define rdmsrl(msr, val) \
    ((val) = native_read_msr((msr)))

#define wrmsrl(msr, val) \
    native_write_msr((msr), (u32)((u64)(val)), (u32)((u64)(val) >> 32))
```

**Critical MSRs:**

```c
/* MSR addresses */
#define MSR_IA32_SYSENTER_CS    0x00000174  /* SYSENTER CS */
#define MSR_IA32_SYSENTER_ESP   0x00000175  /* SYSENTER ESP */
#define MSR_IA32_SYSENTER_EIP   0x00000176  /* SYSENTER EIP */
#define MSR_STAR                0xc0000081  /* Syscall CS/SS */
#define MSR_LSTAR               0xc0000082  /* Syscall entry point (64-bit) */
#define MSR_CSTAR               0xc0000083  /* Compat syscall entry */
#define MSR_SYSCALL_MASK        0xc0000084  /* RFLAGS mask for syscall */
#define MSR_FS_BASE             0xc0000100  /* FS segment base */
#define MSR_GS_BASE             0xc0000101  /* GS segment base */
#define MSR_KERNEL_GS_BASE      0xc0000102  /* Swapped GS base */
```

**Setting up syscall entry during boot:**

```c
/* arch/x86/kernel/cpu/common.c */
void syscall_init(void)
{
    /* Set syscall entry point */
    wrmsrl(MSR_LSTAR, (unsigned long)entry_SYSCALL_64);

    /* Set segment selectors for syscall/sysret */
    wrmsrl(MSR_STAR, ((u64)__USER32_CS << 48) |
                     ((u64)__KERNEL_CS << 32));

    /* Mask interrupts during syscall entry */
    wrmsrl(MSR_SYSCALL_MASK, X86_EFLAGS_IF | X86_EFLAGS_DF);
}
```

---

### CPU Feature Detection

**CPUID instruction:**

```c
/* arch/x86/include/asm/processor.h */
static inline void native_cpuid(unsigned int *eax, unsigned int *ebx,
                                unsigned int *ecx, unsigned int *edx)
{
    asm volatile("cpuid"
                 : "=a" (*eax), "=b" (*ebx), "=c" (*ecx), "=d" (*edx)
                 : "0" (*eax), "2" (*ecx)
                 : "memory");
}

/* Feature detection */
/* arch/x86/kernel/cpu/common.c */
static void detect_features(struct cpuinfo_x86 *c)
{
    unsigned int eax, ebx, ecx, edx;

    /* CPUID leaf 1: Standard features */
    cpuid(0x00000001, &eax, &ebx, &ecx, &edx);
    c->x86_capability[CPUID_1_ECX] = ecx;
    c->x86_capability[CPUID_1_EDX] = edx;

    /* Check for SSE support */
    if (edx & (1 << 25))
        set_cpu_cap(c, X86_FEATURE_SSE);

    /* Check for AVX support */
    if (ecx & (1 << 28))
        set_cpu_cap(c, X86_FEATURE_AVX);

    /* Extended features */
    cpuid(0x80000001, &eax, &ebx, &ecx, &edx);
    c->x86_capability[CPUID_8000_0001_ECX] = ecx;

    /* Check for 1GB pages */
    if (edx & (1 << 26))
        set_cpu_cap(c, X86_FEATURE_GBPAGES);
}
```

---

## 9️⃣ Performance Considerations

### Spectre/Meltdown Mitigations

**KPTI (Kernel Page Table Isolation):**

```
Without KPTI:
  User address space: 0x0000_0000_0000_0000 - 0x0000_7FFF_FFFF_FFFF
  Kernel address space: 0xFFFF_8000_0000_0000 - 0xFFFF_FFFF_FFFF_FFFF
  Same page tables for user and kernel!
  → Spectre/Meltdown can leak kernel memory

With KPTI:
  Two sets of page tables per process:
    1. User page tables: Only user mappings + minimal kernel entry stubs
    2. Kernel page tables: Full kernel + user mappings

  On syscall entry:
    SWITCH_TO_KERNEL_CR3  /* Switch to kernel page tables */
  On syscall exit:
    SWITCH_TO_USER_CR3    /* Switch back to user page tables */

  Cost: ~5-30% overhead on syscall-heavy workloads
```

**Retpoline (Return Trampoline):**

```c
/* Mitigate branch prediction attacks */
/* Instead of indirect call: */
call *%rax  /* Vulnerable to Spectre v2 */

/* Use retpoline: */
call __x86_indirect_thunk_rax
```

---

### Cache Effects

**Cacheline alignment:**

```c
/* Align structure to cache line boundary (64 bytes on x86) */
struct aligned_data {
    int value;
} ____cacheline_aligned;

/* Prevent false sharing */
struct percpu_data {
    int counter;
    char pad[60];  /* Pad to 64 bytes */
} ____cacheline_aligned_in_smp;
```

**Prefetching:**

```c
/* arch/x86/include/asm/processor.h */
static inline void prefetch(const void *ptr)
{
    asm volatile("prefetcht0 %0" :: "m" (*(const char *)ptr));
}

static inline void prefetchw(const void *ptr)
{
    asm volatile("prefetchw %0" :: "m" (*(const char *)ptr));
}
```

---

## 🔟 ASCII Architecture Diagrams

### System Call Flow

```
User Space          Kernel Entry (arch/x86)          Core Kernel
----------          -----------------------           -----------
Application                                           
    |                                                 
    | libc: syscall()                                
    |                                                 
    ├─→ SYSCALL instruction                          
         |                                            
         ├─ CPU saves state                          
         |  RIP→RCX, RFLAGS→R11                     
         |                                            
         └─→ entry_SYSCALL_64                        
             (entry_64.S:88)                          
               |                                      
               ├─ swapgs                              
               ├─ Save user RSP                       
               ├─ Switch CR3 (KPTI)                  
               ├─ Load kernel stack                   
               ├─ Build pt_regs                       
               |                                      
               └─→ do_syscall_64()                    
                   (common.c)                         
                     |                                
                     ├─ Enter from user mode          
                     ├─ Look up syscall table         
                     |                                
                     └─→ sys_read/write/etc() ───────→ VFS layer
                                                        (Layer 4)
                         Return value in RAX           
                         |                             
                     ←───┘                             
                     |                                 
                   Exit to user mode                   
                     |                                 
                     └─→ entry_SYSCALL_64_return       
                         ├─ Restore registers          
                         ├─ Switch CR3 back            
                         ├─ swapgs                     
                         └─ SYSRETQ                    
                              |                        
                              └─→ Return to user       
```

### Context Switch Flow

```
Scheduler                    Memory Switch               Register Switch
---------                    -------------               ---------------
schedule()
    |
    ├─ Pick next task
    |  (CFS, deadline, etc.)
    |
    └─→ context_switch(prev, next)
         |
         ├─→ switch_mm()
         |   (arch/x86/mm/tlb.c)
         |   ├─ Load new CR3
         |   |  write_cr3(next->mm->pgd)
         |   |
         |   ├─ Flush TLB (conditional)
         |   |  ├─ Per-process ASIDs (PCIDs)
         |   |  └─ Lazy TLB switching
         |   |
         |   └─ Update active_mm
         |
         └─→ switch_to(prev, next)                   __switch_to_asm
             (macro)                                  (entry_64.S)
                                                       |
                                                       ├─ PUSH RBP, RBX,
                                                       |  R12-R15
                                                       |
                                                       ├─ Save prev->sp
                                                       |  movq %rsp,
                                                       |       prev->thread.sp
                                                       |
                                                       ├─ Load next->sp
                                                       |  movq next->thread.sp,
                                                       |       %rsp
                                                       |
                                                       ├─→ __switch_to()
                                                       |   (process_64.c)
                                                       |   ├─ Load FS/GS base
                                                       |   ├─ Switch FPU
                                                       |   ├─ Load I/O bitmap
                                                       |   └─ Update current
                                                       |
                                                       └─ POP R15-R12,
                                                          RBX, RBP
                                                          ret (to next task)
```

### Exception Handling Flow

```
User/Kernel Code        CPU                IDT Entry              Exception Handler
----------------        ---                ---------              -----------------
                        Detects exception
Instruction             (divide by 0,
executes ───────────→   page fault,        
                        GPF, etc.)         
                           |               
                           ├─ Look up       IDT[vector]
                           |  vector in     ├─ entry #0:  Divide Error
                           |  IDT            ├─ entry #6:  Invalid Opcode
                           |                 ├─ entry #13: GPF
                           ├─ Check DPL      └─ entry #14: Page Fault
                           |                 
                           ├─ Switch to                      
                           |  kernel mode                    
                           |  (if from user)                 
                           |                                 
                           ├─ Push error                     
                           |  code (if any)                  
                           |                                 
                           ├─ Push IRET                      
                           |  frame:                         
                           |  SS, RSP,                       
                           |  RFLAGS,                        
                           |  CS, RIP                        
                           |                                 
                           └─→ Jump to handler ────────────→ asm_exc_page_fault
                                                              (entry_64.S)
                                                               |
                                                               ├─ Save regs
                                                               ├─ Read CR2
                                                               |
                                                               └─→ exc_page_fault()
                                                                   (fault.c)
                                                                   ├─ Analyze fault
                                                                   ├─ Check VMA
                                                                   ├─ Fix page table
                                                                   └─ Return or
                                                                      send signal
                                                                      (SIGSEGV)
```

---

## Summary of Layer 1

**Architecture-specific code provides:**

1. **Boot and initialization**: Early setup, CPU feature detection
2. **Low-level entry/exit**: Syscalls, interrupts, exceptions
3. **Context management**: Process switching, TLS, FPU state
4. **Memory primitives**: Page table manipulation, TLB management
5. **Synchronization**: Atomic ops, barriers, per-CPU data
6. **Hardware interface**: MSRs, CPUID, special instructions

**Key takeaways:**
- Assembly code in arch/x86/entry/ handles all transitions (user↔kernel)
- struct pt_regs captures register state at entry points
- Context switch involves both memory (CR3) and register state
- Per-CPU data avoids contention using GS segment
- Security mitigations (KPTI, retpoline) add overhead but prevent leaks
- Understanding arch code is critical for debugging low-level issues

**Files to remember:**
- `arch/x86/entry/entry_64.S` - All entry points
- `arch/x86/kernel/process_64.c` - Context switching
- `arch/x86/mm/fault.c` - Page fault handling

---


# Layer 2 - Core Kernel

## 1️⃣ High-Level Purpose

Layer 2 implements the **core kernel subsystems** that manage fundamental OS abstractions:

- **Process Scheduler**: CPU time allocation, load balancing, scheduling policies (CFS, real-time, deadline)
- **Process Management**: Task creation (fork/clone), execution (exec), termination (exit)
- **Signal Handling**: Asynchronous event delivery to processes
- **Timers and Time Management**: Kernel timers, hrtimers, time keeping, tick handling
- **Workqueues**: Deferred work execution in process context
- **Kthreads**: Kernel threads for background tasks
- **SMP Support**: CPU hotplug, IPI (inter-processor interrupts)
- **Locking Primitives**: Mutexes, semaphores, completion, RCU
- **Preemption and IRQ Management**: Controlling when kernel can be preempted

**Position in system architecture:**
Sits above arch-specific code (Layer 1), provides portable abstractions to all other subsystems (memory, VFS, networking, etc.). All kernel code depends on scheduler and locking primitives.

**Interaction with other subsystems:**
- Layer 1 (arch): Uses context_switch(), provides timer interrupts
- Layer 3 (mm): Allocates task_struct, manages process address spaces
- Layer 4-7 (I/O): Processes wait on I/O, scheduler wakes them on completion
- All layers: Use timers, workqueues, locking primitives

---

## 2️⃣ Directory Mapping

```
kernel/
├── sched/                         # Scheduler subsystem
│   ├── core.c                     # Main scheduler logic
│   ├── fair.c                     # CFS (Completely Fair Scheduler)
│   ├── rt.c                       # Real-time scheduler (SCHED_FIFO, SCHED_RR)
│   ├── deadline.c                 # Deadline scheduler (EDF)
│   ├── idle.c                     # Idle task scheduling
│   ├── wait.c                     # Wait queues
│   ├── loadavg.c                  # Load average calculation
│   ├── cpuacct.c                  # CPU accounting
│   ├── topology.c                 # CPU topology (cores, sockets, NUMA)
│   ├── cputime.c                  # CPU time accounting
│   └── debug.c                    # Scheduler debugging
│
├── fork.c                         # Process creation (fork, vfork, clone)
├── exec_domain.c                  # Execution domains
├── exit.c                         # Process termination
├── signal.c                       # Signal delivery and handling
├── sys.c                          # System calls (getpid, getppid, etc.)
├── kthread.c                      # Kernel threads
├── workqueue.c                    # Workqueue implementation
├── softirq.c                      # Software interrupts
├── taskstats.c                    # Per-task statistics
│
├── time/                          # Time management
│   ├── timekeeping.c              # System time keeping
│   ├── timer.c                    # Low-resolution timers
│   ├── hrtimer.c                  # High-resolution timers
│   ├── tick-sched.c               # Tick scheduling (NO_HZ)
│   ├── tick-common.c              # Tick device management
│   ├── clocksource.c              # Clock source management
│   └── alarmtimer.c               # RTC-backed timers
│
├── locking/                       # Locking primitives
│   ├── mutex.c                    # Mutexes
│   ├── semaphore.c                # Semaphores
│   ├── spinlock.c                 # Spinlocks (generic)
│   ├── rwsem.c                    # Reader-writer semaphores
│   ├── rtmutex.c                  # RT mutexes
│   ├── lockdep.c                  # Lock dependency validator
│   └── rwlock.c                   # Reader-writer locks
│
├── rcu/                           # Read-Copy-Update
│   ├── tree.c                     # RCU tree implementation
│   ├── update.c                   # RCU update mechanisms
│   └── srcutree.c                 # Sleepable RCU
│
├── irq/                           # Generic IRQ handling
│   ├── handle.c                   # IRQ flow handlers
│   ├── manage.c                   # IRQ management (request_irq)
│   ├── chip.c                     # IRQ chip abstraction
│   ├── spurious.c                 # Spurious IRQ detection
│   └── irqdesc.c                  # IRQ descriptors
│
├── smp.c                          # SMP support
├── cpu.c                          # CPU hotplug
├── stop_machine.c                 # Stop machine facility
├── hung_task.c                    # Hung task detection
├── panic.c                        # Kernel panic handling
├── reboot.c                       # System reboot/shutdown
├── ptrace.c                       # Process tracing (debugging)
├── capability.c                   # POSIX capabilities
├── groups.c                       # Supplementary groups
├── uid16.c                        # 16-bit UID support
├── user.c                         # User structure management
└── cred.c                         # Credentials management
```

---

## 3️⃣ Core Source Files

| File | Purpose |
|------|---------|
| `kernel/sched/core.c` | Main scheduler: schedule(), context_switch(), load balancing |
| `kernel/sched/fair.c` | CFS implementation: vruntime, red-black tree, entity selection |
| `kernel/sched/rt.c` | Real-time scheduler: priority queues, deadline enforcement |
| `kernel/fork.c` | Process creation: do_fork(), copy_process(), allocate task_struct |
| `kernel/exit.c` | Process termination: do_exit(), release resources, notify parent |
| `kernel/signal.c` | Signal handling: send_signal(), do_signal(), signal delivery |
| `kernel/workqueue.c` | Workqueue API: queue_work(), worker threads, concurrency management |
| `kernel/time/hrtimer.c` | High-resolution timers: nanosecond precision, red-black tree |
| `kernel/time/timer.c` | Low-res timers: jiffies-based, timer wheels |
| `kernel/locking/mutex.c` | Mutex implementation: optimistic spinning, MCS locks |
| `kernel/rcu/tree.c` | RCU implementation: grace periods, callbacks |
| `kernel/irq/handle.c` | Generic IRQ handling: handle_irq(), dispatch to drivers |
| `kernel/smp.c` | SMP functions: smp_call_function(), IPI coordination |

---

## 4️⃣ Core Data Structures

### struct task_struct - Process Descriptor

```c
/* include/linux/sched.h */
struct task_struct {
    /* Volatile state - on CPU or runnable */
    volatile long               state;          // TASK_RUNNING, TASK_INTERRUPTIBLE, etc.
    
    /* Stack */
    void                        *stack;         // Kernel stack (typically 16KB on x86_64)
    
    /* Scheduling */
    int                         on_cpu;         // Running on CPU?
    int                         prio;           // Priority
    int                         static_prio;    // Static priority (nice value)
    int                         normal_prio;    // Normal priority
    unsigned int                rt_priority;    // Real-time priority
    
    const struct sched_class    *sched_class;   // Scheduling policy
    struct sched_entity         se;             // CFS scheduling entity
    struct sched_rt_entity      rt;             // RT scheduling entity
    struct sched_dl_entity      dl;             // Deadline scheduling entity
    
    unsigned int                policy;         // SCHED_NORMAL, SCHED_FIFO, SCHED_RR, SCHED_DEADLINE
    int                         nr_cpus_allowed; // CPU affinity
    cpumask_t                   cpus_mask;      // CPU affinity mask
    
    /* Process identity */
    pid_t                       pid;            // Process ID
    pid_t                       tgid;           // Thread group ID (main thread PID)
    
    /* Process relationships */
    struct task_struct __rcu    *real_parent;   // Real parent
    struct task_struct __rcu    *parent;        // Parent (may be debugger)
    struct list_head            children;       // Child processes
    struct list_head            sibling;        // Sibling processes
    struct task_struct          *group_leader;  // Thread group leader
    
    /* Credentials */
    const struct cred __rcu     *cred;          // Effective credentials
    const struct cred __rcu     *real_cred;     // Real credentials
    
    /* Filesystem info */
    struct fs_struct            *fs;            // Filesystem information (cwd, root)
    struct files_struct         *files;         // Open file descriptors
    
    /* Memory management */
    struct mm_struct            *mm;            // Memory descriptor
    struct mm_struct            *active_mm;     // Active mm (for kernel threads)
    
    /* Signal handling */
    struct signal_struct        *signal;        // Shared signal handling
    struct sighand_struct       *sighand;       // Signal handlers
    sigset_t                    blocked;        // Blocked signals
    struct sigpending           pending;        // Private pending signals
    
    /* Time */
    u64                         utime;          // User CPU time
    u64                         stime;          // System CPU time
    u64                         gtime;          // Guest CPU time
    unsigned long               nvcsw;          // Voluntary context switches
    unsigned long               nivcsw;         // Involuntary context switches
    u64                         start_time;     // Process start time (monotonic)
    u64                         start_boottime; // Process start time (boot-based)
    
    /* Architecture-specific state */
    struct thread_struct        thread;         // CPU registers, FPU state, etc. (arch/x86)
    
    /* ... many more fields ... */
};
```

**Purpose:**
Complete descriptor for a process or thread. This is THE central data structure in the kernel.

**Lifetime:**
- Allocated: fork/clone via copy_process()
- Lives on: Until process exits
- Freed: After parent reaps (wait/waitpid) or becomes zombie

**Location:**
Allocated from slab cache (task_struct_cachep), typically allocated with kernel stack.

**Locking:**
- task→alloc_lock: Protects allocation
- RCU: For traversing task lists
- task_lock(task): Protects some fields (mm, files, fs)

**Key relationships:**
```
task_struct
    ├→ mm_struct (memory descriptor)
    ├→ files_struct (open files)
    ├→ fs_struct (filesystem context)
    ├→ signal_struct (shared signal info)
    └→ sched_entity (scheduler bookkeeping)
```

---

### struct sched_entity - CFS Scheduling Entity

```c
/* include/linux/sched.h */
struct sched_entity {
    struct load_weight      load;           // Weight for load balancing
    struct rb_node          run_node;       // Red-black tree node
    struct list_head        group_node;     // Group scheduling
    unsigned int            on_rq;          // On runqueue?
    
    u64                     exec_start;     // Last time started executing
    u64                     sum_exec_runtime; // Total time executed
    u64                     vruntime;       // Virtual runtime (key for CFS)
    u64                     prev_sum_exec_runtime; // Previous total runtime
    
    u64                     nr_migrations;  // Number of CPU migrations
    
    /* Statistics for debugging/analysis */
    struct sched_statistics statistics;
    
    /* Bandwidth control (cgroups) */
    struct cfs_rq           *cfs_rq;        // CFS runqueue
    struct cfs_rq           *my_q;          // For group scheduling
};
```

**Purpose:**
Scheduler's view of a task for CFS. The `vruntime` field is critical - CFS always picks the task with smallest vruntime.

**vruntime calculation:**
```
vruntime += (delta_exec × NICE_0_LOAD) / se.load.weight

Lower priority (higher nice) → higher weight → slower vruntime growth
Higher priority (lower nice) → lower weight → faster vruntime growth
```

---

### struct rq - Per-CPU Runqueue

```c
/* kernel/sched/sched.h */
struct rq {
    raw_spinlock_t          lock;           // Runqueue lock
    
    unsigned int            nr_running;     // # tasks on this runqueue
    u64                     nr_switches;    // # context switches
    
    /* Per-scheduling-class runqueues */
    struct cfs_rq           cfs;            // CFS runqueue
    struct rt_rq            rt;             // Real-time runqueue
    struct dl_rq            dl;             // Deadline runqueue
    
    /* Currently running task */
    struct task_struct      *curr;          // Current task
    struct task_struct      *idle;          // Idle task
    struct task_struct      *stop;          // Stop task (highest priority)
    
    /* CPU this runqueue belongs to */
    int                     cpu;
    
    /* Load tracking */
    struct load_weight      load;           // Total load
    unsigned long           cpu_capacity;   // CPU capacity
    unsigned long           cpu_capacity_orig; // Original capacity
    
    /* Time accounting */
    u64                     clock;          // Runqueue clock
    u64                     clock_task;     // Task clock
    
    /* Idle balance */
    int                     idle_balance;
    
    /* ... */
};
```

**Purpose:**
Per-CPU structure holding all runnable tasks. Each CPU has exactly one runqueue.

**Organization:**
```
CPU 0                     CPU 1                     CPU 2
┌─────────┐              ┌─────────┐              ┌─────────┐
│ struct rq│              │ struct rq│              │ struct rq│
├─────────┤              ├─────────┤              ├─────────┤
│ curr    │──→ Task A    │ curr    │──→ Task D    │ curr    │──→ Task F
│ cfs.rb_tree│           │ cfs.rb_tree│           │ cfs.rb_tree│
│   ├→Task B │            │   ├→Task E │            │   ├→Task G │
│   └→Task C │            │   └→(empty)│            │   └→Task H │
│ rt.queue│              │ rt.queue│              │ rt.queue│
│ dl.queue│              │ dl.queue│              │ dl.queue│
└─────────┘              └─────────┘              └─────────┘
```

**Locking:**
Protected by rq→lock (raw_spinlock). Held during most scheduling operations.

---

### struct cfs_rq - CFS Runqueue

```c
/* kernel/sched/sched.h */
struct cfs_rq {
    struct load_weight      load;           // Total load
    unsigned int            nr_running;     // # tasks
    
    u64                     exec_clock;     // Total execution time
    u64                     min_vruntime;   // Minimum vruntime in tree
    
    /* Red-black tree of schedulable entities */
    struct rb_root_cached   tasks_timeline; // RB-tree root
    
    /* Currently running entity */
    struct sched_entity     *curr;
    struct sched_entity     *next;          // Next to run
    struct sched_entity     *last;          // Last entity
    struct sched_entity     *skip;          // Skip this entity
    
    /* Group scheduling */
    struct task_group       *tg;
    
    /* Bandwidth control */
    int                     runtime_enabled;
    s64                     runtime_remaining;
    
    /* ... */
};
```

**Purpose:**
Holds all CFS tasks for a CPU in a red-black tree, ordered by vruntime.

**Red-black tree structure:**
```
                      [vruntime=1000]
                     /               \
          [vruntime=500]          [vruntime=1500]
           /         \              /          \
    [vr=400]      [vr=700]    [vr=1200]    [vr=1800]

Leftmost node (vruntime=400) is next to run!
```

---

### wait_queue_head_t - Wait Queue

```c
/* include/linux/wait.h */
struct wait_queue_head {
    spinlock_t              lock;           // Protects list
    struct list_head        head;           // List of waiters
};

struct wait_queue_entry {
    unsigned int            flags;          // WQ_FLAG_EXCLUSIVE, etc.
    void                    *private;       // Usually points to task_struct
    wait_queue_func_t       func;           // Wakeup function
    struct list_head        entry;          // List linkage
};
```

**Purpose:**
Generic mechanism for processes to wait for events. Used throughout kernel (I/O completion, locks, etc.).

**Usage pattern:**
```c
/* Declare wait queue */
DECLARE_WAIT_QUEUE_HEAD(my_wait_queue);

/* Process waiting for event */
void wait_for_event(void)
{
    DEFINE_WAIT(wait);
    
    add_wait_queue(&my_wait_queue, &wait);
    while (!event_occurred()) {
        prepare_to_wait(&my_wait_queue, &wait, TASK_INTERRUPTIBLE);
        if (event_occurred())
            break;
        schedule();  /* Sleep until woken */
    }
    finish_wait(&my_wait_queue, &wait);
}

/* Another context waking waiters */
void signal_event(void)
{
    event_flag = 1;
    wake_up(&my_wait_queue);  /* Wake all/one waiter(s) */
}
```

---

## 5️⃣ Call Path Tracing

### Process Scheduling Path

**Timer interrupt → schedule():**

```
Hardware Timer Interrupt            Scheduler
-----------------------             ---------
Timer fires (e.g., 1000 Hz)
    ↓
arch-specific IRQ entry
(arch/x86/entry/entry_64.S)
    ↓
handle_irq()
    ↓
timer_interrupt()                   1. Tick processing
(kernel/time/timer.c)                  update_process_times()
    ↓                                  ├─ account_process_tick()  (charge time to task)
scheduler_tick()                       ├─ run_local_timers()
(kernel/sched/core.c)                  └─ scheduler_tick()
    ├─ Update statistics                    |
    ├─ Update vruntime                      ├─ Update task→se.exec_start
    ├─ Check time slice                     ├─ curr→sched_class→task_tick()
    └─ Set TIF_NEED_RESCHED                 │   (e.g., task_tick_fair() for CFS)
                                            │   ├─ update_curr()  (update vruntime)
                                            │   ├─ entity_tick()
                                            │   └─ check_preempt_tick()
                                            │       └─ Set TIF_NEED_RESCHED if needed
                                            │
                                            └─ Trigger load balancing (periodically)

Exit from interrupt                2. Scheduler invocation
    ↓                                  (on return to userspace or preemption point)
Check TIF_NEED_RESCHED                 
    ↓                                  
schedule()                          3. Core scheduling
(kernel/sched/core.c)                  
    ├─ preempt_disable()
    ├─ raw_spin_lock_irq(&rq→lock)
    │
    ├─ prev = current task
    ├─ next = pick_next_task()
    │   └─ For each sched_class (stop, dl, rt, cfs, idle):
    │       └─ class→pick_next_task()
    │           └─ For CFS: pick_next_entity()
    │               └─ rb_first_cached()  // Leftmost in RB-tree
    │
    ├─ if (prev == next)
    │   └─ Skip context switch
    │
    ├─ context_switch(prev, next)      4. Context switch
    │   (kernel/sched/core.c)             ├─ switch_mm()  (change page tables)
    │                                     │   └─ write_cr3(next→mm→pgd)
    │                                     │
    │                                     └─ switch_to(prev, next)
    │                                         └─ __switch_to_asm()  (arch/x86)
    │                                             ├─ Save prev registers
    │                                             ├─ Load next registers
    │                                             └─ Call __switch_to()
    │
    └─ raw_spin_unlock_irq(&rq→lock)
    
    /* Now running as 'next' task */
```

**Key decision: pick_next_task():**

```c
/* kernel/sched/core.c - simplified */
static struct task_struct *pick_next_task(struct rq *rq)
{
    struct task_struct *p;
    
    /* Try each scheduling class in priority order */
    
    /* 1. Stop task (highest priority) */
    p = stop_sched_class.pick_next_task(rq);
    if (p)
        return p;
    
    /* 2. Deadline tasks */
    p = dl_sched_class.pick_next_task(rq);
    if (p)
        return p;
    
    /* 3. Real-time tasks */
    p = rt_sched_class.pick_next_task(rq);
    if (p)
        return p;
    
    /* 4. CFS (normal) tasks */
    p = fair_sched_class.pick_next_task(rq);
    if (p)
        return p;
    
    /* 5. Idle task (always available) */
    return idle_sched_class.pick_next_task(rq);
}
```

**CFS pick_next_entity():**

```c
/* kernel/sched/fair.c */
static struct sched_entity *pick_next_entity(struct cfs_rq *cfs_rq)
{
    /* Get leftmost (smallest vruntime) from RB-tree */
    struct rb_node *left = rb_first_cached(&cfs_rq→tasks_timeline);
    if (!left)
        return NULL;
    
    return rb_entry(left, struct sched_entity, run_node);
}
```

---

### Process Creation Path (fork)

**User space → kernel fork:**

```
User Space                          Kernel
----------                          ------
fork() / clone() libc wrapper       
    ↓                               
syscall (SYS_clone)                 
    ↓                               
entry_SYSCALL_64                    1. Syscall entry
(arch/x86/entry/entry_64.S)            (Layer 1)
    ↓                               
do_syscall_64()                     
    ↓                               
__do_sys_clone()                    2. Clone syscall handler
(kernel/fork.c)                        
    ↓                               
kernel_clone()                      3. Kernel clone
(kernel/fork.c)                        
    ├─ Allocate PID                    
    └─ copy_process()               4. Main fork logic
        |                              
        ├─ dup_task_struct()           5. Duplicate task_struct
        │   ├─ alloc_task_struct_node()   // Allocate from slab
        │   ├─ alloc_thread_stack_node()  // Allocate kernel stack
        │   └─ memcpy(tsk, current)       // Copy current to new
        │   
        ├─ copy_creds()                6. Copy credentials
        │   
        ├─ sched_fork()                7. Scheduler setup
        │   ├─ task→state = TASK_NEW
        │   ├─ task→prio = current→normal_prio
        │   ├─ task→sched_class = &fair_sched_class
        │   ├─ task→se.vruntime = 0
        │   └─ Set initial time slice
        │   
        ├─ copy_files()                8. Copy file descriptors
        │   └─ If CLONE_FILES: share files_struct
        │       Else: duplicate files_struct
        │   
        ├─ copy_fs()                   9. Copy filesystem info
        │   
        ├─ copy_mm()                   10. Copy memory descriptor
        │   ├─ If CLONE_VM: share mm_struct (threads)
        │   └─ Else: dup_mm()
        │       ├─ Allocate new mm_struct
        │       ├─ Copy VMAs (vm_area_struct)
        │       └─ Set up COW (copy-on-write)
        │   
        ├─ copy_thread()               11. Arch-specific copy
        │   (arch/x86/kernel/process_64.c)
        │   ├─ Set child RIP to ret_from_fork
        │   ├─ Child RAX = 0 (return value for child)
        │   └─ Copy FPU state
        │   
        ├─ alloc_pid()                 12. Allocate PID
        │   
        └─ sched_setscheduler()        13. Set scheduling policy
            
    ↓                               
wake_up_new_task()                  14. Add to runqueue
(kernel/sched/core.c)                  
    ├─ task→state = TASK_RUNNING       
    ├─ activate_task()                 
    │   └─ enqueue_task()              
    │       └─ enqueue_task_fair()     
    │           └─ Add to CFS RB-tree  
    └─ check_preempt_curr()            
        └─ Maybe set TIF_NEED_RESCHED  

Parent returns with child PID       15. Return
Child scheduled, returns 0           
```

---

### Signal Delivery Path

**kill() syscall → signal delivery:**

```
User: kill(pid, SIGTERM)            Kernel
------------------------            ------
syscall(SYS_kill, pid, sig)         
    ↓                               
entry_SYSCALL_64                    
    ↓                               
__do_sys_kill()                     1. Kill syscall
(kernel/signal.c)                      
    ↓                               
kill_something_info()               
    ↓                               
group_send_sig_info()               2. Send to process group
    ↓                               
do_send_sig_info()                  
    ↓                               
send_signal_locked()                3. Queue signal
(kernel/signal.c)                      
    ├─ prepare_signal()                
    │   ├─ Check if ignored/blocked    
    │   └─ Remove stop/continue signals
    │   
    ├─ __sigqueue_alloc()              4. Allocate sigqueue entry
    │   
    ├─ sigaddset(&pending→signal, sig) 5. Add to pending set
    │   
    └─ complete_signal()               6. Notify target
        ├─ Set TIF_SIGPENDING flag     
        └─ wake_up_state(t, TASK_INTERRUPTIBLE)
            └─ try_to_wake_up()        
                └─ Enqueue task on runqueue

Target process scheduled            7. Return to userspace
    ↓                               
exit_to_user_mode_prepare()         8. Check signals
(kernel/entry/common.c)                
    ↓                               
do_signal()                         
(arch/x86/kernel/signal.c)          
    ↓                               
get_signal()                        9. Dequeue signal
(kernel/signal.c)                      
    ├─ dequeue_signal()                
    ├─ Look up handler                 
    │   └─ sigaction[SIGTERM]          
    │   
    └─ If SIG_DFL:                 10. Handle signal
        └─ do_group_exit()             // Default: terminate
            └─ do_exit()               
        If SIG_IGN:                    
            └─ Ignore                  
        If handler:                    
            └─ setup_rt_frame()        // Call user handler
                └─ Modify user stack/RIP

User handler runs                   11. User-space handler
    ↓                               
sigreturn()                         12. Return from handler
    ↓                               
Restore original context            
```

---

## 6️⃣ Concurrency Model

### Spinlocks vs Mutexes

**Spinlock usage:**
```c
spinlock_t my_lock;

spin_lock(&my_lock);            // Disable preemption, spin if locked
/* Critical section - CANNOT SLEEP */
spin_unlock(&my_lock);          // Enable preemption
```

**When to use:**
- Protecting data accessed in interrupt context
- Very short critical sections (few instructions)
- Cannot call functions that might sleep

**Mutex usage:**
```c
struct mutex my_mutex;

mutex_lock(&my_mutex);          // Can sleep if locked
/* Critical section - CAN SLEEP */
mutex_unlock(&my_mutex);
```

**When to use:**
- Longer critical sections
- Can sleep inside (e.g., copy_from_user, kmalloc with GFP_KERNEL)
- Process context only (not IRQ)

---

### RCU (Read-Copy-Update)

**Purpose:**
Optimized for read-heavy scenarios. Readers access data without locks!

**Basic pattern:**
```c
/* Reader (no locks!) */
rcu_read_lock();
ptr = rcu_dereference(global_ptr);
if (ptr)
    do_something(ptr→data);
rcu_read_unlock();

/* Writer */
new = kmalloc(sizeof(*new), GFP_KERNEL);
*new = *old;  /* Copy old to new */
new→data = updated_value;  /* Update new copy */
rcu_assign_pointer(global_ptr, new);  /* Atomic update */
synchronize_rcu();  /* Wait for all readers */
kfree(old);  /* Safe to free now */
```

**How it works:**
```
Time    Reader A         Reader B         Writer
----    --------         --------         ------
t0      rcu_read_lock()
t1      read old data                     Allocate new
t2      read old data    rcu_read_lock()  Update pointer
t3      rcu_read_unlock() read NEW data
t4                       read NEW data    synchronize_rcu() - BLOCKS
t5                       rcu_read_unlock()
t6                                        synchronize_rcu() - RETURNS
t7                                        kfree(old) - SAFE!
```

---

## 7️⃣ Memory Model

### Task Stack

**Kernel stack layout (x86_64, 16KB):**
```
High address
┌─────────────────────┐
│   struct pt_regs    │  ← User register state (on syscall/interrupt entry)
├─────────────────────┤
│   Return addresses  │
│   Local variables   │  ← Current stack pointer (RSP)
│   ...               │
├─────────────────────┤
│   struct task_struct│  ← (Sometimes embedded at stack bottom)
│   (or pointer to it)│
└─────────────────────┘
Low address (stack bottom)
```

**Stack allocation:**
```c
/* kernel/fork.c */
static unsigned long *alloc_thread_stack_node(struct task_struct *tsk, int node)
{
    struct page *page = alloc_pages_node(node, THREADINFO_GFP, THREAD_SIZE_ORDER);
    return page ? page_address(page) : NULL;
}

#define THREAD_SIZE_ORDER  2  // 4 pages = 16KB on x86_64
#define THREAD_SIZE        (PAGE_SIZE << THREAD_SIZE_ORDER)
```

---

## 8️⃣ Hardware Interaction

### Timer Hardware

**Programmable Interrupt Timer (PIT) / APIC Timer:**

```c
/* kernel/time/tick-common.c */
static void tick_setup_device(struct tick_device *td, struct clock_event_device *newdev, int cpu)
{
    /* Set up periodic tick or one-shot mode */
    if (tick_device_uses_broadcast(newdev))
        tick_setup_broadcast_device(newdev);
    else
        tick_setup_periodic(newdev, 0);
}

/* Configure APIC timer for next tick */
static int lapic_next_event(unsigned long delta, struct clock_event_device *evt)
{
    apic_write(APIC_TMICT, delta);  // Write to timer initial count
    return 0;
}
```

**Hardware timer → scheduler tick:**
```
APIC Timer                          Kernel
----------                          ------
Counts down from initial value
    ↓
Reaches zero
    ↓
Fires interrupt (vector assigned)
    ↓                               
CPU vectors through IDT             
    ↓                               
smp_apic_timer_interrupt()          
(arch/x86/kernel/apic/apic.c)       
    ↓                               
local_apic_timer_interrupt()        
    ↓                               
tick_handle_periodic()              
(kernel/time/tick-common.c)         
    ↓                               
update_process_times()              
    ↓                               
scheduler_tick()                    
```

---

## 9️⃣ Performance Considerations

### Context Switch Cost

**What happens in a context switch:**
1. Save prev registers (~10 instructions)
2. Switch page tables (write CR3) - **EXPENSIVE**
   - Flushes TLB (~100-1000 cycles penalty)
   - Future memory accesses require page table walk
3. Load next registers (~10 instructions)
4. Switch FPU state (lazy - only if needed)
5. Update per-CPU current task

**Typical costs:**
- Direct cost: ~1-5 µs
- Indirect cost (cache/TLB misses): ~10-100 µs
- Total: ~1-10µs on modern CPUs

**Optimization: Process Control ID (PCID):**
```
Without PCID:
  write_cr3() flushes entire TLB (expensive!)

With PCID (x86):
  Each process has 12-bit PCID in CR3
  TLB entries tagged with PCID
  write_cr3() with different PCID doesn't flush TLB!
  
  Cost reduction: ~30-50% on some workloads
```

---

### Scheduler Overhead

**Scheduler invocations:**
- Timer tick: ~1000 Hz (every 1ms) on CONFIG_HZ=1000
- Wakeups: Variable (I/O completions, signals, etc.)
- Voluntary: yield(), blocking I/O, mutex contention

**Load balancing:**
```
Every tick (1ms):
  ├─ Load stats update (cheap)
  └─ Local balancing check

Every balance_interval ticks (~4ms):
  └─ Pull tasks from other CPUs
      ├─ Lock remote runqueue
      ├─ Check if imbalanced
      └─ Migrate task (expensive - TLB flush!)

Every rebalance_domains (~1s):
  └─ Full domain rebalancing
      └─ Check all CPUs in NUMA node/socket
```

---

## 🔟 ASCII Architecture Diagrams

### CFS Scheduler Structure

```
Per-CPU Runqueues
─────────────────

CPU 0 Runqueue                        CPU 1 Runqueue
┌────────────────────┐                ┌────────────────────┐
│ struct rq          │                │ struct rq          │
├────────────────────┤                ├────────────────────┤
│ curr: Task A       │ (running)     │ curr: Task E       │ (running)
│                    │                │                    │
│ cfs_rq:            │                │ cfs_rq:            │
│  min_vruntime=1000 │                │  min_vruntime=1200 │
│  nr_running=3      │                │  nr_running=2      │
│                    │                │                    │
│  RB-tree:          │                │  RB-tree:          │
│       [1050]       │                │      [1250]        │
│       /    \       │                │      /    \        │
│   [1020] [1100]    │                │  [1220] [1300]     │
│     ↓      ↓       │                │    ↓      ↓        │
│   Task B Task C    │                │  Task F Task G     │
│   Task D           │                │                    │
└────────────────────┘                └────────────────────┘

Scheduler picks leftmost (Task B on CPU 0, Task F on CPU 1)
```

### Task State Transitions

```
                           fork()
                             ↓
                      ┌────────────┐
                      │ TASK_NEW   │
                      └────────────┘
                             ↓ wake_up_new_task()
                      ┌────────────┐
            ┌────────→│  RUNNING   │←──────────┐
            │         └────────────┘           │
            │ wakeup        │ schedule()       │ wakeup
            │               ↓                  │
            │         ┌────────────┐           │
            │         │  On CPU    │           │
            │         │ (executing)│           │
            │         └────────────┘           │
            │               │                  │
            │               ├─→ Block on I/O  │
            │               │                  │
            │         ┌────────────────────────┴────┐
            └─────────│ TASK_INTERRUPTIBLE    │     │
                      │ TASK_UNINTERRUPTIBLE  │     │
                      │ TASK_KILLABLE         │     │
                      └───────────────────────────┬─┘
                                  │               │
                              exit() │            │ signal
                                  ↓               │
                          ┌────────────┐          │
                          │ TASK_DEAD  │          │
                          └────────────┘          │
                                  │               │
                              do_exit()           │
                                  ↓               │
                          ┌────────────┐          │
                          │  ZOMBIE    │──────────┘
                          │ (waiting   │  wait/waitpid
                          │  for reap) │
                          └────────────┘
                                  │
                             parent wait()
                                  ↓
                            [Freed]
```

### Workqueue Architecture

```
Workqueue Subsystem
───────────────────

User Code                    Workqueue                Worker Threads
─────────                    ─────────                ──────────────

schedule_work(&work) ──→  ┌──────────────┐
                          │  Global WQ   │
                          │  (system_wq) │
                          └──────────────┘
                                 │
                                 ↓
queue_delayed_work() ────→  Per-CPU Worker Pools
                            ┌─────────────┬─────────────┬─────────────┐
                            │   CPU 0     │   CPU 1     │   CPU 2     │
                            ├─────────────┼─────────────┼─────────────┤
                            │ Work List:  │ Work List:  │ Work List:  │
                            │  ├─ work1   │  ├─ work4   │  ├─ work7   │
                            │  ├─ work2   │  ├─ work5   │  └─ work8   │
                            │  └─ work3   │  └─ work6   │             │
                            └─────────────┴─────────────┴─────────────┘
                                 │              │              │
                                 ↓              ↓              ↓
                            ┌──────────┐  ┌──────────┐  ┌──────────┐
                            │ Worker   │  │ Worker   │  │ Worker   │
                            │ Thread 0 │  │ Thread 1 │  │ Thread 2 │
                            │ kworker/ │  │ kworker/ │  │ kworker/ │
                            │   0:0    │  │   1:0    │  │   2:0    │
                            └──────────┘  └──────────┘  └──────────┘
                                 │              │              │
                                 └──────────────┴──────────────┘
                                            Executes work functions
```

---

## Summary of Layer 2

**Core kernel provides:**

1. **CPU scheduling**: Fair (CFS), real-time (RT), deadline scheduling policies
2. **Process lifecycle**: Creation (fork), execution (exec), termination (exit)
3. **Synchronization**: Spinlocks, mutexes, semaphores, RCU, wait queues
4. **Time management**: Timers, high-resolution timers, tick handling
5. **Deferred work**: Workqueues, softirqs, tasklets
6. **Signal handling**: Asynchronous event delivery

**Key takeaways:**
- Scheduler runs every tick (~1ms) to enforce fairness
- CFS uses red-black tree ordered by vruntime
- Context switch involves register + memory (CR3) switch
- RCU enables lockless reads for read-heavy data
- Wait queues are fundamental: I/O, locks, signals all use them
- Understanding scheduler critical for performance tuning

**Critical files:**
- `kernel/sched/core.c` - Main scheduler
- `kernel/sched/fair.c` - CFS implementation
- `kernel/fork.c` - Process creation
- `kernel/signal.c` - Signal handling

---


# Layer 3 - Memory Management

## 1️⃣ High-Level Purpose

Layer 3 implements the Linux **memory management subsystem** (mm), responsible for:

- **Physical memory allocation**: Page allocator (buddy system), SLUB/SLAB allocators
- **Virtual memory management**: Process address spaces, VMAs, page tables
- **Page cache**: Caching file data in RAM
- **Swap**: Moving pages to/from disk
- **Memory reclaim**: Freeing memory under pressure (kswapd, direct reclaim)
- **Huge pages**: 2MB/1GB pages for reduced TLB pressure
- **NUMA**: Non-uniform memory access optimization
- **Memory cgroups**: Per-cgroup memory limits and accounting
- **OOM killer**: Killing processes when out of memory
- **Copy-on-write (COW)**: Lazy copying for fork()
- **Demand paging**: Allocate pages only when accessed

**Position in system architecture:**
Sits between arch-specific MMU code (Layer 1) and all other subsystems. Every kernel operation uses memory allocation. VFS (Layer 4) heavily uses page cache.

**Interaction with other subsystems:**
- Layer 1 (arch): Uses page table manipulation, TLB management
- Layer 2 (scheduler): Allocates task_struct, manages mm_struct per process
- Layer 4 (VFS): Page cache for file data
- Layer 5 (block): Buffers for I/O
- All layers: Use kmalloc/vmalloc/page allocator

---

## 2️⃣ Directory Mapping

```
mm/
├── page_alloc.c                   # Physical page allocator (buddy system)
├── slab_common.c                  # SLAB allocator common code
├── slub.c                         # SLUB allocator (default)
├── slab.c                         # Original SLAB allocator
├── vmalloc.c                      # Virtual memory allocator
├── mmap.c                         # Memory mapping (mmap syscall)
├── mprotect.c                     # Memory protection (mprotect syscall)
├── mremap.c                       # Memory remap (mremap syscall)
├── memory.c                       # Page fault handling, COW, demand paging
├── gup.c                          # Get user pages
├── madvise.c                      # Memory advise (madvise syscall)
├── mlock.c                        # Memory locking (mlock syscall)
├── swap.c                         # Swap cache operations
├── swapfile.c                     # Swap file/partition management
├── vmscan.c                       # Page reclaim (kswapd)
├── oom_kill.c                     # Out-of-memory killer
├── memcontrol.c                   # Memory cgroups
├── filemap.c                      # Page cache operations
├── readahead.c                    # Readahead logic
├── truncate.c                     # Page cache truncation
├── shmem.c                        # Shared memory (tmpfs)
├── hugetlb.c                      # Huge page management
├── mmu_notifier.c                 # MMU notifiers (for KVM)
├── rmap.c                         # Reverse mapping (page→VMA)
├── nommu.c                        # No-MMU support (embedded)
├── percpu.c                       # Per-CPU memory allocator
├── memblock.c                     # Early boot memory allocator
├── page_io.c                      # Swap I/O
├── page_owner.c                   # Page allocation tracking
├── zsmalloc.c                     # Compressed memory allocator
├── zpool.c                        # Z-pool abstraction
├── zbud.c                         # Z-buddy allocator
├── z3fold.c                       # Z-3fold allocator
├── compaction.c                   # Memory compaction
├── vmstat.c                       # Virtual memory statistics
├── migrate.c                      # Page migration
├── sparse.c                       # Sparse memory model
├── kasan/                         # Kernel Address Sanitizer
├── kmemleak.c                     # Memory leak detector
└── debug.c                        # MM debugging

include/linux/
├── mm.h                           # Main MM header
├── mm_types.h                     # MM data structures
├── gfp.h                          # Get Free Page flags
├── slab.h                         # Slab allocator API
├── vmalloc.h                      # Vmalloc API
├── swap.h                         # Swap definitions
└── page-flags.h                   # Page flags
```

---

## 3️⃣ Core Source Files

| File | Purpose |
|------|---------|
| `mm/page_alloc.c` | Physical page allocator: alloc_pages(), free_pages(), buddy system |
| `mm/slub.c` | SLUB allocator: kmalloc(), kfree(), object caching |
| `mm/vmalloc.c` | Virtual memory allocator: vmalloc(), vfree() for large allocations |
| `mm/memory.c` | Page fault handler: handle_mm_fault(), do_anonymous_page(), do_wp_page() |
| `mm/mmap.c` | Memory mapping: do_mmap(), mmap_region(), VMA management |
| `mm/filemap.c` | Page cache: find_get_page(), add_to_page_cache(), generic_file_read_iter() |
| `mm/vmscan.c` | Memory reclaim: kswapd, shrink_page_list(), direct reclaim |
| `mm/oom_kill.c` | OOM killer: select_bad_process(), oom_kill_process() |
| `mm/rmap.c` | Reverse mapping: page_remove_rmap(), try_to_unmap() |
| `mm/hugetlb.c` | Huge pages: alloc_huge_page(), hugetlb_fault() |

---

## 4️⃣ Core Data Structures

### struct page - Physical Page Descriptor

```c
/* include/linux/mm_types.h */
struct page {
    unsigned long flags;           // Page flags (PG_locked, PG_dirty, PG_lru, etc.)
    
    /* Usage count */
    atomic_t _refcount;            // Reference count (-1 means free, 0 means 1 reference)
    atomic_t _mapcount;            // # PTEs mapping this page (-1 means unmapped)
    
    /* Union of different page types */
    union {
        /* Anonymous pages or page cache */
        struct {
            struct address_space *mapping;  // File or anon mapping
            pgoff_t index;                  // Offset within mapping
            unsigned long private;          // FS-specific data
        };
        
        /* Slab pages */
        struct {
            struct kmem_cache *slab_cache;  // Which slab cache
            void *freelist;                 // First free object
            void *s_mem;                    // First object address
        };
        
        /* Compound pages (huge pages) */
        struct {
            unsigned long compound_head;    // Points to head page
            unsigned char compound_dtor;    // Destructor
            unsigned char compound_order;   // Order (log2 of # pages)
        };
    };
    
    /* LRU list */
    struct list_head lru;          // For page cache LRU lists
    
    /* Memory cgroup */
    struct mem_cgroup *mem_cgroup; // Which cgroup owns this
    
    /* NUMA node */
    int nid;                       // NUMA node ID
} ____cacheline_aligned;
```

**Purpose:**
One struct page per physical page frame in system. If you have 16GB RAM with 4KB pages, you have ~4 million struct page objects!

**Size:**
~64 bytes per page on x86_64. For 16GB RAM, struct page array consumes ~256MB.

**Lifetime:**
Allocated at boot (in memblock), persists for system lifetime.

**Location:**
Stored in special "struct page" array (mem_map[] or vmemmap).

**Key flags (flags field):**
```c
#define PG_locked        0   // Page is locked (I/O in progress)
#define PG_error         1   // I/O error occurred
#define PG_referenced    2   // Recently accessed (for LRU)
#define PG_uptodate      3   // Page data is valid
#define PG_dirty         4   // Page has been modified
#define PG_lru           5   // On LRU list
#define PG_active        6   // On active LRU (vs inactive)
#define PG_slab          7   // Managed by slab allocator
#define PG_writeback     8   // Under writeback
#define PG_reclaim       9   // Marked for reclaim
#define PG_swapbacked    10  // Backed by swap
#define PG_reserved      14  // Reserved, don't use
#define PG_private       15  // Has FS-private data
#define PG_compound      16  // Part of compound (huge) page
#define PG_head          17  // Head of compound page
```

**Physical address from struct page:**
```c
/* Convert struct page → physical address */
phys_addr_t page_to_phys(struct page *page)
{
    return (page - mem_map) << PAGE_SHIFT;
}

/* Convert physical address → struct page */
struct page *pfn_to_page(unsigned long pfn)
{
    return &mem_map[pfn];
}
```

---

### struct mm_struct - Memory Descriptor

```c
/* include/linux/mm_types.h */
struct mm_struct {
    /* VMA tree */
    struct maple_tree mm_mt;       // Maple tree of VMAs
    unsigned long mmap_base;       // Base of mmap region
    unsigned long task_size;       // Size of user address space
    
    /* Page tables */
    pgd_t *pgd;                    // Page global directory (CR3 points here)
    
    /* Reference counts */
    atomic_t mm_users;             // # processes using this mm (threads)
    atomic_t mm_count;             // # references to mm_struct itself
    
    /* Memory usage */
    unsigned long total_vm;        // Total pages mapped
    unsigned long locked_vm;       // Pages locked in memory (mlock)
    unsigned long pinned_vm;       // Pages pinned (e.g., for DMA)
    unsigned long data_vm;         // Data segment size
    unsigned long exec_vm;         // Code segment size
    unsigned long stack_vm;        // Stack size
    
    /* Special addresses */
    unsigned long start_code;      // Start of code section
    unsigned long end_code;        // End of code
    unsigned long start_data;      // Start of data
    unsigned long end_data;        // End of data
    unsigned long start_brk;       // Start of heap
    unsigned long brk;             // Current heap end
    unsigned long start_stack;     // Start of stack
    unsigned long arg_start;       // Start of arguments
    unsigned long arg_end;         // End of arguments
    unsigned long env_start;       // Start of environment
    unsigned long env_end;         // End of environment
    
    /* Memory protection */
    unsigned long def_flags;       // Default VM flags
    
    /* Locks */
    struct rw_semaphore mmap_lock; // Protects VMA operations
    spinlock_t page_table_lock;    // Protects page tables
    
    /* Statistics */
    unsigned long hiwater_rss;     // High water RSS (peak usage)
    unsigned long hiwater_vm;      // High water virtual memory
    
    /* TLB */
    cpumask_t cpu_bitmap;          // CPUs that have used this mm
    
    /* Context (arch-specific) */
    mm_context_t context;          // CPU-specific (e.g., ASID)
    
    /* OOM */
    unsigned long flags;           // Various flags
    struct core_state *core_state; // Core dump state
    
    /* ... */
};
```

**Purpose:**
Describes complete virtual address space for a process. Threads share mm_struct (via CLONE_VM flag).

**Lifetime:**
- Allocated: exec() or fork()
- Freed: Last thread in process exits

**Locking:**
- mmap_lock (rwsem): Protects VMA list, must be held for VMA operations
- page_table_lock (spinlock): Protects page table entries

**mm_users vs mm_count:**
```
mm_users: # of threads using this mm
  fork with CLONE_VM: mm_users++
  thread exit: mm_users--

mm_count: # of references to mm_struct
  mm_count >= mm_users always
  When mm_users → 0: tear down page tables, but keep mm_struct (mm_count > 0)
  When mm_count → 0: free mm_struct itself
```

---

### struct vm_area_struct - Virtual Memory Area

```c
/* include/linux/mm_types.h */
struct vm_area_struct {
    /* Address range [vm_start, vm_end) */
    unsigned long vm_start;        // Start address (inclusive)
    unsigned long vm_end;          // End address (exclusive)
    
    /* Linked into mm→mm_mt */
    struct mm_struct *vm_mm;       // Back pointer to mm
    
    /* Permissions and flags */
    unsigned long vm_flags;        // VM_READ, VM_WRITE, VM_EXEC, VM_SHARED, etc.
    pgprot_t vm_page_prot;         // Page table protection bits
    
    /* File mapping */
    struct file *vm_file;          // File we're mapped to (or NULL for anon)
    unsigned long vm_pgoff;        // Offset within file (in PAGE_SIZE units)
    
    /* Operations */
    const struct vm_operations_struct *vm_ops; // VMA operations (fault handler, etc.)
    
    /* Anonymous pages */
    struct anon_vma *anon_vma;     // Reverse mapping info
    
    /* Private data */
    void *vm_private_data;         // Driver-specific
    
    /* ... */
};
```

**Purpose:**
Represents a contiguous range of virtual addresses with uniform permissions/backing.

**Examples:**
```
Process address space:
0x00400000 - 0x00500000  [r-x]  /bin/bash (code)           ← 1 VMA
0x00500000 - 0x00510000  [r--]  /bin/bash (rodata)         ← 1 VMA
0x00510000 - 0x00520000  [rw-]  /bin/bash (data)           ← 1 VMA
0x00520000 - 0x00600000  [rw-]  [heap]                     ← 1 VMA (grows with brk)
0x7f0000000000 - 0x7f0000100000  [rw-]  /lib/libc.so       ← 1 VMA
0x7fffffff0000 - 0x7fffffffff00  [rw-]  [stack]            ← 1 VMA (grows down)

Each range = 1 vm_area_struct
```

**vm_flags values:**
```c
#define VM_READ      0x00000001  // Can read
#define VM_WRITE     0x00000002  // Can write
#define VM_EXEC      0x00000004  // Can execute
#define VM_SHARED    0x00000008  // Shared mapping (vs private)
#define VM_MAYREAD   0x00000010  // Can add READ permission
#define VM_MAYWRITE  0x00000020  // Can add WRITE permission
#define VM_MAYEXEC   0x00000040  // Can add EXEC permission
#define VM_GROWSDOWN 0x00000100  // Stack segment
#define VM_LOCKED    0x00002000  // Pages locked (mlock)
#define VM_IO        0x00004000  // Memory-mapped I/O
#define VM_DONTCOPY  0x00020000  // Don't copy on fork
#define VM_DONTEXPAND 0x00040000 // Cannot expand with mremap
#define VM_ACCOUNT   0x00100000  // Memory is accounted
#define VM_HUGETLB   0x00400000  // Huge page mapping
```

**VMA tree organization (Maple Tree as of Linux 6.1+):**
```
struct mm_struct
    ↓
mm_mt (Maple Tree)
    ├── [0x400000-0x500000] → VMA (code)
    ├── [0x500000-0x510000] → VMA (rodata)
    ├── [0x510000-0x520000] → VMA (data)
    ├── [0x520000-0x600000] → VMA (heap)
    ├── [0x7f...] → VMA (library)
    └── [0x7fff...] → VMA (stack)

Lookups: O(log n)
Insertions: O(log n)
```

---

### struct address_space - Page Cache Mapping

```c
/* include/linux/fs.h */
struct address_space {
    struct inode *host;            // Owner inode (for file mapping)
    struct xarray i_pages;         // Radix tree of pages
    
    /* Operations */
    const struct address_space_operations *a_ops;
    
    /* Statistics */
    unsigned long nrpages;         // # of pages in cache
    unsigned long nrexceptional;   // # of exceptional entries (swap)
    
    /* Writeback */
    struct list_head dirty_pages;  // Dirty pages to write back
    unsigned long flags;           // Flags (AS_EIO, AS_ENOSPC)
    
    /* Locks */
    spinlock_t tree_lock;          // Protects i_pages tree (deprecated, using xa_lock now)
    gfp_t gfp_mask;                // Allocation mask
    
    /* Statistics */
    atomic_t i_mmap_writable;      // # of writable mappings
    struct rb_root_cached i_mmap;  // Tree of VMAs mapping this file
    
    /* ... */
};
```

**Purpose:**
Maps file offset → cached pages. Every inode has one address_space.

**Usage:**
```c
/* Find page in cache */
struct page *page = find_get_page(mapping, offset);
if (!page) {
    /* Page not cached, read from disk */
    page = page_cache_alloc(mapping);
    add_to_page_cache_lru(page, mapping, offset);
    mapping->a_ops->readpage(file, page);  // Read from disk
}
```

---

## 5️⃣ Call Path Tracing

### Page Fault Path

**Complete page fault handling:**

```
User Access Invalid Address         Kernel Page Fault Handler
---------------------------          -------------------------
load [0x12340000]                    
    ↓                                
[Page not present in TLB]            
    ↓                                
[TLB miss → Page table walk]         
    ↓                                
[PTE not present]                    
    ↓                                
CPU raises Page Fault                1. Exception entry
(Exception #14)                         (Layer 1: arch/x86)
    ↓                                   asm_exc_page_fault
IDT vectors to handler                  (arch/x86/entry/entry_64.S)
    ↓                                   ├─ Save registers
exc_page_fault()                        ├─ Read CR2 (fault address)
(arch/x86/mm/fault.c)                   └─ Call do_user_addr_fault()
    ↓                                
do_user_addr_fault()                 2. Determine fault type
    ├─ address = CR2                    ├─ User or kernel fault?
    ├─ error_code analysis              ├─ Read or write?
    │   bit 0: PRESENT                  ├─ Protection violation?
    │   bit 1: WRITE                    └─ Instruction fetch?
    │   bit 2: USER                     
    │   bit 4: INSTR                    
    ├─ find_vma(mm, address)         3. Find VMA
    │   └─ Maple tree lookup            
    │                                   
    ├─ Check if address in VMA       4. Validate access
    │   if (address < vma→vm_start)     
    │       bad_area()                  
    │   if (write && !(vma→vm_flags & VM_WRITE))
    │       bad_area_access_error()     
    │                                   
    └─ handle_mm_fault()             5. Handle fault
        (mm/memory.c)                   
        ├─ Walk page tables             
        │   pgd → p4d → pud → pmd → pte
        │                               
        ├─ if (!pud_present())       6. Allocate missing levels
        │   alloc_pud()                 
        ├─ if (!pmd_present())          
        │   alloc_pmd()                 
        │                               
        ├─ __handle_mm_fault()       7. Determine fault type
        │   ├─ Anonymous page?          
        │   │   do_anonymous_page()     
        │   │   ├─ alloc_page()      8. Allocate physical page
        │   │   │   └─ buddy allocator  
        │   │   ├─ clear_page()      9. Zero page
        │   │   └─ set_pte()         10. Install PTE
        │   │                           
        │   ├─ File-backed page?     11. File mapping
        │   │   do_fault()              
        │   │   ├─ vma→vm_ops→fault()   
        │   │   │   └─ filemap_fault()
        │   │   │       ├─ find_get_page()  12. Check page cache
        │   │   │       │   ↓              
        │   │   │       │   Found in cache? 13. Cache hit
        │   │   │       │   └→ Return page  
        │   │   │       │                  
        │   │   │       └─ Not in cache? 14. Cache miss
        │   │   │           ├─ page_cache_alloc()
        │   │   │           ├─ add_to_page_cache()
        │   │   │           └─ readpage()  15. Read from disk
        │   │   │               └─ submit_bio()  (to block layer)
        │   │   └─ set_pte()     16. Install PTE
        │   │                       
        │   └─ Copy-on-write?    17. COW fault
        │       do_wp_page()        
        │       ├─ Check if exclusive  18. Can we reuse page?
        │       │   if (page_mapcount == 1)
        │       │       reuse_swap_page()
        │       │       └─ Mark writable, done!
        │       │                       
        │       └─ Must copy         19. Allocate new page
        │           ├─ alloc_page()     
        │           ├─ copy_page()   20. Copy data
        │           ├─ set_pte()     21. Install new PTE
        │           └─ put_page(old) 22. Release old page
        │                               
        └─ Return VM_FAULT_XXX       23. Return status
                                        
Return to user space                 24. Retry instruction
load [0x12340000]                    
    ↓                                
[Access succeeds!]                   
```

---

### Memory Allocation Path (kmalloc)

**kmalloc() → SLUB allocator:**

```
User: ptr = kmalloc(128, GFP_KERNEL)     SLUB Allocator
------------------------------------     --------------
kmalloc(size, flags)                     1. Determine cache
(include/linux/slab.h)                      
    ↓                                       
kmalloc_cache(size, flags)                  
    └─ Lookup cache for size                
        kmalloc-128                         
        ↓                                   
__kmalloc()                              2. Fast path
(mm/slub.c)                                 
    ↓                                       
slab_alloc()                                
    ├─ this_cpu_ptr(s→cpu_slab)         3. Per-CPU slab
    │   ↓                                   
    ├─ freelist = c→freelist            4. Get free object
    │   ↓                                   
    ├─ if (freelist) {                  5. Fast case: free object available
    │   c→freelist = get_freepointer()     ├─ Pop from freelist
    │   return freelist;                   └─ Return (fast!)
    │   }                                   
    │                                       
    └─ Slow path: no free objects       6. Slow path
        __slab_alloc()                      
        ├─ Try partial list             7. Check partial slabs
        │   if (!c→page)                    
        │       c→page = get_partial()      
        │       if (c→page)                 
        │           goto redo;  // Retry fast path
        │                                   
        └─ Allocate new slab            8. Need new slab
            new_slab()                      
            ├─ alloc_pages()            9. Get pages from buddy
            │   (mm/page_alloc.c)           
            │   └─ __alloc_pages()          
            │       ├─ Check per-CPU free lists
            │       ├─ Try zone free lists  
            │       └─ Buddy allocator      
            │           └─ find_buddy()     
            │                               
            ├─ Init slab metadata       10. Set up freelist
            │   ├─ s→objects per slab       
            │   └─ Link all objects         
            │                               
            └─ c→page = page            11. Assign to CPU slab
                goto redo;  // Retry fast path
```

**Buddy allocator (alloc_pages):**

```
alloc_pages(order, gfp_mask)             Buddy Allocator
----------------------------             ---------------
__alloc_pages()                          1. Fast path
(mm/page_alloc.c)                           
    ├─ Check gfp_mask                       
    │   GFP_KERNEL, GFP_ATOMIC, etc.        
    │                                       
    ├─ Select zone                       2. Choose zone
    │   ZONE_DMA, ZONE_NORMAL, ZONE_HIGHMEM 
    │                                       
    └─ get_page_from_freelist()          3. Try per-CPU lists
        ├─ Try per-CPU page allocator       
        │   rmqueue_pcplist()               
        │   if (pcp→count > 0)              
        │       return pcp→lists[order]     
        │                                   
        └─ Try zone free lists           4. Try buddy allocator
            rmqueue()                       
            ├─ Search for free block     5. Find free block
            │   for (current_order = order; 
            │        current_order < MAX_ORDER;
            │        current_order++) {
            │       area = &zone→free_area[current_order];
            │       if (!list_empty(&area→free_list))
            │           goto found;         
            │   }                           
            │                               
            ├─ Split larger blocks       6. Split if needed
            │   expand()                    
            │   Example: Need order-0, found order-2
            │     Order 2: [XXXX]          
            │     Split:   [XX][XX]  → Order 1
            │     Split:   [X][X][XX]  → Order 0
            │     Return:  [X]  (1 page)   
            │     Buddies: [X] → order-0 list
            │                [XX] → order-1 list
            │                               
            └─ Return pages              7. Return
                                            
No memory available?                     8. Slow path
    ↓                                       
__alloc_pages_slowpath()                    
    ├─ Wake kswapd                       9. Background reclaim
    ├─ Direct reclaim                   10. Foreground reclaim
    │   try_to_free_pages()                 
    │   └─ shrink_zones()                   
    └─ OOM killer (last resort)         11. Kill process
        out_of_memory()                     
        └─ oom_kill_process()               
```

---

### Page Cache Read Path

**read() syscall → page cache:**

```
User: read(fd, buf, 4096)                Page Cache
-------------------------                ----------
sys_read()                               1. VFS entry
(fs/read_write.c)                           
    ↓                                       
vfs_read()                                  
    ├─ file→f_op→read_iter()             2. File operations
    │   (set by filesystem)                 
    │                                       
    └─ generic_file_read_iter()          3. Generic read
        (mm/filemap.c)                      
        ├─ Determine offset/length          
        │   index = offset >> PAGE_SHIFT    
        │   nr_pages = (len + PAGE_SIZE - 1) >> PAGE_SHIFT
        │                                   
        └─ For each page:                4. Page loop
            filemap_get_pages()             
            ├─ find_get_page()           5. Lookup in cache
            │   (mm/filemap.c)              
            │   └─ xa_load(&mapping→i_pages, index)
            │       └─ XArray lookup        
            │                               
            ├─ If found:                 6. Cache hit!
            │   └─ if (PageUptodate(page))  
            │       goto copy;  // Fast path
            │                               
            └─ If not found:             7. Cache miss
                page_cache_alloc()          
                ├─ alloc_page(mapping→gfp_mask)
                ├─ add_to_page_cache_lru()  8. Add to cache
                │   ├─ xa_store(&mapping→i_pages, index, page)
                │   ├─ page→mapping = mapping
                │   ├─ page→index = index   
                │   └─ lru_cache_add()   9. Add to LRU
                │                           
                └─ readpage()            10. Read from disk
                    mapping→a_ops→readpage()
                    ├─ Create bio        11. Build I/O request
                    │   (block layer)       
                    ├─ submit_bio()      12. Submit to disk
                    └─ wait_on_page_locked()  13. Wait for I/O
                        └─ I/O completion → SetPageUptodate()
                                            
copy:                                    14. Copy to user
    copy_page_to_iter()                     
    └─ copy_to_user(buf, page_data, len)
                                            
mark_page_accessed(page)                 15. Update LRU
    └─ SetPageReferenced(page)  // For reclaim heuristics
```

---

## 6️⃣ Concurrency Model

### Page Table Locking

**Hierarchy of locks:**
```
struct mm_struct
    ├─ mmap_lock (rw_semaphore)        # Protects VMA list
    │   - Readers: page fault, reading /proc/pid/maps
    │   - Writers: mmap(), munmap(), mremap()
    │
    └─ page_table_lock (spinlock)      # Protects page tables
        - Taken when modifying PTEs
        - Can sleep with mmap_lock held, but NOT with page_table_lock
```

**Lock ordering:**
```
1. mmap_lock (read or write)
2. page_table_lock
3. zone→lock (buddy allocator)
4. lruvec→lru_lock (LRU lists)

NEVER violate this order or deadlock!
```

**Split page table locks (optimization):**
```
Instead of single mm→page_table_lock:
  Each PMD has its own spinlock (if CONFIG_SPLIT_PT_LOCK)
  
Reduces contention on multi-threaded workloads:
  Thread 1 faulting at 0x10000000 (PMD A)
  Thread 2 faulting at 0x20000000 (PMD B)
  → Can proceed in parallel!
```

---

### LRU (Least Recently Used) Locking

**Per-zone LRU lists:**
```c
struct lruvec {
    struct list_head lists[NR_LRU_LISTS];  // 5 lists
    spinlock_t lru_lock;                    // Protects lists
};

enum lru_list {
    LRU_INACTIVE_ANON,    // Anonymous pages, not recently used
    LRU_ACTIVE_ANON,      // Anonymous pages, recently used
    LRU_INACTIVE_FILE,    // File-backed pages, not recently used
    LRU_ACTIVE_FILE,      // File-backed pages, recently used
    LRU_UNEVICTABLE,      // Pages locked in memory (mlock)
};
```

**Lock avoidance: Per-CPU LRU add cache:**
```c
struct per_cpu_pages {
    struct list_head lists[NR_LRU_LISTS];  // Per-CPU staging
    int count;                              // # pages cached
};

/* Add page to LRU (fast path) */
lru_cache_add(page)
{
    struct per_cpu_pages *pcp = this_cpu_ptr(&lru_pvecs);
    
    list_add(&page→lru, &pcp→lists[LRU_INACTIVE_FILE]);
    pcp→count++;
    
    if (pcp→count >= PAGEVEC_SIZE)  // e.g., 14 pages
        __pagevec_lru_add();  // Drain to global LRU (take lock)
}
```

---

## 7️⃣ Memory Model

### Buddy Allocator

**Free block organization:**
```
Each zone has free_area[MAX_ORDER] where MAX_ORDER = 11
Each free_area[order] is a list of free blocks of 2^order pages

Example:
Order 0 (1 page = 4KB):
  [P0]→[P5]→[P9]→[P15]→...

Order 1 (2 pages = 8KB):
  [P2-P3]→[P10-P11]→...

Order 2 (4 pages = 16KB):
  [P8-P11]→[P16-P19]→...

...

Order 10 (1024 pages = 4MB):
  [P1024-P2047]→[P4096-P5119]→...
```

**Allocation algorithm:**
```
alloc_pages(order=0):  // Want 1 page
  1. Check order-0 list:
     [P0]→[P5]→[P9]  // Found P0!
     Remove P0, return
  
alloc_pages(order=0):  // Want another page
  1. Check order-0 list:
     [P5]→[P9]  // Found P5!
     Remove P5, return

alloc_pages(order=0):  // Want third page
  1. Check order-0 list:
     [P9]  // Found P9!
     Remove P9, return

alloc_pages(order=0):  // Want fourth page
  1. Check order-0 list:
     []  // Empty!
  2. Check order-1 list:
     [P10-P11]→[P14-P15]  // Found!
     Remove [P10-P11]
     Split: P10 (return), P11 (add to order-0)
     order-0 list: [P11]
     Return P10

alloc_pages(order=2):  // Want 4 pages
  1. Check order-2 list:
     []  // Empty!
  2. Check order-3 list:
     [P16-P23]  // Found!
     Remove [P16-P23]
     Split: [P16-P19] (return), [P20-P23] (add to order-2)
     Return [P16-P19]
```

**Buddy coalescing (on free):**
```
free_pages(P10, order=0):
  1. Find buddy of P10 at order-0:
     Buddy = P10 XOR (1 << order) = P10 XOR 1 = P11
  2. Is P11 free? Check order-0 list:
     [P11]  // Yes, P11 is free!
  3. Remove P11 from order-0
  4. Coalesce: [P10-P11]
  5. Recursively try order-1:
     Buddy of [P10-P11] at order-1 = [P8-P9] or [P12-P13]
     Check if buddy free...
     (If yes, coalesce to order-2, repeat)
```

---

### SLUB Allocator

**Cache organization:**
```
kmalloc-8, kmalloc-16, kmalloc-32, kmalloc-64,
kmalloc-128, kmalloc-256, kmalloc-512, kmalloc-1024,
kmalloc-2048, kmalloc-4096, kmalloc-8192

Each cache has:
  - Per-CPU slab (fast path)
  - Partial slabs (shared)
  - Free slabs
```

**Slab layout (example: kmalloc-128):**
```
Slab = 1 or more pages (e.g., order-0 = 4KB)
Object size = 128 bytes
Objects per slab = 4096 / 128 = 32

Slab memory layout:
┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
│ Obj0│ Obj1│ Obj2│ Obj3│ Obj4│ Obj5│ ...  │Obj31│
└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
 128B  128B  128B  128B  128B  128B        128B

Freelist (embedded in free objects):
  page→freelist → Obj0
  Obj0→next → Obj1
  Obj1→next → Obj2
  ...
  Obj31→next → NULL

Allocation:
  1. object = page→freelist
  2. page→freelist = object→next
  3. return object
```

---

## 8️⃣ Hardware Interaction

### TLB Shootdown

**Problem:**
CPU 0 unmaps a page. Other CPUs may have stale TLB entries!

**Solution: IPI-based TLB shootdown:**
```
CPU 0: unmap_page()                      Other CPUs
--------------------                     ----------
1. Modify PTE (mark not present)
2. flush_tlb_mm_range(mm, start, end)
   ├─ Determine CPUs using this mm
   │   cpumask = mm→cpu_bitmap
   │
   ├─ Send IPI to all CPUs               3. Receive IPI
   │   smp_call_function_many(cpumask,      ↓
   │                          flush_tlb_func,  4. Execute handler
   │                          &info, 1)         flush_tlb_func_local()
   │                                             ├─ invlpg addr
   └─ Wait for ACKs                              │   (or reload CR3)
                                                  └─ Send ACK
5. All CPUs flushed, safe to proceed     
```

**Cost:**
- IPI latency: ~1-10 µs per CPU
- For 64 CPUs unmapping 1 page: ~100 µs total

**Optimizations:**
- Lazy TLB: Kernel threads don't have user TLB entries
- Batching: Flush multiple pages in one IPI
- PCID: Avoid full TLB flush on context switch

---

## 9️⃣ Performance Considerations

### Memory Allocation Hierarchy

**Allocation preferences (fastest → slowest):**
```
1. Per-CPU allocator (NO LOCK)
   - SLUB per-CPU freelist
   - Buddy per-CPU lists
   Cost: ~10-50 cycles

2. Partial lists (GLOBAL LOCK)
   - SLUB partial slabs
   - Buddy zone free lists
   Cost: ~100-500 cycles

3. Allocate new slab/pages (SLOW)
   - SLUB: alloc_pages()
   - Buddy: expand blocks
   Cost: ~1000-5000 cycles

4. Reclaim memory (VERY SLOW)
   - Direct reclaim
   - Compact memory
   - Swap pages
   Cost: ~100,000+ cycles (disk I/O!)

5. OOM killer (LAST RESORT)
   - Kill process to free memory
   Cost: Application dies
```

**Recommendation:**
Use order-0 pages (4KB) when possible. Higher orders fragment memory and are slower.

---

### NUMA Awareness

**Local vs remote memory:**
```
Node 0                        Node 1
┌─────────────┐              ┌─────────────┐
│ CPU 0       │              │ CPU 1       │
│ Local RAM   │              │ Local RAM   │
│  (100ns)    │              │  (100ns)    │
└─────────────┘              └─────────────┘
       │                            │
       └────────────────────────────┘
            Interconnect
       Node 0 → Node 1: ~200ns (2x slower!)
```

**NUMA-aware allocation:**
```c
/* Allocate on current node */
page = alloc_pages_node(numa_node_id(), GFP_KERNEL, 0);

/* Allocate on specific node */
page = alloc_pages_node(node, GFP_KERNEL, 0);

/* NUMA policy (per-process) */
set_mempolicy(MPOL_BIND, &nodemask, maxnode);  // Bind to nodes
set_mempolicy(MPOL_INTERLEAVE, &nodemask, maxnode);  // Interleave
```

---

## 🔟 ASCII Architecture Diagrams

### Virtual Address Space Layout

```
User Space (x86_64)
───────────────────

0x0000_0000_0000_0000
┌───────────────────────┐
│  NULL page (unmapped) │  Catches NULL dereferences
├───────────────────────┤ 0x0000_0000_0040_0000
│   Code (.text)        │  Executable, read-only
├───────────────────────┤
│   Rodata (.rodata)    │  Read-only data
├───────────────────────┤
│   Data (.data, .bss)  │  Initialized/uninitialized data
├───────────────────────┤ brk
│   Heap (grows →)      │  malloc/free
│         ↓             │
│         ↓             │
│   (unmapped)          │
│         ↑             │
│         ↑             │
│   mmap region         │  Shared libraries, mmap()
├───────────────────────┤ 0x7FFF_FFFF_F000
│   Stack (grows ←)     │  Local variables, call frames
└───────────────────────┘ 0x8000_0000_0000 (user/kernel boundary)

Kernel Space (x86_64)
─────────────────────

0xFFFF_8000_0000_0000
┌───────────────────────┐
│  Direct map of all    │  All physical RAM mapped here
│  physical memory      │  (linear mapping)
├───────────────────────┤ 0xFFFF_C000_0000_0000
│  vmalloc area         │  vmalloc(), ioremap()
├───────────────────────┤
│  Kernel modules       │  Loadable modules
├───────────────────────┤
│  Kernel code & data   │  Kernel .text, .data
└───────────────────────┘ 0xFFFF_FFFF_FFFF_FFFF
```

### Page Fault Decision Tree

```
                        Page Fault
                             │
                    Read CR2 (fault address)
                    Check error code
                             │
              ┌──────────────┴──────────────┐
              │                             │
         User fault?                   Kernel fault?
              │                             │
     ┌────────┴────────┐              ┌────┴────┐
Address in VMA?    Address not       vmalloc   Bad kernel
     │             in VMA         fault?    access (oops)
     │                │               │
 ┌───┴───┐         Send          Fix vmalloc
 │       │         SIGSEGV       page tables
 │       │                       Return
 │       │
PTE present?  PTE not present
(Protection    │
violation)     │
 │        ┌────┴─────┐
 │    Anonymous   File-backed
 │    page?       page?
 │     │           │
 │  ┌──┴──┐     ┌─┴──┐
Write to Swap  Page in Read
COW?     page?  cache? from file
 │        │      │      │
Copy    Swap   Cache  Readpage
page    in     hit    (disk I/O)
 │      page    │       │
 └───────┴──────┴───────┘
         │
    Set PTE & return
```

### Memory Reclaim Flow

```
Low Memory Condition
        │
        ├─→ Wake kswapd (async)
        │   (kernel/mm/vmscan.c)
        │   └─→ kswapd daemon
        │        ├─ Check watermarks
        │        ├─ Scan LRU lists
        │        ├─ shrink_page_list()
        │        │   ├─ Anonymous pages → swap
        │        │   └─ File pages → discard (if clean)
        │        │                   → write back (if dirty)
        │        └─ Return pages to buddy
        │
        └─→ Direct reclaim (sync)
            try_to_free_pages()
            ├─ Same as kswapd, but synchronous
            ├─ Blocks allocating process
            │
            └─ Still no memory?
                └─→ OOM Killer
                    select_bad_process()
                    ├─ Score each process
                    │   └─ RSS + swap space used
                    └─ Kill highest score
                        send_sig(SIGKILL)
```

---

## Summary of Layer 3

**Memory Management provides:**

1. **Physical memory**: Buddy allocator for pages, SLUB for objects
2. **Virtual memory**: Per-process address spaces, VMAs, page tables
3. **Page cache**: Cache file data in RAM for performance
4. **Demand paging**: Allocate physical pages only when needed
5. **Copy-on-write**: Optimize fork() by sharing pages
6. **Memory reclaim**: Free memory under pressure (LRU, kswapd)
7. **Swap**: Extend memory to disk

**Key takeaways:**
- Every physical page has a struct page descriptor
- Every process has mm_struct with VMAs describing virtual address space
- Page faults drive demand paging and COW
- Buddy allocator manages physical pages, SLUB manages small objects
- Page cache dramatically improves file I/O performance
- Memory reclaim maintains free memory watermarks

**Critical files:**
- `mm/page_alloc.c` - Buddy allocator
- `mm/slub.c` - SLUB allocator
- `mm/memory.c` - Page fault handler
- `mm/filemap.c` - Page cache
- `mm/vmscan.c` - Memory reclaim

---


# Layer 4 - Virtual File System (VFS)

## 1️⃣ High-Level Purpose

Layer 4 implements the **Virtual File System** - a unified abstraction layer over different filesystems:

- **Unified interface**: Same API for ext4, XFS, Btrfs, NFS, tmpfs, etc.
- **File abstraction**: Files, directories, inodes, dentries
- **Path resolution**: Convert /path/to/file → inode
- **File operations**: open(), read(), write(), close()
- **Directory operations**: readdir(), lookup()
- **Mount namespace**: Per-process view of filesystem hierarchy
- **File descriptor management**: Per-process fd table
- **Page cache integration**: Cache file data (Layer 3)
- **Block layer integration**: Submit I/O to block devices (Layer 5)

**Position in system architecture:**
Sits between syscall layer (Layer 2) and specific filesystems/block layer (Layer 5). Provides POSIX file API to userspace.

**Interaction with other subsystems:**
- Layer 2 (syscalls): sys_open(), sys_read(), sys_write()
- Layer 3 (mm): Page cache for file data
- Layer 5 (block): Submit I/O via submit_bio()
- Layer 9 (security): Permission checks, SELinux hooks

---

## 2️⃣ Directory Mapping

```
fs/
├── namei.c                        # Path lookup (path_lookupat, link_path_walk)
├── open.c                         # File opening (do_sys_open, do_filp_open)
├── read_write.c                   # Read/write syscalls (vfs_read, vfs_write)
├── file_table.c                   # File descriptor table
├── file.c                         # File operations
├── super.c                        # Superblock operations
├── inode.c                        # Inode operations
├── dcache.c                       # Dentry cache
├── namespace.c                    # Mount namespace
├── mount.h                        # Mount infrastructure
├── pipe.c                         # Pipes
├── fifo.c                         # FIFOs
├── char_dev.c                     # Character devices
├── block_dev.c                    # Block devices
├── stat.c                         # Stat syscalls
├── fcntl.c                        # File control
├── ioctl.c                        # I/O control
├── locks.c                        # File locking
├── select.c                       # select/poll syscalls
├── readdir.c                      # Directory reading
├── splice.c                       # Splice/sendfile
├── sync.c                         # Sync operations
├── quota/                         # Disk quotas
├── notify/                        # File notifications (inotify, fanotify)
│
├── ext4/                          # ext4 filesystem
│   ├── super.c                    # Superblock operations
│   ├── inode.c                    # Inode operations
│   ├── file.c                     # File operations
│   ├── namei.c                    # Directory operations
│   └── balloc.c                   # Block allocation
│
├── xfs/                           # XFS filesystem
├── btrfs/                         # Btrfs filesystem
├── nfs/                           # NFS client
├── proc/                          # /proc filesystem
├── sysfs/                         # /sys filesystem
├── devpts/                        # /dev/pts
├── tmpfs/                         # tmpfs (in mm/shmem.c)
└── overlayfs/                     # Overlay filesystem

include/linux/
├── fs.h                           # Main VFS header
├── dcache.h                       # Dentry cache
├── mount.h                        # Mount points
├── namei.h                        # Path lookup
├── file.h                         # File operations
└── fs_struct.h                    # Per-process filesystem info
```

---

## 3️⃣ Core Source Files

| File | Purpose |
|------|---------|
| `fs/namei.c` | Path resolution: path_lookupat(), link_path_walk(), do_last() |
| `fs/open.c` | File opening: do_sys_open(), do_filp_open() |
| `fs/read_write.c` | Read/write: vfs_read(), vfs_write(), generic_file_read_iter() |
| `fs/dcache.c` | Dentry cache: d_lookup(), __d_lookup(), d_alloc() |
| `fs/inode.c` | Inode management: alloc_inode(), iget_locked() |
| `fs/file_table.c` | File table: alloc_empty_file(), __fput() |
| `fs/namespace.c` | Mount operations: do_mount(), do_new_mount() |

---

## 4️⃣ Core Data Structures

### struct inode - VFS Inode

```c
/* include/linux/fs.h */
struct inode {
    umode_t                 i_mode;        // File type and permissions
    unsigned short          i_opflags;     // Operation flags
    kuid_t                  i_uid;         // Owner UID
    kgid_t                  i_gid;         // Owner GID
    unsigned int            i_flags;       // Inode flags
    
    const struct inode_operations   *i_op;  // Inode operations
    struct super_block      *i_sb;         // Superblock
    struct address_space    *i_mapping;    // Page cache mapping
    
    /* Inode number and timestamps */
    unsigned long           i_ino;         // Inode number
    dev_t                   i_rdev;        // Device number (for special files)
    loff_t                  i_size;        // File size in bytes
    struct timespec64       i_atime;       // Access time
    struct timespec64       i_mtime;       // Modification time
    struct timespec64       i_ctime;       // Change time
    
    /* Links and blocks */
    unsigned int            i_nlink;       // Hard link count
    blkcnt_t                i_blocks;      // Block count
    unsigned int            i_blkbits;     // Block size in bits
    
    /* File operations */
    const struct file_operations *i_fop;   // File operations
    
    /* Locking */
    spinlock_t              i_lock;        // Protects inode fields
    struct rw_semaphore     i_rwsem;       // Read/write semaphore
    
    /* Hash and lists */
    struct hlist_node       i_hash;        // Hash list
    struct list_head        i_io_list;     // Writeback list
    struct list_head        i_lru;         // LRU list (for eviction)
    
    /* Reference counting */
    atomic_t                i_count;       // Reference count
    
    /* Filesystem-specific */
    void                    *i_private;    // FS-private data
    
    /* Address space for page cache */
    struct address_space    i_data;        // Embedded address_space
    
    /* ... */
};
```

**Purpose:**
VFS representation of a file. Each file/directory has exactly one inode in memory while open.

**Lifetime:**
- Allocated: When file first accessed (read from disk)
- Cached: Kept in inode cache (LRU)
- Freed: When reference count → 0 and evicted from cache

**Key fields:**
- `i_mode`: File type (S_IFREG, S_IFDIR, S_IFLNK) + permissions (0755, etc.)
- `i_size`: File size in bytes
- `i_mapping`: Points to address_space (page cache) for this file
- `i_op`: Operations (create, link, unlink, mkdir, rmdir)
- `i_fop`: File operations (open, read, write, mmap)

---

### struct dentry - Directory Entry

```c
/* include/linux/dcache.h */
struct dentry {
    /* Flags */
    unsigned int            d_flags;       // DCACHE_* flags
    
    /* Name */
    struct qstr             d_name;        // Name (quick string)
    
    /* Tree structure */
    struct dentry           *d_parent;     // Parent directory
    struct hlist_bl_node    d_hash;        // Hash list for lookup
    struct list_head        d_child;       // Child of parent
    struct list_head        d_subdirs;     // Our children
    
    /* Inode */
    struct inode            *d_inode;      // Associated inode (or NULL)
    
    /* Operations */
    const struct dentry_operations *d_op;  // Dentry operations
    
    /* Superblock */
    struct super_block      *d_sb;         // Superblock
    
    /* Reference counting */
    atomic_t                d_count;       // Reference count
    spinlock_t              d_lock;        // Per-dentry lock
    
    /* LRU */
    struct list_head        d_lru;         // LRU list
    
    /* Filesystem-specific */
    void                    *d_fsdata;     // FS-private data
    
    /* ... */
};

struct qstr {
    unsigned int            len;           // String length
    const unsigned char     *name;         // String pointer
    u32                     hash;          // Hash value (for fast lookup)
};
```

**Purpose:**
Cache for path component lookups. Maps filename → inode.

**Example:**
```
Path: /home/user/file.txt

Dentry tree:
    "/"  (d_inode → root inode)
     └─ "home"  (d_inode → home dir inode)
         └─ "user"  (d_inode → user dir inode)
             └─ "file.txt"  (d_inode → file inode)

Each component has a dentry!
```

**Lifetime:**
- Allocated: During path lookup
- Cached: Kept in dentry cache (dcache)
- Freed: Under memory pressure or when parent freed

**Key insight:**
Dcache is a **performance optimization**. Without it, every file access would require disk I/O to read directory blocks!

---

### struct file - Open File

```c
/* include/linux/fs.h */
struct file {
    /* Path */
    struct path             f_path;        // {dentry, vfsmount}
    struct inode            *f_inode;      // Cached inode pointer
    
    /* Operations */
    const struct file_operations *f_op;    // File operations
    
    /* Flags and mode */
    unsigned int            f_flags;       // O_RDONLY, O_WRONLY, O_APPEND, etc.
    fmode_t                 f_mode;        // FMODE_READ, FMODE_WRITE
    
    /* Offset */
    loff_t                  f_pos;         // Current file position
    struct mutex            f_pos_lock;    // Protects f_pos
    
    /* Owner */
    struct fown_struct      f_owner;       // Owner for signal delivery
    const struct cred       *f_cred;       // Credentials
    
    /* Reference counting */
    atomic_long_t           f_count;       // Reference count
    
    /* Private data */
    void                    *private_data; // FS/driver-specific
    
    /* Address space */
    struct address_space    *f_mapping;    // Page cache mapping
    
    /* ... */
};
```

**Purpose:**
Represents an open file descriptor. Multiple processes can have struct file pointing to same inode (via fork or multiple opens).

**Lifetime:**
- Allocated: open() syscall
- Freed: Last close() (when f_count → 0)

**Relationship:**
```
Process 1:                Process 2:
  fd 3 ──→ struct file ──→ dentry ──→ inode
  fd 4 ──→ struct file ──┘             │
                                       │
Process 3:                             │
  fd 5 ──→ struct file ─────────────────┘

Multiple struct file can point to same inode!
Each open() creates new struct file (with own f_pos).
fork() shares struct file (same f_pos).
```

---

### struct super_block - Filesystem Superblock

```c
/* include/linux/fs.h */
struct super_block {
    /* Device */
    dev_t                   s_dev;         // Device identifier
    unsigned long           s_blocksize;   // Block size
    unsigned char           s_blocksize_bits; // Block size in bits
    loff_t                  s_maxbytes;    // Max file size
    
    /* Type */
    struct file_system_type *s_type;       // Filesystem type
    const struct super_operations *s_op;   // Superblock operations
    
    /* Root */
    struct dentry           *s_root;       // Root dentry
    
    /* Mount */
    struct list_head        s_mounts;      // List of mounts
    struct block_device     *s_bdev;       // Block device
    
    /* Inodes */
    struct list_head        s_inodes;      // All inodes
    struct hlist_bl_head    s_roots;       // Dentry roots
    
    /* Dirty inodes */
    struct list_head        s_dirty;       // Dirty inodes
    struct list_head        s_io;          // Inodes under writeback
    struct list_head        s_more_io;     // More writeback
    
    /* Filesystem-specific */
    void                    *s_fs_info;    // FS-private data
    
    /* Flags */
    unsigned long           s_flags;       // Mount flags (MS_RDONLY, etc.)
    
    /* ... */
};
```

**Purpose:**
Represents a mounted filesystem instance.

---

## 5️⃣ Call Path Tracing

### open() Syscall Path

```
User: fd = open("/home/user/file.txt", O_RDONLY)

Kernel Path:
-----------
sys_open()                           1. Syscall entry
(fs/open.c)                             
    ↓                                   
do_sys_open()                           
    ├─ getname()                     2. Copy filename from user
    │   └─ Copy "/home/user/file.txt" to kernel
    │                                   
    ├─ get_unused_fd_flags()         3. Allocate fd number
    │   └─ Search fd table for free slot → fd = 3
    │                                   
    └─ do_filp_open()                4. Open file
        (fs/open.c)                     
        ├─ path_openat()             5. Path resolution + open
        │   │                           
        │   ├─ path_init()           6. Initialize path walk
        │   │   └─ Set start point (root or cwd)
        │   │                           
        │   ├─ link_path_walk()      7. Walk path components
        │   │   (fs/namei.c)            
        │   │   │                       
        │   │   ├─ "home" component  8. Lookup "home"
        │   │   │   ├─ __d_lookup()     Check dentry cache
        │   │   │   │   └─ Cache hit! Found cached dentry
        │   │   │   │                   
        │   │   │   └─ walk_component()  
        │   │   │       └─ step_into() → Move to next level
        │   │   │                       
        │   │   ├─ "user" component  9. Lookup "user"
        │   │   │   ├─ __d_lookup()     Check cache
        │   │   │   │   └─ Cache miss!  
        │   │   │   │                   
        │   │   │   └─ lookup_slow()    10. Slow path (disk lookup)
        │   │   │       ├─ dir→i_op→lookup()  // Call filesystem
        │   │   │       │   (e.g., ext4_lookup)
        │   │   │       │   ├─ Read directory block from disk
        │   │   │       │   ├─ Find "user" entry
        │   │   │       │   └─ Return inode number
        │   │   │       │                   
        │   │   │       ├─ d_alloc()    11. Allocate dentry
        │   │   │       └─ d_add()      12. Add to cache
        │   │   │                       
        │   │   └─ "file.txt" component 13. Lookup file
        │   │       └─ (similar to above)
        │   │                           
        │   └─ do_last()             14. Handle final component
        │       (fs/namei.c)            
        │       ├─ Check permissions    
        │       │   may_open()          
        │       │   └─ inode_permission()
        │       │                       
        │       ├─ vfs_open()        15. Open file
        │       │   └─ do_dentry_open()
        │       │       ├─ Allocate struct file
        │       │       ├─ file→f_op = inode→i_fop
        │       │       ├─ file→f_path = {dentry, mnt}
        │       │       ├─ file→f_pos = 0
        │       │       │                   
        │       │       └─ f_op→open()  16. Filesystem open
        │       │           (e.g., ext4_file_open)
        │       │                       
        │       └─ Return struct file   
        │                                   
        └─ Return struct file           

fd_install(fd, file)                 17. Install in fd table
    └─ current→files→fdt→fd[3] = file

Return fd (3) to userspace           18. Return to user
```

---

### read() Syscall Path

```
User: read(fd, buf, 4096)

Kernel Path:
-----------
sys_read()                           1. Syscall entry
(fs/read_write.c)                       
    ↓                                   
ksys_read()                             
    ├─ fdget_pos()                   2. Get struct file from fd
    │   └─ current→files→fdt→fd[3] → struct file
    │                                   
    └─ vfs_read()                    3. VFS read
        (fs/read_write.c)               
        ├─ Check f_mode & FMODE_READ 4. Verify readable
        │                               
        ├─ rw_verify_area()          5. Security checks
        │   └─ security_file_permission()
        │                               
        └─ file→f_op→read_iter()     6. Call filesystem read
            (e.g., ext4_file_read_iter)
            │                           
            └─ generic_file_read_iter() 7. Generic read
                (mm/filemap.c)          
                │                       
                ├─ Calculate offset/length
                │   offset = file→f_pos  
                │   index = offset >> PAGE_SHIFT
                │                       
                └─ filemap_get_pages()  8. Get pages
                    │                   
                    ├─ find_get_page()  9. Check page cache
                    │   (mm/filemap.c)     
                    │   └─ xa_load(&mapping→i_pages, index)
                    │                       
                    ├─ Cache hit?       10. Page in cache?
                    │   └─ Yes: goto copy_to_user
                    │                       
                    └─ Cache miss:      11. Page not cached
                        page_cache_alloc()  
                        ├─ alloc_page() 12. Allocate page
                        ├─ add_to_page_cache() 13. Add to cache
                        │                   
                        └─ a_ops→readpage() 14. Read from disk
                            (e.g., ext4_readpage)
                            ├─ ext4_map_blocks() 15. Map logical→physical
                            │   └─ Read extent tree
                            │       └─ Return physical block number
                            │                   
                            ├─ submit_bio()  16. Submit I/O
                            │   (block layer - Layer 5)
                            │                   
                            └─ wait_on_page_locked() 17. Wait for I/O
                                └─ Sleep until I/O complete
                                    └─ SetPageUptodate()

copy_to_user:                        18. Copy to userspace
    copy_page_to_iter()                 
    └─ Copy page data to user buffer    

Update file position                 19. Update f_pos
    file→f_pos += bytes_read            

Return bytes_read                    20. Return to user
```

---

### Path Lookup in Detail

**Dcache lookup (fast path):**

```
__d_lookup(parent, &name)            1. Hash lookup
    ├─ hash = d_hash(parent, name)      
    ├─ head = dentry_hashtable[hash] 2. Get hash bucket
    │                                   
    └─ hlist_bl_for_each_entry()     3. Walk hash chain
        ├─ Compare d_parent             
        ├─ Compare d_name.len           
        ├─ Compare d_name.hash          
        └─ Compare d_name.name          
            └─ Match! Return dentry     

Cost: O(1) average, very fast (cache hit)
```

**Slow path (disk lookup):**

```
lookup_slow()                        1. Call filesystem
    ├─ inode_lock(dir)                  
    │                                   
    └─ dir→i_op→lookup()             2. Filesystem lookup
        (e.g., ext4_lookup)             
        │                               
        ├─ ext4_find_entry()         3. Search directory
        │   ├─ Read directory blocks    
        │   │   (from page cache or disk)
        │   │                           
        │   └─ Linear search for name   
        │       ┌─────────────────┐     
        │       │ inode | namelen │     
        │       │   42  |    4    │ → "home"
        │       │  128  |    4    │ → "user"
        │       │  256  |    8    │ → "file.txt"  ← Found!
        │       └─────────────────┘     
        │                               
        ├─ ext4_iget(inode_num)      4. Read inode
        │   ├─ Read inode block         
        │   └─ Fill struct inode        
        │                               
        └─ d_splice_alias()          5. Create dentry
            ├─ d_alloc()                
            └─ d_add()  // Add to cache 

Cost: Disk I/O (slow!) 
      But cached for future lookups
```

---

## 6️⃣ Concurrency Model

### Inode Locking

**Two-level locking:**
```c
struct inode {
    spinlock_t i_lock;          // Protects metadata fields
    struct rw_semaphore i_rwsem; // Serializes file operations
};
```

**i_lock (spinlock):**
- Protects: i_size, i_blocks, i_state, etc.
- Duration: Very short (few instructions)
- Context: Can be taken in interrupt context

**i_rwsem (rw_semaphore):**
- Protects: File data and directory operations
- Duration: Can be long (during I/O)
- Context: Process context only (can sleep)

**Lock ordering:**
```
Read:
  inode_lock_shared(inode)  // Allows concurrent readers
  ... read data ...
  inode_unlock_shared(inode)

Write:
  inode_lock(inode)         // Exclusive lock
  ... write data ...
  inode_unlock(inode)

Directory operations:
  inode_lock(dir)           // Lock parent directory
  ... create/unlink file ...
  inode_unlock(dir)
```

---

### Dentry Cache Locking

**RCU + per-dentry spinlock:**
```c
struct dentry {
    spinlock_t d_lock;       // Protects dentry fields
    // ...
};

/* Fast path: RCU read (lockless!) */
rcu_read_lock();
dentry = __d_lookup(parent, name);  // No locks needed!
if (dentry)
    use_dentry(dentry);
rcu_read_unlock();

/* Slow path: modification */
spin_lock(&dentry→d_lock);
dentry→d_flags |= DCACHE_...;
spin_unlock(&dentry→d_lock);
```

**Why RCU:**
Path lookups are extremely frequent and mostly read-only. RCU allows lockless reads!

---

## 7️⃣ Memory Model

### Page Cache Integration

**Address space as page cache:**
```c
struct inode {
    struct address_space i_data;  // Embedded address_space
    // ...
};

/* File offset → page cache */
page = find_get_page(inode→i_mapping, offset >> PAGE_SHIFT);
```

**XArray (Radix Tree) for fast lookup:**
```
address_space→i_pages (XArray):

Index 0 (offset 0-4095):      → struct page *
Index 1 (offset 4096-8191):   → struct page *
Index 2 (offset 8192-12287):  → struct page *
...

Lookup: O(log n) typically O(1) for small files
```

---

## 8️⃣ Hardware Interaction

**VFS is hardware-agnostic!**

```
VFS Layer:
  vfs_read() → generic_file_read_iter()
      ↓
  Page Cache (mm/filemap.c)
      ↓
  mapping→a_ops→readpage()
      ↓
  Filesystem (ext4, XFS, etc.)
      ↓
  submit_bio()
      ↓
  Block Layer (Layer 5) ← Interfaces with hardware
      ↓
  Storage Driver (Layer 6)
      ↓
  Hardware (Layer 0)
```

---

## 9️⃣ Performance Considerations

### Dcache Effectiveness

**Cache hit ratio:**
- Typical workload: 95-99% dcache hit rate
- Cache miss: Requires disk I/O (~5-10ms SSD, ~10ms HDD)
- Cache hit: ~100ns (memory lookup)

**Impact:**
```
Without dcache (every lookup hits disk):
  ls -l /usr/bin (1000 files)
  = 1000 × 10ms = 10 seconds!

With dcache:
  = 1000 × 100ns = 0.1ms
  
  100,000× speedup!
```

### Readahead

**Problem:**
Reading 1 page at a time is inefficient (disk seeks).

**Solution:**
Readahead predicts future reads and fetches pages in advance.

```c
/* mm/readahead.c */
page_cache_ra_order()
    ├─ Detect sequential read pattern
    ├─ Increase readahead window (4 → 8 → 16 → 32 pages)
    └─ Submit multi-page I/O request

Example:
  User reads offset 0
  → Kernel reads offsets 0-127KB (32 pages)
  User reads offset 4KB
  → Already in cache! (readahead worked)
```

---

## 🔟 ASCII Architecture Diagrams

### VFS Layer Organization

```
┌────────────────────────────────────────────────────────────┐
│                    User Space                              │
│   open(), read(), write(), close(), stat(), ...           │
└────────────────────┬───────────────────────────────────────┘
                     │ System calls
                     ↓
┌────────────────────────────────────────────────────────────┐
│              VFS (Virtual File System)                     │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  inode   │  │  dentry  │  │   file   │  │  super_  │  │
│  │          │  │  (dcache)│  │          │  │  block   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│                                                             │
│  Generic operations: vfs_read(), vfs_write(), etc.        │
└────────────────────┬───────────────────────────────────────┘
                     │ f_op→read_iter(), i_op→lookup()
                     ↓
┌────────────────────────────────────────────────────────────┐
│              Specific Filesystems                          │
│                                                             │
│  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐          │
│  │  ext4  │  │  XFS   │  │ Btrfs  │  │  NFS   │          │
│  └────────┘  └────────┘  └────────┘  └────────┘          │
│                                                             │
│  Implement: file_operations, inode_operations, etc.       │
└────────────────────┬───────────────────────────────────────┘
                     │ submit_bio()
                     ↓
┌────────────────────────────────────────────────────────────┐
│              Block Layer (Layer 5)                         │
└────────────────────────────────────────────────────────────┘
```

### File Descriptor to Inode Relationship

```
Process:
  struct task_struct
      ↓
  struct files_struct
      ↓
  struct fdtable
      ├─ fd[0] → struct file (stdin)
      ├─ fd[1] → struct file (stdout)
      ├─ fd[2] → struct file (stderr)
      ├─ fd[3] → struct file ──────────┐
      ├─ fd[4] → struct file           │
      └─ fd[5] → struct file ──────┐   │
                                   │   │
                      ┌────────────┘   │
                      ↓                ↓
                  struct file      struct file
                  ├─ f_path        ├─ f_path
                  ├─ f_pos = 1024  ├─ f_pos = 0
                  └─ f_op          └─ f_op
                      ↓                ↓
                  struct dentry    struct dentry
                  ├─ d_name = "a"  ├─ d_name = "b"
                  └─ d_inode       └─ d_inode
                      ↓                ↓
                  struct inode     struct inode
                  ├─ i_ino = 42    ├─ i_ino = 128
                  ├─ i_size        ├─ i_size
                  └─ i_mapping     └─ i_mapping
                      ↓                ↓
                  address_space    address_space
                  (page cache)     (page cache)
```

### Path Lookup Flow

```
open("/home/user/file.txt")
        ↓
┌─────────────────────────────────────┐
│ 1. Start at root or cwd             │
│    path_init()                      │
└───────────┬─────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ 2. Walk path components             │
│    link_path_walk()                 │
│    ┌───────────────────────────┐   │
│    │ Component: "home"         │   │
│    │ __d_lookup() → dcache hit │   │
│    │ dentry found!             │   │
│    └───────────────────────────┘   │
│    ┌───────────────────────────┐   │
│    │ Component: "user"         │   │
│    │ __d_lookup() → dcache miss│   │
│    │ lookup_slow()             │   │
│    │   → Read directory        │   │
│    │   → Find "user" inode     │   │
│    │   → d_alloc() + d_add()   │   │
│    │ New dentry cached         │   │
│    └───────────────────────────┘   │
│    ┌───────────────────────────┐   │
│    │ Component: "file.txt"     │   │
│    │ Similar to above          │   │
│    └───────────────────────────┘   │
└───────────┬─────────────────────────┘
            ↓
┌─────────────────────────────────────┐
│ 3. Handle last component            │
│    do_last()                        │
│    ├─ Permission check              │
│    └─ vfs_open()                    │
└───────────┬─────────────────────────┘
            ↓
        struct file
```

---

## Summary of Layer 4

**VFS provides:**

1. **Unified interface**: Same API for all filesystems
2. **Efficient caching**: Dcache (path components), page cache (file data)
3. **Path resolution**: Convert paths to inodes
4. **File abstraction**: inode, dentry, file, super_block
5. **Filesystem independence**: Generic operations with FS-specific callbacks

**Key takeaways:**
- Dcache is critical for performance (avoids disk I/O on lookups)
- Page cache integrates VFS with memory management
- inode is the VFS representation of a file
- dentry caches path component lookups
- struct file represents an open file descriptor

**Critical files:**
- `fs/namei.c` - Path resolution
- `fs/open.c` - File opening
- `fs/read_write.c` - Read/write operations
- `fs/dcache.c` - Dentry cache

---


# Layer 5 - Block Layer

## 1️⃣ High-Level Purpose

The **Block Layer** provides a unified interface between filesystems/VFS and block storage devices:

- **I/O request management**: Merging, sorting, scheduling
- **Request queue**: Per-device queues (blk-mq: multi-queue block layer)
- **I/O schedulers**: Deadline, CFQ, BFQ, none (for NVMe)
- **Plug/unplug**: Batch I/O requests for efficiency
- **Partitions**: Handle disk partitions
- **Device mapper**: RAID, LVM, encryption (dm-crypt)

**Call path:** VFS → Block Layer → Device Driver

---

## 2️⃣ Core Data Structures

### struct bio - Block I/O Request

```c
/* include/linux/blk_types.h */
struct bio {
    struct block_device *bi_bdev;      // Target block device
    unsigned int bi_opf;               // Operation (READ/WRITE) + flags
    unsigned short bi_vcnt;            // # bio_vec entries
    unsigned short bi_max_vecs;        // Max bio_vec entries
    
    struct bio_vec *bi_io_vec;         // Array of segments
    
    sector_t bi_iter.bi_sector;        // Start sector
    unsigned int bi_iter.bi_size;      // Bytes remaining
    
    bio_end_io_t *bi_end_io;           // Completion callback
    void *bi_private;                  // Private data
};

struct bio_vec {
    struct page *bv_page;              // Page
    unsigned int bv_len;               // Length
    unsigned int bv_offset;            // Offset in page
};
```

**Purpose:** Represents a block I/O operation. Multiple bio_vec entries allow scatter-gather I/O.

---

### struct request - I/O Request

```c
/* include/linux/blk-mq.h */
struct request {
    struct request_queue *q;           // Request queue
    struct gendisk *rq_disk;           // Disk
    
    unsigned int cmd_flags;            // Command flags
    sector_t __sector;                 // Start sector
    unsigned int __data_len;           // Total data length
    
    struct bio *bio;                   // First bio
    struct bio *biotail;               // Last bio
    
    void *special;                     // Driver-specific
    
    /* Timing */
    u64 start_time_ns;                 // Start time
    u64 io_start_time_ns;              // I/O start time
};
```

**Purpose:** One or more bios aggregated into a single request for driver.

---

## 3️⃣ Call Path

### Submit I/O Path

```
Filesystem (ext4)
    ↓
submit_bio(bio)  (block/blk-core.c)
    ↓
blk_mq_submit_bio()
    ├─ Check if plug active
    │   └─ If yes: Add to plug list (batch)
    └─ If no plug:
        ↓
    blk_mq_make_request()
        ├─ Merge with existing request?
        │   └─ Try to merge bio with pending request
        ├─ Allocate new request
        │   └─ blk_mq_get_request()
        └─ Insert into queue
            ↓
    __blk_mq_run_hw_queue()
        ├─ Get requests from software queue
        └─ Call driver: rq→q→mq_ops→queue_rq()
            ↓
    Driver (e.g., nvme_queue_rq)
        ├─ Map request to device command
        ├─ Write to device submission queue (SQ)
        └─ Ring doorbell (MMIO write)
            ↓
    [Device processes command, DMAs data]
    [Device writes completion to CQ, sends MSI-X]
            ↓
    nvme_irq (interrupt handler)
        ├─ Process completion queue
        ├─ Call blk_mq_complete_request()
        └─ bio_endio() → Call bi_end_io callback
            ↓
    Filesystem completion handler
        └─ Mark page uptodate, wake up waiters
```

---

## 4️⃣ Key Concepts

### blk-mq (Multi-Queue)

**Problem:** Traditional single request queue bottleneck on multi-core.

**Solution:** Per-CPU software queues + per-HW-queue hardware queues.

```
CPU 0          CPU 1          CPU 2          CPU 3
  ↓              ↓              ↓              ↓
SW Queue 0   SW Queue 1   SW Queue 2   SW Queue 3
  └──────────────┴──────────────┴──────────────┘
                        ↓
            ┌───────────┴───────────┐
            ↓                       ↓
        HW Queue 0              HW Queue 1
            ↓                       ↓
       NVMe SQ 0               NVMe SQ 1
            ↓                       ↓
        [NVMe Device]
```

---

## Summary

- **bio**: Basic I/O unit (page-based)
- **request**: Aggregated bios for driver
- **blk-mq**: Scalable multi-queue architecture
- **I/O schedulers**: Optimize disk access patterns (less relevant for SSDs)

---

# Layer 6 - Storage Drivers

## 1️⃣ High-Level Purpose

**Storage drivers** interface between block layer and storage hardware:

- **NVMe**: PCIe-attached SSDs (drivers/nvme/)
- **AHCI/SATA**: SATA controllers (drivers/ata/)
- **SCSI**: SCSI/SAS devices (drivers/scsi/)
- **virtio-blk**: Virtual block devices (for VMs)

---

## 2️⃣ NVMe Driver Architecture

### Key Files

- `drivers/nvme/host/pci.c` - PCIe NVMe driver
- `drivers/nvme/host/core.c` - Core NVMe logic

### Data Structures

```c
struct nvme_dev {
    struct pci_dev *pdev;              // PCIe device
    void __iomem *bar;                 // MMIO registers
    struct nvme_queue *queues;         // I/O queues
    u32 db_stride;                     // Doorbell stride
};

struct nvme_queue {
    struct nvme_command *sq_cmds;      // Submission queue
    volatile struct nvme_completion *cqes; // Completion queue
    dma_addr_t sq_dma_addr;            // DMA address of SQ
    u16 sq_tail;                       // SQ tail pointer
    u16 cq_head;                       // CQ head pointer
    u16 qid;                           // Queue ID
    u8 cq_phase;                       // Phase bit
};
```

---

## 3️⃣ I/O Flow

### Submit Command

```
nvme_queue_rq()  (driver entry point)
    ↓
1. Convert request → NVMe command
   ├─ Opcode (READ/WRITE)
   ├─ Namespace ID
   ├─ LBA (logical block address)
   └─ Length

2. Map data buffers
   ├─ dma_map_sg()
   └─ Build PRP list (Physical Region Pages)

3. Write command to submission queue
   memcpy(&sq[sq_tail], &cmd, sizeof(cmd));
   sq_tail++;

4. Ring doorbell
   writel(sq_tail, &nvmeq→q_db);  // MMIO write

[Device processes command]
```

### Complete Command

```
[Device completes I/O, writes to CQ, sends MSI-X]
    ↓
nvme_irq()  (interrupt handler)
    ↓
1. Read completion queue
   while (cqe[cq_head].status & phase_bit) {
       Process completion
       cq_head++;
   }

2. Update doorbell
   writel(cq_head, &nvmeq→cq_db);

3. Complete request
   blk_mq_complete_request(req);
```

---

## Summary

- **NVMe driver**: High-performance PCIe SSD driver
- **Command submission**: Write to SQ + doorbell
- **Completion**: Process CQ on interrupt
- **DMA**: Device directly accesses memory (PRPs)

---

# Layer 7 - Networking Stack

## 1️⃣ High-Level Purpose

The **networking stack** implements TCP/IP and other protocols:

- **Sockets API**: Application interface
- **Protocol layers**: TCP, UDP, IP, Ethernet
- **Routing**: Packet forwarding
- **Netfilter**: Firewalling (iptables)
- **Network devices**: Interface with NICs

---

## 2️⃣ Directory Mapping

```
net/
├── socket.c                       # Socket syscalls
├── core/                          # Core networking
│   ├── sock.c                     # Socket management
│   ├── skbuff.c                   # sk_buff management
│   ├── dev.c                      # Network device handling
│   └── rtnetlink.c                # Netlink interface
├── ipv4/                          # IPv4
│   ├── tcp.c                      # TCP protocol
│   ├── udp.c                      # UDP protocol
│   ├── ip_output.c                # IP transmission
│   ├── ip_input.c                 # IP reception
│   └── route.c                    # Routing
├── ipv6/                          # IPv6
├── ethernet/                      # Ethernet
├── netfilter/                     # Netfilter/iptables
└── unix/                          # Unix domain sockets
```

---

## 3️⃣ Core Data Structures

### struct sk_buff - Socket Buffer

```c
/* include/linux/skbuff.h */
struct sk_buff {
    struct sk_buff *next;              // Next in list
    struct sk_buff *prev;              // Previous in list
    
    struct net_device *dev;            // Device
    
    /* Pointers into data */
    unsigned char *head;               // Buffer head
    unsigned char *data;               // Data head
    unsigned char *tail;               // Data tail
    unsigned char *end;                // Buffer end
    
    unsigned int len;                  // Data length
    unsigned int data_len;             // Data in frags
    
    /* Protocol headers */
    __u16 transport_header;            // TCP/UDP header offset
    __u16 network_header;              // IP header offset
    __u16 mac_header;                  // Ethernet header offset
    
    /* Socket */
    struct sock *sk;                   // Owning socket
};
```

**Purpose:** Packet buffer for network data. Contains headers + payload.

**Layout:**
```
head                data            tail                end
  ↓                  ↓                ↓                  ↓
  ┌──────────────────┬────────────────┬──────────────────┐
  │   Headroom       │   Data         │   Tailroom       │
  │  (for headers)   │  (payload)     │  (for padding)   │
  └──────────────────┴────────────────┴──────────────────┘
```

---

### struct sock - Socket

```c
/* include/net/sock.h */
struct sock {
    int sk_family;                     // Protocol family (AF_INET, etc.)
    unsigned short sk_type;            // Socket type (SOCK_STREAM, SOCK_DGRAM)
    unsigned short sk_protocol;        // Protocol (IPPROTO_TCP, etc.)
    
    struct sock_common __sk_common;    // Common fields
    
    /* Receive/transmit queues */
    struct sk_buff_head sk_receive_queue;
    struct sk_buff_head sk_write_queue;
    
    /* Socket state */
    int sk_state;                      // TCP_ESTABLISHED, etc.
    
    /* Callbacks */
    void (*sk_data_ready)(struct sock *sk);
    void (*sk_write_space)(struct sock *sk);
    
    /* ... */
};
```

---

## 4️⃣ TX Path (Sending)

```
Application: send(sockfd, buf, len)
    ↓
sys_sendto()
    ↓
sock_sendmsg()
    ↓
tcp_sendmsg()  (net/ipv4/tcp.c)
    ├─ Allocate sk_buff
    ├─ Copy data from user
    └─ Add to socket write queue
        ↓
tcp_push()
    ↓
tcp_write_xmit()
    ├─ Build TCP header
    └─ Call ip_queue_xmit()
        ↓
ip_output()  (net/ipv4/ip_output.c)
    ├─ Build IP header
    ├─ Routing lookup
    └─ Call dev_queue_xmit()
        ↓
dev_hard_start_xmit()  (net/core/dev.c)
    └─ Call driver: dev→netdev_ops→ndo_start_xmit()
        ↓
Driver (e.g., e1000_xmit_frame)
    ├─ Map skb to DMA
    ├─ Write to TX descriptor ring
    └─ Kick device (MMIO write)
        ↓
[NIC transmits packet]
```

---

## 5️⃣ RX Path (Receiving)

```
[NIC receives packet, DMAs to memory, sends IRQ]
    ↓
Driver interrupt handler
    ├─ Disable interrupts
    └─ Schedule NAPI poll
        ↓
napi_poll()
    ↓
Driver poll (e.g., e1000_clean_rx_irq)
    ├─ Read RX descriptor ring
    ├─ Allocate sk_buff
    ├─ Copy/map DMA data to skb
    └─ Call netif_receive_skb()
        ↓
__netif_receive_skb_core()  (net/core/dev.c)
    ├─ Determine protocol (from Ethernet type)
    └─ Call ip_rcv()
        ↓
ip_rcv()  (net/ipv4/ip_input.c)
    ├─ Validate IP header
    ├─ Routing decision (local vs forward)
    └─ Call ip_local_deliver()
        ↓
ip_local_deliver()
    ├─ IP defragmentation (if needed)
    └─ Call tcp_v4_rcv()
        ↓
tcp_v4_rcv()  (net/ipv4/tcp_ipv4.c)
    ├─ Find socket
    ├─ Process TCP state machine
    ├─ Add to socket receive queue
    └─ Wake up application
        ↓
Application: recv() returns data
```

---

## 6️⃣ NAPI (New API)

**Problem:** High packet rate → IRQ storm (CPU overwhelmed).

**Solution:** NAPI - polling mode under load.

```
Low traffic:
  IRQ per packet → netif_rx()

High traffic:
  IRQ → Disable IRQs → Schedule poll
  napi_poll() → Process many packets → Re-enable IRQs
```

---

## Summary

- **sk_buff**: Packet buffer
- **sock**: Socket endpoint
- **TX path**: App → TCP → IP → Driver → NIC
- **RX path**: NIC → Driver → IP → TCP → App
- **NAPI**: Efficient packet processing under load

---

# Layer 8 - IPC (Inter-Process Communication)

## 1️⃣ High-Level Purpose

**IPC mechanisms** allow processes to communicate:

- **Pipes/FIFOs**: Unidirectional byte streams
- **Unix domain sockets**: Bidirectional, local only
- **System V IPC**: Shared memory, semaphores, message queues
- **POSIX IPC**: Similar to System V
- **Signals**: Asynchronous notifications (covered in Layer 2)

---

## 2️⃣ Directory Mapping

```
ipc/
├── msg.c                          # System V message queues
├── sem.c                          # System V semaphores
├── shm.c                          # System V shared memory
├── util.c                         # Common utilities
├── mqueue.c                       # POSIX message queues
└── namespace.c                    # IPC namespaces
```

---

## 3️⃣ Pipes

**Pipe creation:**
```c
int pipe(int pipefd[2]);
// pipefd[0] = read end
// pipefd[1] = write end
```

**Implementation:**
- Circular buffer in kernel (typically 64KB)
- Synchronized with wait queues
- Writer blocks when full, reader blocks when empty

---

## 4️⃣ Shared Memory

**System V shared memory:**
```c
int shmget(key_t key, size_t size, int shmflg);
void *shmat(int shmid, const void *shmaddr, int shmflg);
int shmdt(const void *shmaddr);
```

**Implementation:**
- Backed by tmpfs (in-memory filesystem)
- Mapped into process address space (VMA)
- Fastest IPC (no copying, direct memory access)

---

## Summary

- **Pipes**: Simple byte streams
- **Shared memory**: Fastest IPC (direct memory access)
- **Semaphores**: Synchronization primitives
- **Message queues**: Structured message passing

---

# Layer 9 - Security

## 1️⃣ High-Level Purpose

**Security subsystem** enforces access control:

- **LSM (Linux Security Modules)**: Framework for security modules
- **SELinux**: Mandatory access control (MAC)
- **AppArmor**: Path-based MAC
- **Capabilities**: Fine-grained privileges
- **Seccomp**: Syscall filtering

---

## 2️⃣ Directory Mapping

```
security/
├── security.c                     # LSM framework
├── selinux/                       # SELinux
│   ├── hooks.c                    # LSM hooks
│   ├── avc.c                      # Access vector cache
│   └── ss/                        # Security server
├── apparmor/                      # AppArmor
├── capability.c                   # Capabilities
├── commoncap.c                    # Common capabilities
└── keys/                          # Key management
```

---

## 3️⃣ LSM Hooks

**LSM framework:** Hooks at security-critical points.

```c
/* Example: file_permission hook */
int security_file_permission(struct file *file, int mask)
{
    return call_int_hook(file_permission, 0, file, mask);
}

/* SELinux implementation */
static int selinux_file_permission(struct file *file, int mask)
{
    /* Check SELinux policy */
    return avc_has_perm(sid, isid, SECCLASS_FILE, perms);
}
```

**Hook locations:**
- File operations: open, read, write
- Process operations: fork, exec, kill
- Network operations: socket, bind, connect
- IPC operations: semaphore, message queue

---

## 4️⃣ Capabilities

**Problem:** Traditional Unix: root (UID 0) has all privileges.

**Solution:** Split root privileges into capabilities.

```c
#define CAP_CHOWN            0   // Change file ownership
#define CAP_DAC_OVERRIDE     1   // Bypass file permission checks
#define CAP_NET_BIND_SERVICE 10  // Bind to ports < 1024
#define CAP_NET_RAW          13  // Use raw sockets
#define CAP_SYS_ADMIN        21  // Various admin operations
```

**Usage:**
```c
/* Check if process has capability */
if (!capable(CAP_NET_BIND_SERVICE))
    return -EACCES;
```

---

## 5️⃣ Seccomp

**Purpose:** Restrict syscalls a process can make.

**Example:**
```c
/* Allow only read, write, exit */
scmp_filter_ctx ctx = seccomp_init(SCMP_ACT_KILL);
seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(read), 0);
seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(write), 0);
seccomp_rule_add(ctx, SCMP_ACT_ALLOW, SCMP_SYS(exit), 0);
seccomp_load(ctx);

/* Any other syscall → process killed */
```

---

## Summary

- **LSM**: Framework for security modules
- **SELinux/AppArmor**: Mandatory access control
- **Capabilities**: Fine-grained root privileges
- **Seccomp**: Syscall filtering (sandboxing)

---

# Layer 10 - Virtualization (KVM)

## 1️⃣ High-Level Purpose

**KVM (Kernel-based Virtual Machine)** enables hardware virtualization:

- **Virtual machines**: Run guest OSes
- **CPU virtualization**: VMX (Intel) / SVM (AMD)
- **Memory virtualization**: EPT / NPT (nested page tables)
- **I/O virtualization**: virtio devices
- **Device passthrough**: VFIO (direct device access)

---

## 2️⃣ Directory Mapping

```
virt/kvm/
├── kvm_main.c                     # Main KVM code
├── async_pf.c                     # Async page fault
├── coalesced_mmio.c               # MMIO coalescing
└── irqchip.c                      # IRQ chip

arch/x86/kvm/
├── vmx/                           # Intel VMX
│   ├── vmx.c                      # VMX operations
│   └── nested.c                   # Nested virtualization
├── svm/                           # AMD SVM
│   └── svm.c                      # SVM operations
├── mmu/                           # MMU virtualization
│   └── mmu.c                      # Shadow page tables / EPT
├── x86.c                          # x86-specific KVM
└── lapic.c                        # Local APIC emulation
```

---

## 3️⃣ Core Concepts

### VMCS (Virtual Machine Control Structure)

**Intel VMX:** VMCS controls VM execution.

```c
struct vcpu_vmx {
    struct kvm_vcpu vcpu;              // Generic vCPU
    struct loaded_vmcs vmcs01;         // VMCS for L1
    unsigned long host_rsp;            // Host RSP
    u32 exit_reason;                   // VM exit reason
};
```

---

### VM Entry/Exit

**VM Entry:** Host → Guest
```
vmx_vcpu_run()
    ├─ Load guest state to VMCS
    ├─ VMLAUNCH / VMRESUME instruction
    └─ [CPU switches to guest mode]
```

**VM Exit:** Guest → Host
```
[Guest triggers VM exit (I/O, page fault, etc.)]
    ↓
CPU switches to host mode
    ↓
vmx_handle_exit()
    ├─ Read exit reason from VMCS
    ├─ Handle exit:
    │   ├─ I/O: Emulate instruction
    │   ├─ EPT violation: Handle page fault
    │   └─ HLT: Schedule other vCPUs
    └─ Return to guest (VM entry)
```

---

### EPT (Extended Page Tables)

**Problem:** Guest physical address → Host physical address translation.

**Solution:** EPT - hardware-assisted nested paging.

```
Guest Virtual → Guest Physical → Host Physical
     (GVA)          (GPA)             (HPA)
      ↓              ↓                 ↓
   Guest PT       EPT (managed by hypervisor)
```

---

## Summary

- **KVM**: Kernel-based virtualization
- **VMX/SVM**: Hardware virtualization extensions
- **EPT/NPT**: Nested page tables for memory virtualization
- **virtio**: Efficient para-virtualized devices

---

# Layer 11 - Power Management

## 1️⃣ High-Level Purpose

**Power management** reduces power consumption:

- **CPU idle states (C-states)**: Deep sleep when idle
- **CPU frequency scaling (P-states)**: Dynamic frequency
- **Suspend/resume**: System sleep states
- **Runtime PM**: Per-device power management

---

## 2️⃣ Directory Mapping

```
kernel/power/
├── main.c                         # Suspend/resume
├── suspend.c                      # Suspend to RAM
├── hibernate.c                    # Suspend to disk
├── snapshot.c                     # Memory snapshot
└── process.c                      # Freeze processes

drivers/acpi/
├── bus.c                          # ACPI bus
├── scan.c                         # Device enumeration
└── processor_idle.c               # CPU idle

drivers/cpufreq/
├── cpufreq.c                      # CPU frequency scaling
└── intel_pstate.c                 # Intel P-state driver
```

---

## 3️⃣ CPU Idle (C-states)

**C-states:** CPU power states.
```
C0: Active (running)
C1: Halt (clock gated)
C2: Stop-clock (deeper sleep)
C3: Sleep (caches flushed)
C6: Deep power down
```

**cpuidle framework:**
```c
void cpu_idle_loop(void)
{
    while (1) {
        if (need_resched()) {
            schedule();
        } else {
            /* Enter idle state */
            cpuidle_idle_call();
        }
    }
}
```

---

## 4️⃣ CPU Frequency Scaling

**P-states:** Performance states (frequency/voltage).

**Governors:**
- **performance**: Max frequency always
- **powersave**: Min frequency always
- **ondemand**: Dynamic (increase on load)
- **conservative**: Gradual frequency changes
- **schedutil**: Scheduler-driven (default)

---

## 5️⃣ Suspend/Resume

**Suspend to RAM (S3):**
```
1. Freeze userspace (stop all processes)
2. Suspend devices (call dev→pm→suspend)
3. Disable non-boot CPUs
4. Enter low-power state (ACPI S3)

[System sleeps]

[Wake event: keyboard, timer]
5. Resume CPUs
6. Resume devices
7. Thaw processes
```

---

## Summary

- **cpuidle**: CPU idle states (C-states)
- **cpufreq**: Dynamic frequency scaling (P-states)
- **Suspend/resume**: System sleep
- **Runtime PM**: Per-device power management

---

# Layer 12 - Device Model

## 1️⃣ High-Level Purpose

**Device model** provides unified device management:

- **struct device**: Unified device representation
- **Buses**: PCI, USB, I2C, SPI, etc.
- **Drivers**: Device driver matching
- **sysfs**: /sys filesystem for device visibility
- **udev**: Userspace device management
- **Hotplug**: Dynamic device insertion/removal

---

## 2️⃣ Directory Mapping

```
drivers/base/
├── core.c                         # Device core
├── bus.c                          # Bus management
├── driver.c                       # Driver management
├── class.c                        # Device classes
├── platform.c                     # Platform devices
├── power/                         # Device power management
└── dd.c                           # Device-driver binding
```

---

## 3️⃣ Core Data Structures

### struct device

```c
/* include/linux/device.h */
struct device {
    struct device *parent;             // Parent device
    struct device_private *p;          // Private data
    
    struct kobject kobj;               // Embedded kobject (for sysfs)
    const char *init_name;             // Initial name
    const struct device_type *type;    // Device type
    
    struct bus_type *bus;              // Bus type
    struct device_driver *driver;      // Driver
    
    void *platform_data;               // Platform-specific data
    void *driver_data;                 // Driver-specific data
    
    struct dev_pm_info power;          // Power management
    
    /* DMA */
    u64 *dma_mask;                     // DMA mask
    u64 coherent_dma_mask;             // Coherent DMA mask
    
    /* ... */
};
```

---

### struct bus_type

```c
struct bus_type {
    const char *name;                  // Bus name
    
    int (*match)(struct device *dev, struct device_driver *drv);
    int (*probe)(struct device *dev);
    int (*remove)(struct device *dev);
    
    const struct dev_pm_ops *pm;       // Power management
};
```

**Examples:** pci_bus_type, usb_bus_type, i2c_bus_type

---

### struct device_driver

```c
struct device_driver {
    const char *name;                  // Driver name
    struct bus_type *bus;              // Bus type
    
    int (*probe)(struct device *dev);
    int (*remove)(struct device *dev);
    
    const struct dev_pm_ops *pm;       // Power management
};
```

---

## 4️⃣ Device-Driver Binding

**Device registration:**
```
1. Device discovered (PCI enumeration, USB plug)
2. device_register()
   ├─ kobject_add() (add to sysfs)
   └─ bus_probe_device()
       └─ For each driver on bus:
           if (bus→match(dev, drv))
               driver_probe_device()
                   └─ drv→probe(dev)
```

**Driver registration:**
```
1. driver_register()
   ├─ bus_add_driver()
   └─ For each device on bus:
       if (bus→match(dev, drv))
           driver_probe_device()
               └─ drv→probe(dev)
```

---

## 5️⃣ sysfs

**/sys filesystem:** Device tree in userspace.

```
/sys/devices/
  └─ pci0000:00/
      └─ 0000:00:1f.2/  (SATA controller)
          ├─ vendor  (PCI vendor ID)
          ├─ device  (PCI device ID)
          ├─ uevent  (hotplug events)
          └─ ...

/sys/bus/
  └─ pci/
      ├─ devices/ (symlinks to /sys/devices/)
      └─ drivers/
          └─ ahci/ (AHCI driver)
              └─ 0000:00:1f.2 (bound device)

/sys/class/
  └─ block/
      └─ sda/  (disk)
          ├─ size
          ├─ queue/
          └─ dev (major:minor)
```

---

## Summary

- **struct device**: Unified device representation
- **Bus drivers**: PCI, USB, etc. enumerate devices
- **Driver binding**: Automatic matching via match()
- **sysfs**: Exports device tree to userspace
- **Hotplug**: Dynamic device insertion/removal

---

# Final Summary

## Complete Linux Kernel Architecture (12 Layers)

**Layer 0 - Hardware**: CPU, MMU, interrupts, PCIe, DMA
**Layer 1 - Architecture**: Syscall entry, context switch, page tables
**Layer 2 - Core Kernel**: Scheduler, processes, signals, timers
**Layer 3 - Memory Management**: Physical/virtual memory, page cache, demand paging
**Layer 4 - VFS**: Unified filesystem interface, dcache, inodes
**Layer 5 - Block Layer**: I/O requests, blk-mq, I/O scheduling
**Layer 6 - Storage Drivers**: NVMe, AHCI, SCSI drivers
**Layer 7 - Networking**: TCP/IP stack, sockets, sk_buff
**Layer 8 - IPC**: Pipes, shared memory, semaphores
**Layer 9 - Security**: LSM, SELinux, capabilities, seccomp
**Layer 10 - Virtualization**: KVM, VMX/SVM, EPT
**Layer 11 - Power Management**: CPU idle, frequency scaling, suspend/resume
**Layer 12 - Device Model**: Unified device management, sysfs, hotplug

---

# Key Kernel Patterns

## Reference Counting
```c
struct kobject {
    atomic_t refcount;
};

/* Get reference */
kobject_get(kobj);

/* Release reference */
kobject_put(kobj);  // Frees when refcount → 0
```

## Wait Queues (Sleeping/Waking)
```c
DECLARE_WAIT_QUEUE_HEAD(wq);

/* Sleep */
wait_event(wq, condition);

/* Wake */
wake_up(&wq);
```

## Completion
```c
struct completion done;

/* Initialize */
init_completion(&done);

/* Wait */
wait_for_completion(&done);

/* Signal */
complete(&done);
```

## Workqueues (Deferred Work)
```c
DECLARE_WORK(work, work_func);

/* Schedule */
schedule_work(&work);

/* Executes in process context */
void work_func(struct work_struct *work) { ... }
```

## RCU (Read-Copy-Update)
```c
/* Read side (no locks!) */
rcu_read_lock();
ptr = rcu_dereference(global_ptr);
use(ptr);
rcu_read_unlock();

/* Update side */
new = kmalloc(...);
*new = *old;
rcu_assign_pointer(global_ptr, new);
synchronize_rcu();  // Wait for readers
kfree(old);
```

---

# Critical Performance Insights

1. **Context switches**: ~1-10µs cost (TLB flush expensive)
2. **Page faults**: ~5-10ms (disk I/O), ~10µs (zero page)
3. **System calls**: ~100-500ns (fast path: vDSO even faster)
4. **Cache misses**: ~100ns L3, ~200ns remote NUMA
5. **Lock contention**: Avoid by using per-CPU data, RCU
6. **Disk I/O**: ~100µs (NVMe), ~5-10ms (SSD), ~10ms (HDD)
7. **Network latency**: ~50µs (localhost), ~0.5ms (datacenter), ~50ms (internet)

---

# Documentation Complete

This comprehensive Linux kernel architecture documentation covers all 12 layers from hardware to device model, totaling ~7000+ lines of detailed technical content including:

✓ Real kernel source file references
✓ Complete data structure definitions  
✓ Detailed call path tracing
✓ Concurrency models and locking patterns
✓ Performance considerations and optimizations
✓ ASCII architecture diagrams
✓ Critical kernel patterns

**Total coverage:** Hardware → Architecture → Core Kernel → Memory → VFS → Block → Storage → Networking → IPC → Security → Virtualization → Power → Device Model

