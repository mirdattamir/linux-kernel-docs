# Linux Power Management Subsystem
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
The power management subsystem enables Linux to minimize energy consumption while maintaining performance and responsiveness. It dynamically adjusts CPU frequency/voltage (cpufreq), puts CPUs into low-power idle states (cpuidle), suspends/resumes the entire system (suspend-to-RAM, hibernate), manages device power states, and implements runtime power management for devices. Critical for battery life on laptops/mobile devices and energy efficiency in data centers.

### System Architecture
```
┌─────────────────────────────────────────┐
│   User Space (powertop, cpupower, etc.) │
│   /sys/power/, /sys/devices/.../power/  │
└─────────────────┬───────────────────────┘
                  │ Sysfs, PM syscalls
┌─────────────────▼───────────────────────┐
│     POWER MANAGEMENT SUBSYSTEM           │
│  - CPU Frequency Scaling (cpufreq)       │
│  - CPU Idle Management (cpuidle)         │
│  - System Suspend/Resume                 │
│  - Runtime PM (device-level)             │
│  - Wakeup Events (RTC, USB, network)     │
│  - PM QoS (Quality of Service)           │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│  Hardware     │   │  Firmware        │
│  P-states     │   │  ACPI (S-states, │
│  C-states     │   │  _PSx methods)   │
│  DVFS         │   │  Devicetree      │
└───────────────┘   └──────────────────┘
```

---

## 2️⃣ Core Components

### cpufreq (CPU Frequency Scaling) (`kernel/sched/cpufreq*.c`, `drivers/cpufreq/`)
- **Purpose**: Dynamically adjust CPU frequency/voltage based on load
- **Governors**:
  - `performance`: Max frequency always
  - `powersave`: Min frequency always
  - `ondemand`: Scale up quickly on load, scale down slowly
  - `conservative`: Scale gradually
  - `schedutil`: Integrated with scheduler (uses utilization)
- **Drivers**: `acpi-cpufreq`, `intel_pstate`, `amd-pstate`

### cpuidle (CPU Idle States) (`drivers/cpuidle/`)
- **Purpose**: Put idle CPUs into low-power C-states
- **C-states**:
  - C0: Active
  - C1: Halt (low latency, low power saving)
  - C2-C3: Deeper sleep (higher latency, higher power saving)
  - C6+: Package-level sleep (very deep)
- **Governors**: `menu` (default), `ladder`, `teo` (timer events oriented)
- **Drivers**: `intel_idle`, `acpi_idle`

### System Suspend/Resume (`kernel/power/`)
- **suspend.c**: Core suspend logic
- **hibernate.c**: Hibernation (suspend-to-disk)
- **snapshot.c**: Memory snapshot for hibernation
- **S-states** (ACPI):
  - S0: Running
  - S1/S2: Standby (rarely used)
  - S3: Suspend-to-RAM (mem)
  - S4: Hibernate (disk)
  - S5: Soft off

### Runtime PM (`drivers/base/power/runtime.c`)
- **Purpose**: Device-level power management (suspend idle devices)
- **States**: Active, Suspended, Suspending, Resuming
- **Autosuspend**: Automatically suspend after idle period

---

## 3️⃣ Key Data Structures

### `struct cpufreq_policy`
```c
struct cpufreq_policy {
    unsigned int cpu;                 // CPU this policy applies to
    struct cpumask cpus;              // CPUs governed by this policy
    unsigned int min, max;            // Min/max frequency (kHz)
    unsigned int cur;                 // Current frequency
    struct cpufreq_governor *governor; // Active governor
    struct cpufreq_frequency_table *freq_table; // Available frequencies
    void *governor_data;
};
```

### `struct cpuidle_state`
```c
struct cpuidle_state {
    char name[CPUIDLE_NAME_LEN];      // State name ("C1", "C6", etc.)
    unsigned int exit_latency;        // Wakeup latency (μs)
    unsigned int target_residency;    // Min useful residency time
    unsigned int power_usage;         // Power consumption
    int (*enter)(struct cpuidle_device *dev, ...); // Enter state
};
```

