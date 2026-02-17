# Linux Architecture-Specific Code (x86)
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
Architecture-specific code provides the low-level bridge between hardware and the portable kernel. It handles CPU-specific operations (context switching, interrupt handling, system call entry), memory management unit (MMU) operations (page table setup, TLB management), boot sequences, CPU features detection, and hardware initialization. This layer abstracts hardware details, allowing the core kernel to remain portable across different architectures (x86, ARM, RISC-V, etc.).

### System Architecture
```
┌─────────────────────────────────────────┐
│   Portable Kernel (sched, mm, fs, net)   │
│   Architecture-independent code          │
└─────────────────┬───────────────────────┘
                  │ Generic interfaces
┌─────────────────▼───────────────────────┐
│     ARCHITECTURE-SPECIFIC (arch/x86/)    │
│  - System Call Entry (syscall, int 0x80) │
│  - Interrupt/Exception Handling (IDT)    │
│  - Context Switch (register save/restore)│
│  - MMU Management (page tables, TLB)     │
│  - CPU Features (CPUID, MSRs)            │
│  - Boot (head.S, setup.S)                │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│  Hardware     │   │  Firmware        │
│  CPU, MMU     │   │  BIOS, UEFI      │
│  APIC, MSRs   │   │  ACPI            │
└───────────────┘   └──────────────────┘
```

---

## 2️⃣ Core Components

### Entry Points (`arch/x86/entry/`)
- **entry_64.S**: System call entry (syscall instruction), interrupt handlers
- **common.c**: Common entry code, syscall tracing
- **syscall_64.c**: System call table

