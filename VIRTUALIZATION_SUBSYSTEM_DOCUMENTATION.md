# Linux Virtualization Subsystem (KVM)
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
The virtualization subsystem (primarily KVM - Kernel-based Virtual Machine) transforms Linux into a hypervisor, enabling multiple guest operating systems to run simultaneously on a single physical machine. KVM leverages hardware virtualization extensions (Intel VT-x, AMD-V) to run guest VMs at near-native performance. Provides CPU/memory virtualization, virtual device emulation (with QEMU userspace), and para-virtual device interfaces (virtio) for high-performance I/O.

### System Architecture
```
┌─────────────────────────────────────────┐
│   Guest OS (VM1)     Guest OS (VM2)      │
│   Ring 0 (Guest kernel in VMX non-root)  │
└─────────────────┬───────────────────────┘
                  │ VM exits (hypercalls, I/O, interrupts)
┌─────────────────▼───────────────────────┐
│     KVM (Kernel Virtualization)          │
│  - /dev/kvm (userspace API)              │
│  - vCPU scheduling & execution           │
│  - MMU virtualization (EPT/NPT)          │
│  - Interrupt virtualization (APIC)       │
│  - VM exit handling                      │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│  Hardware     │   │  QEMU (userspace)│
│  VT-x / AMD-V │   │  Device emulation│
│  EPT / NPT    │   │  virtio          │
└───────────────┘   └──────────────────┘
```

---

## 2️⃣ Core Components