### `struct dev_pm_info`
```c
struct dev_pm_info {
    pm_message_t power_state;         // Current power state
    atomic_t usage_count;             // Runtime PM usage count
    unsigned int runtime_auto:1;      // Autosuspend enabled
    unsigned int runtime_suspended:1; // Currently suspended
    unsigned long accounting_timestamp; // For statistics
    struct timer_list suspend_timer;  // Autosuspend timer
};
```

---

## 4️⃣ Call Path Examples

### Path 1: CPU Frequency Scaling (Load Increase)
```
High CPU load detected:
  → schedutil_update_freq() [kernel/sched/cpufreq_schedutil.c]
    ├→ sugov_get_util() (get CPU utilization from scheduler)
    ├→ map_util_freq() (util → target frequency)
    └→ sugov_update_commit()
        → cpufreq_driver_target() [drivers/cpufreq/cpufreq.c]
          → policy->governor->target() 
            → acpi_cpufreq_target() or intel_pstate_set_policy()
              ├→ WRMSR(IA32_PERF_CTL, new_pstate) [Intel P-state MSR]
              └→ CPU frequency changed
```

### Path 2: Enter CPU Idle State
```
Scheduler finds no runnable tasks:
  → do_idle() [kernel/sched/idle.c]
    → cpuidle_idle_call() [drivers/cpuidle/cpuidle.c]
      → cpuidle_select() (governor selects C-state)
        → menu_select() [drivers/cpuidle/governors/menu.c]
          ├→ Predict idle duration (based on timer events)
          └→ Select deepest C-state with exit_latency < predicted duration
      → cpuidle_enter()
        → cpuidle_enter_state()
          → state->enter() (e.g., intel_idle_enter())
            → mwait(C-state) or HLT
              [CPU in low-power state until interrupt]
          → Wakeup on interrupt
          ← Return residency time
        → Update statistics
```

### Path 3: System Suspend (Suspend-to-RAM)
```
User: echo mem > /sys/power/state
  → state_store() [kernel/power/main.c]
    → pm_suspend(PM_SUSPEND_MEM) [kernel/power/suspend.c]
      → enter_state()
        ├→ suspend_prepare()
        │   ├→ pm_notifier_call_chain(PM_SUSPEND_PREPARE)
        │   └→ suspend_freeze_processes() (freeze userspace, kernel threads)
        ├→ suspend_devices_and_enter()
        │   ├→ dpm_suspend_start() [drivers/base/power/main.c]
        │   │   └→ For each device: dev->pm->suspend()
        │   ├→ suspend_enter()
        │   │   ├→ syscore_suspend() (IRQ controllers, timers, etc.)
        │   │   ├→ Disable non-boot CPUs
        │   │   ├→ acpi_suspend() (enter S3)
        │   │   │   → ACPI _PTS, _GTS methods
        │   │   │   → Write to ACPI registers (SLP_TYP, SLP_EN)
        │   │   │   [System enters S3 - suspend-to-RAM]
        │   │   [Resume: Wakeup event occurs - power button, RTC, etc.]
        │   │   ├→ acpi_resume() (ACPI _WAK, _BFS)
        │   │   ├→ Enable CPUs
        │   │   └→ syscore_resume()
        │   └→ dpm_resume_end()
        │       └→ For each device: dev->pm->resume()
        ├→ suspend_thaw_processes() (unfreeze)
        └→ pm_notifier_call_chain(PM_POST_SUSPEND)
  → System running normally
```