### Kernel Core (`arch/x86/kernel/`)
- **process_64.c**: Context switch (`__switch_to()`), copy_thread()
- **cpu/**: CPU feature detection, microcode loading
- **apic/**: APIC (interrupt controller) initialization
- **irq.c, irqinit.c**: IRQ handling
- **setup.c**: Early boot setup, memory detection
- **head_64.S**: Boot entry point, initial page tables

### MMU (`arch/x86/mm/`)
- **pgtable.c**: Page table operations
- **fault.c**: Page fault handling (`do_page_fault()`)
- **tlb.c**: TLB shootdown, flush operations
- **ioremap.c**: I/O memory mapping

### Boot (`arch/x86/boot/`)
- **header.S**: Boot sector, boot protocol
- **compressed/head_64.S**: Decompression stub
- **setup.S**: Real mode setup code

---

## 3️⃣ Key Data Structures

### `struct thread_struct` (Architecture Thread State)
```c
struct thread_struct {
    struct desc_struct tls_array[GDT_ENTRY_TLS_ENTRIES]; // Thread-local storage
    unsigned long sp;                 // Kernel stack pointer
    unsigned short es, ds, fsindex, gsindex; // Segment registers
    unsigned long fsbase, gsbase;     // FS/GS base addresses
    struct fpu fpu;                   // FPU/SSE/AVX state
    unsigned long io_bitmap_ptr;      // I/O permission bitmap
    unsigned long iopl;               // I/O privilege level
};
```

### `struct pt_regs` (Saved Registers on Stack)
```c
struct pt_regs {
    unsigned long r15, r14, r13, r12, rbp, rbx; // Callee-saved
    unsigned long r11, r10, r9, r8;   // Caller-saved
    unsigned long rax, rcx, rdx, rsi, rdi; // Arguments & return
    unsigned long orig_rax;           // Original syscall number
    unsigned long rip;                // Instruction pointer
    unsigned long cs;                 // Code segment
    unsigned long eflags;             // Flags
    unsigned long rsp;                // Stack pointer
    unsigned long ss;                 // Stack segment
};
```

### CPU Features
```c
struct cpuinfo_x86 {
    char vendor_id[16];               // "GenuineIntel", "AuthenticAMD"
    int x86;                          // CPU family
    int x86_model;                    // Model
    int x86_stepping;                 // Stepping
    int x86_cache_alignment;          // Cache line size
    int x86_phys_bits, x86_virt_bits; // Address width
    __u32 x86_capability[NCAPINTS];   // Feature flags (SSE, AVX, etc.)
};
```

---

## 4️⃣ Call Path Examples

### Path 1: System Call Entry (x86-64)
```
User Space: syscall instruction (e.g., write(fd, buf, len))
  → Hardware: SYSCALL instruction
    ├→ RIP = LSTAR MSR (entry_SYSCALL_64)
    ├→ CS = STAR MSR
    └→ RFLAGS = RFLAGS & ~(FMASK MSR)
              ↓
entry_SYSCALL_64: [arch/x86/entry/entry_64.S:87]
  ├→ SWAPGS (swap GS for kernel per-CPU data)
  ├→ Save user RSP in PER_CPU(cpu_tss_rw.x86_tss.sp2)
  ├→ Load kernel RSP
  ├→ Push SS, RSP, RFLAGS, CS, RIP (build pt_regs)
  ├→ PUSH_AND_CLEAR_REGS (save all GPRs)
  └→ CALL do_syscall_64 [arch/x86/entry/common.c:72]
              ↓
do_syscall_64():
  ├→ syscall_enter_from_user_mode() (tracing, audit)
  ├→ nr = regs->orig_rax
  ├→ regs->ax = sys_call_table[nr](args...) [Invoke syscall handler]
  └→ syscall_exit_to_user_mode()
              ↓
return_from_SYSCALL_64: [arch/x86/entry/entry_64.S]
  ├→ POP_REGS (restore GPRs)
  ├→ SWAPGS (restore user GS)
  ├→ Load user RIP, RSP from stack
  └→ SYSRETQ (return to userspace)
              ↓
User Space: continues after syscall
```

### Path 2: Page Fault
```
User accesses unmapped address:
  → Hardware: Page fault exception (#PF, vector 14)
    ├→ CPU pushes error code, RIP on stack
    └→ Jump to IDT entry 14 (asm_exc_page_fault)
              ↓
asm_exc_page_fault: [arch/x86/entry/entry_64.S]
  ├→ PUSH_AND_CLEAR_REGS (build pt_regs)
  └→ CALL exc_page_fault [arch/x86/mm/fault.c:1520]
              ↓
exc_page_fault():
  ├→ CR2 = faulting address (read from CR2 register)
  └→ do_user_addr_fault() [arch/x86/mm/fault.c:1420]
      ├→ find_vma() (lookup VMA for faulting address)
      ├→ Check access permissions (read/write/execute)
      └→ handle_mm_fault() [mm/memory.c] (portable MM code)
          └→ Allocate page, update page tables
              ↓
return_from_exception:
  ├→ POP_REGS
  └→ IRETQ (return from interrupt)
              ↓
User Space: retry faulting instruction
```

### Path 3: Context Switch
```
schedule() [kernel/sched/core.c]:
  → context_switch() [kernel/sched/core.c:5155]
    → switch_mm() [arch/x86/mm/tlb.c:500]
      ├→ Load new CR3 (page table base)
      └→ TLB flush (if different mm)
    → switch_to() [arch/x86/include/asm/switch_to.h]
      → __switch_to_asm() [arch/x86/entry/entry_64.S:274]
        ├→ PUSH callee-saved regs (RBP, RBX, R12-R15)
        ├→ MOV prev->thread.sp, RSP (save old RSP)
        ├→ MOV RSP, next->thread.sp (load new RSP)
        ├→ CALL __switch_to() [arch/x86/kernel/process_64.c:559]
        │   ├→ Save/restore FS, GS bases
        │   ├→ Load new task's TLS
        │   ├→ Switch FPU context (lazy or eager)
        │   └→ Update per-CPU current task pointer
        ├→ POP callee-saved regs
        └→ RET (returns to next task's saved RIP)
              ↓
Next task continues execution
```

---

## 5️⃣ Hardware Interaction

### Interrupt Descriptor Table (IDT)
- **Purpose**: Maps interrupt vectors (0-255) to handler addresses
- **Setup**: `load_idt()` in `arch/x86/kernel/idt.c`
- **Entries**:
  - 0-31: CPU exceptions (divide-by-zero, page fault, GPF, etc.)
  - 32-255: External interrupts (IRQs), syscalls (legacy int 0x80)

### Control Registers
| Register | Purpose |
|----------|---------|
| CR0 | Protected mode enable (PE), paging enable (PG), write protect (WP) |
| CR2 | Page fault linear address |
| CR3 | Page table base (PDBR), PCID |
| CR4 | Feature enables (PSE, PAE, PGE, OSFXSR, OSXSAVE, SMEP, SMAP) |
| CR8 | TPR (Task Priority Register) for APIC |

### Model-Specific Registers (MSRs)
| MSR | Purpose |
|-----|---------|
| LSTAR (0xC0000082) | Syscall entry point (entry_SYSCALL_64) |
| STAR (0xC0000081) | Syscall CS/SS selectors |
| FMASK (0xC0000084) | RFLAGS mask for syscall |
| EFER (0xC0000080) | Extended features (LME, SCE, NX) |
| FS_BASE, GS_BASE | FS/GS segment base addresses |

### CPU Features (CPUID)
- **Detection**: `arch/x86/kernel/cpu/common.c` - boot_cpu_data
- **Features**: SSE, AVX, AVX512, RDRAND, SMEP, SMAP, PCID, etc.
- **Alternatives**: Runtime code patching based on CPU features

---

## 6️⃣ Memory Management

### Page Table Levels (x86-64, 4-level)
```
Virtual Address (48-bit):
┌──────────┬──────────┬──────────┬──────────┬──────────────┐
│ Sign Ext │ PGD (9b) │ PUD (9b) │ PMD (9b) │ PTE (9b) │ Offset (12b) │
└──────────┴──────────┴──────────┴──────────┴──────────────┘

PGD (Page Global Directory) → PUD (Page Upper Directory)
  → PMD (Page Middle Directory) → PTE (Page Table Entry)
    → Physical Page
```

### TLB Management
- **Flush Single Page**: `invlpg` instruction
- **Flush All**: Load CR3
- **PCID**: Process-Context IDentifiers (tagged TLB, avoid flush on context switch)
- **TLB Shootdown**: IPI to flush TLB on remote CPUs (SMP)

### Huge Pages
- **2MB**: PMD-level mapping (PSE - Page Size Extension)
- **1GB**: PUD-level mapping (requires PDPE1GB feature)
- **Benefit**: Reduced TLB pressure, fewer page table levels

---

## 7️⃣ Configuration & Tools

### Kernel Configuration
- `CONFIG_X86_64`: 64-bit x86 architecture
- `CONFIG_SMP`: Symmetric multiprocessing
- `CONFIG_X86_LOCAL_APIC`, `CONFIG_X86_IO_APIC`: APIC support
- `CONFIG_X86_MCE`: Machine check exception
- `CONFIG_MICROCODE`: Microcode updates

### Boot Parameters
- `noapic`: Disable APIC
- `nolapic`: Disable local APIC
- `nohz=off`: Disable tickless kernel
- `idle=`: Idle loop (poll, halt, mwait)

### Debugging
- **dmesg**: Boot messages, CPU features detected
- `/proc/cpuinfo`: CPU information
- `/proc/interrupts`: Interrupt statistics
- **crash**: Kernel crash dump analysis (kdump)

---

**End of Architecture-Specific Documentation**