### KVM Core (`virt/kvm/`, `arch/x86/kvm/`)
- **virt/kvm/kvm_main.c**: Core KVM logic, VM/vCPU management, `/dev/kvm` interface
- **arch/x86/kvm/vmx/vmx.c**: Intel VT-x (VMX) support
- **arch/x86/kvm/svm/svm.c**: AMD-V (SVM) support
- **arch/x86/kvm/mmu/**: MMU virtualization (shadow page tables, EPT/NPT)
- **arch/x86/kvm/lapic.c**: Local APIC virtualization
- **arch/x86/kvm/i8254.c, i8259.c**: PIT and PIC emulation

### Virtio (`drivers/virtio/`)
- **Purpose**: Para-virtualized I/O framework (virtio-blk, virtio-net, virtio-scsi)
- **Benefit**: Near-native I/O performance vs full emulation
- **Components**:
  - `drivers/virtio/virtio_ring.c`: Vring (virtqueue) implementation
  - `drivers/virtio/virtio_pci.c`: Virtio PCI transport
  - `drivers/net/virtio_net.c`: Virtio network driver

---

## 3️⃣ Key Data Structures

### `struct kvm`
```c
struct kvm {
    spinlock_t mmu_lock;              // MMU operations lock
    struct mm_struct *mm;             // Host mm for guest memory
    struct kvm_memslots *memslots;    // Guest physical memory map
    struct kvm_vcpu *vcpus[KVM_MAX_VCPUS]; // Virtual CPUs
    struct kvm_io_bus *buses[KVM_NR_BUSES]; // I/O buses (PIO, MMIO)
    struct kvm_arch arch;             // Architecture-specific (EPT, APIC, etc.)
    struct kvm_irq_routing_table *irq_routing; // IRQ routing
    struct kvm_stat stat;             // Statistics
    atomic_t online_vcpus;            // Online vCPU count
};
```

### `struct kvm_vcpu`
```c
struct kvm_vcpu {
    struct kvm *kvm;                  // Parent VM
    int vcpu_id;                      // vCPU ID
    int cpu;                          // Host CPU currently running on
    struct kvm_run *run;              // Shared run structure (userspace)
    struct kvm_vcpu_arch arch;        // Arch-specific (VMCS, regs, etc.)
    struct kvm_vcpu_stat stat;        // Statistics
    bool preempted;                   // vCPU preempted flag
    wait_queue_head_t wq;             // Wait queue
};
```

### `struct kvm_memory_slot`
```c
struct kvm_memory_slot {
    gfn_t base_gfn;                   // Guest frame number start
    unsigned long npages;             // Number of pages
    unsigned long *dirty_bitmap;      // Dirty page tracking
    struct kvm_userspace_memory_region userspace_addr; // HVA mapping
    int id;                           // Slot ID
    unsigned long flags;              // Flags (log dirty, readonly)
};
```

---

## 4️⃣ Call Path Examples

### Path 1: vCPU Execution Loop
```
QEMU userspace: ioctl(vcpu_fd, KVM_RUN, 0)
  → kvm_vcpu_ioctl() [virt/kvm/kvm_main.c]
    → kvm_arch_vcpu_ioctl_run() [arch/x86/kvm/x86.c]
      → vcpu_run() [arch/x86/kvm/x86.c]
        → vcpu_enter_guest()
          ├→ kvm_x86_ops.run() [vmx_vcpu_run() or svm_vcpu_run()]
          │   ├→ VMLAUNCH/VMRESUME (Intel) or VMRUN (AMD)
          │   │   [Guest executes in VMX non-root / SVM guest mode]
          │   └→ VM Exit (I/O, MMIO, HLT, CPUID, etc.)
          ├→ kvm_x86_ops.handle_exit()
          │   └→ vmx_handle_exit() or svm_handle_exit()
          │       ├→ handle_io() [I/O port access] → return to QEMU
          │       ├→ handle_ept_violation() [Page fault] → kvm_mmu_page_fault()
          │       ├→ handle_cpuid() [CPUID] → kvm_emulate_cpuid()
          │       └→ handle_hlt() [HLT] → kvm_vcpu_block()
          └→ Return to userspace if needed (KVM_EXIT_IO, KVM_EXIT_MMIO, etc.)
```

### Path 2: Guest Memory Access (EPT Violation)
```
Guest accesses unmapped GPA (guest physical address):
  → VM Exit (EPT violation) [arch/x86/kvm/vmx/vmx.c]
    → handle_ept_violation()
      → kvm_mmu_page_fault() [arch/x86/kvm/mmu/mmu.c]
        → kvm_tdp_page_fault() [Two-Dimensional Paging]
          ├→ kvm_mmu_get_page() [Allocate/find EPT page table]
          ├→ gfn_to_hva() [GPA → HVA translation via memslots]
          ├→ get_user_pages() [Fault in host page]
          └→ kvm_mmu_map_page() [Map GPA → HPA in EPT]
  → Resume guest (VMRESUME)
```

### Path 3: Virtual Interrupt Delivery
```
QEMU injects interrupt:
  → ioctl(vm_fd, KVM_IRQ_LINE, &irq) [virt/kvm/kvm_main.c]
    → kvm_vm_ioctl_irq_line()
      → kvm_set_irq() [virt/kvm/irqchip.c]
        → kvm_irq_delivery_to_apic()
          → kvm_apic_set_irq() [arch/x86/kvm/lapic.c]
            ├→ Set IRR (Interrupt Request Register)
            └→ kvm_make_request(KVM_REQ_EVENT, vcpu)
  → Next VM entry:
    → vcpu_enter_guest()
      → inject_pending_event()
        → vmx_inject_irq() [Set VMCS interrupt injection]
  → Guest receives interrupt
```

---

## 5️⃣ Hardware Virtualization

### Intel VT-x (VMX)
- **VMCS (Virtual Machine Control Structure)**: Hardware structure controlling VM execution
- **VM Entry**: VMLAUNCH (first time), VMRESUME (subsequent)
- **VM Exit**: Saves guest state, loads host state, exit reason in VMCS
- **EPT (Extended Page Tables)**: Hardware-assisted nested page tables (GPA → HPA)

### AMD-V (SVM)
- **VMCB (Virtual Machine Control Block)**: Similar to VMCS
- **VM Entry/Exit**: VMRUN, #VMEXIT
- **NPT (Nested Page Tables)**: AMD equivalent of EPT

### Common Exit Reasons
| Exit Reason | Cause | Handling |
|-------------|-------|----------|
| I/O Instruction | IN/OUT | Forward to QEMU for device emulation |
| MMIO Access | EPT/NPT violation (MMIO range) | Forward to QEMU |
| HLT | Guest idle | Block vCPU, schedule other tasks |
| CPUID | CPUID instruction | Emulate in KVM |
| Control Register | MOV to/from CR0/CR3/CR4 | Shadow CRs or emulate |
| MSR Access | RDMSR/WRMSR | Emulate or pass through |

---

## 6️⃣ Performance Optimizations

### Hardware Assist Features
- **EPT/NPT**: Eliminates shadow page table overhead (~2x performance for MMU-intensive workloads)
- **VPID/ASID**: Tagged TLB (avoid TLB flush on VM entry/exit)
- **Posted Interrupts**: Direct interrupt delivery to guest without VM exit
- **APIC Virtualization**: Local APIC accesses without VM exit

### Para-virtualization (Virtio)
- **Virtio-net**: High-performance network I/O
- **Virtio-blk/scsi**: High-performance disk I/O
- **Virtqueue**: Ring buffer shared between guest and host (minimal overhead)

### vCPU Scheduling
- **vCPU = kernel thread**: Scheduled by Linux scheduler
- **Pinning**: Can pin vCPU to host CPU for latency-sensitive workloads

---

## 7️⃣ Configuration & Tools

### QEMU/KVM
- **Create VM**: `qemu-system-x86_64 -enable-kvm -m 2048 -smp 2 -drive file=disk.img`
- **CPU Model**: `-cpu host` (pass through host CPU features)
- **Devices**: `-device virtio-net-pci`, `-device virtio-blk-pci`

### KVM Kernel Module
- **Module**: `kvm.ko`, `kvm-intel.ko` / `kvm-amd.ko`
- **Check**: `lsmod | grep kvm`, `/dev/kvm` exists

### Nested Virtualization
- **Enable**: `modprobe kvm-intel nested=1` (run VMs inside VMs)

---

## 8️⃣ Debugging

### Tracepoints
- `kvm:kvm_entry`, `kvm:kvm_exit` - VM entry/exit
- `kvm:kvm_page_fault` - Guest page faults
- `kvm:kvm_apic_*` - APIC events

### Statistics
- `/sys/kernel/debug/kvm/` - KVM debugfs
- `/proc/modules` - Check kvm module loaded

---

**End of Virtualization Subsystem Documentation**