### Path 4: Runtime PM (Device Autosuspend)
```
Device idle for autosuspend_delay_ms:
  → pm_runtime_autosuspend_expiration() [drivers/base/power/runtime.c]
    → pm_suspend_timer_fn() (timer expires)
      → pm_runtime_suspend()
        → __pm_runtime_suspend()
          ├→ rpm_suspend() [drivers/base/power/runtime.c:563]
          │   ├→ Check if allowed (usage_count == 0, no children active)
          │   ├→ callback = dev->pm->runtime_suspend
          │   ├→ callback(dev) (driver-specific suspend)
          │   └→ dev->power.runtime_status = RPM_SUSPENDED
          └→ pm_runtime_put(parent) (recursively suspend parent if possible)
  → Device powered down

Resume on access:
  → pm_runtime_get_sync(dev)
    → __pm_runtime_resume()
      → rpm_resume()
        ├→ pm_runtime_get(parent) (ensure parent active)
        ├→ callback = dev->pm->runtime_resume
        ├→ callback(dev) (driver-specific resume)
        └→ dev->power.runtime_status = RPM_ACTIVE
  → Device powered up
```

---

## 5️⃣ Hardware/Firmware Interaction

### ACPI (Advanced Configuration and Power Interface)
- **S-states**: System-wide sleep states (S0-S5)
- **P-states**: CPU performance states (frequency/voltage)
- **C-states**: CPU idle/sleep states
- **D-states**: Device power states (D0-D3)
- **Methods**: _PSx (set power state), _PRx (power resources), _WAK (wake)

### CPU Power States
- **P-states (Performance)**: DVFS (Dynamic Voltage/Frequency Scaling)
  - Intel: MSR IA32_PERF_CTL
  - AMD: MSR MSRC001_0063
- **C-states (Idle)**: 
  - Implemented via MWAIT instruction (monitor/wait) or HLT
  - Deeper states power down caches, memory controller, etc.

### Wakeup Sources
- **RTC (Real-Time Clock)**: Wake at specific time
- **Power Button**: ACPI event
- **USB Device Activity**: USB resume signal
- **Network (Wake-on-LAN)**: Magic packet
- **GPIO**: External signal

---

## 6️⃣ Performance vs Power Trade-offs

### cpufreq Governors
| Governor | Performance | Power | Use Case |
|----------|-------------|-------|----------|
| performance | Max | High | Servers, gaming |
| powersave | Low | Min | Battery critical |
| ondemand | Good | Good | Laptops (legacy) |
| schedutil | Best | Best | Modern default |

### cpuidle C-states
| State | Exit Latency | Power Saving | Trade-off |
|-------|--------------|--------------|-----------|
| C1 | ~1 μs | Low | Low latency, minimal saving |
| C3 | ~10-100 μs | Medium | Balance |
| C6 | ~100-1000 μs | High | High latency, max saving |

---

## 7️⃣ Configuration & Tools

### Sysfs Interfaces
- **cpufreq**: `/sys/devices/system/cpu/cpu*/cpufreq/`
  - `scaling_governor`: Current governor
  - `scaling_cur_freq`: Current frequency
  - `scaling_available_frequencies`: Available frequencies
- **cpuidle**: `/sys/devices/system/cpu/cpu*/cpuidle/`
  - `state*/name`, `latency`, `residency`
  - `state*/disable`: Disable specific C-state
- **System suspend**: `/sys/power/state` (mem, disk, freeze)
- **Runtime PM**: `/sys/devices/.../power/`
  - `control`: on (enabled), auto (autosuspend)
  - `autosuspend_delay_ms`: Delay before autosuspend

### Tools
- **powertop**: Monitor power consumption, identify power hogs
- **cpupower**: Manage CPU frequency/idle
  - `cpupower frequency-info`: Show current settings
  - `cpupower frequency-set -g performance`: Set governor
- **pm-suspend**, **pm-hibernate**: Suspend/hibernate system
- **rtcwake**: Wake system from RTC alarm

### Kernel Config
- `CONFIG_CPU_FREQ`: CPU frequency scaling
- `CONFIG_CPU_IDLE`: CPU idle management
- `CONFIG_PM`: Power management
- `CONFIG_PM_RUNTIME`: Runtime device PM
- `CONFIG_HIBERNATION`: Hibernation support

---

**End of Power Management Subsystem Documentation**
