# Linux Security Subsystem
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
The security subsystem provides mandatory access control (MAC), discretionary access control (DAC), capabilities, and security auditing for the Linux kernel. It implements a flexible framework (LSM - Linux Security Modules) allowing different security models (SELinux, AppArmor, Smack, etc.) to coexist. Protects against unauthorized access to system resources, implements principle of least privilege, provides fine-grained access control beyond traditional Unix permissions, and enables security policy enforcement at the kernel level.

### System Architecture
```
┌─────────────────────────────────────────┐
│   User Space (Applications, Services)    │
│   SELinux policy, AppArmor profiles      │
└─────────────────┬───────────────────────┘
                  │ System calls
┌─────────────────▼───────────────────────┐
│     SECURITY SUBSYSTEM                   │
│  - LSM (Linux Security Modules) Hooks    │
│  - SELinux (Type Enforcement, MLS)       │
│  - AppArmor (Path-based MAC)             │
│  - Capabilities (Fine-grained privileges)│
│  - Seccomp (Syscall filtering)           │
│  - Audit (Security event logging)        │
│  - Keys (Cryptographic key management)   │
└─────────────────┬───────────────────────┘
                  │ LSM hooks
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│  VFS, Network │   │  Process, Memory │
│  IPC, etc.    │   │  Management      │
└───────────────┘   └──────────────────┘
```

---

## 2️⃣ Core Components

### LSM Framework (`security/`)
- **Purpose**: Pluggable security framework - hooks throughout kernel
- **Key Files**:
  - `security/security.c` - LSM hook dispatch
  - `include/linux/lsm_hooks.h` - Hook definitions
  - `include/linux/security.h` - Security API

### SELinux (`security/selinux/`)
- **Purpose**: Type enforcement + Role-based AC + Multi-level security
- **Key Files**:
  - `security/selinux/hooks.c` - LSM hook implementations
  - `security/selinux/ss/services.c` - Security server (policy decisions)
  - `security/selinux/avc.c` - Access vector cache

### AppArmor (`security/apparmor/`)
- **Purpose**: Path-based mandatory access control
- **Key Files**:
  - `security/apparmor/lsm.c` - LSM hooks
  - `security/apparmor/policy.c` - Profile management

### Capabilities (`kernel/capability.c`)
- **Purpose**: Fine-grained root privileges (CAP_NET_ADMIN, CAP_SYS_ADMIN, etc.)

### Seccomp (`kernel/seccomp.c`)
- **Purpose**: Syscall filtering (whitelist allowed syscalls)

---

## 3️⃣ Key Data Structures

### `struct cred` (Credentials)
```c
struct cred {
    atomic_t usage;
    kuid_t uid, euid, suid, fsuid;    // User IDs
    kgid_t gid, egid, sgid, fsgid;    // Group IDs
    kernel_cap_t cap_inheritable;     // Capabilities
    kernel_cap_t cap_permitted;
    kernel_cap_t cap_effective;
    kernel_cap_t cap_bset;            // Bounding set
    kernel_cap_t cap_ambient;
    void *security;                   // LSM security blob
};
```

### SELinux Security Context
```c
struct task_security_struct {
    u32 osid;            // Objective SID
    u32 sid;             // Current SID (security identifier)
    u32 exec_sid;        // SID for exec
    u32 create_sid;      // SID for file creation
    u32 keycreate_sid;   // SID for key creation
    u32 sockcreate_sid;  // SID for socket creation
};
```

---

## 4️⃣ Call Path Examples

### Path 1: File Open (SELinux Check)
```
sys_open() [fs/open.c]
  → do_sys_open()
    → do_filp_open()
      → path_openat()
        → do_last()
          → may_open()
            → inode_permission()
              → security_inode_permission() [security/security.c]
                → call_int_hook(inode_permission) [LSM dispatch]
                  → selinux_inode_permission() [security/selinux/hooks.c]
                    → inode_has_perm()
                      → avc_has_perm() [Check access vector cache]
                        → avc_has_perm_noaudit()
                          → avc_lookup() [Cache hit: fast]
                          → security_compute_av() [Cache miss: policy query]
```

### Path 2: Capability Check
```
Kernel operation requiring privilege (e.g., bind to port < 1024):
  → ns_capable(net->user_ns, CAP_NET_BIND_SERVICE) [kernel/capability.c]
    → security_capable() [security/security.c]
      → cap_capable() [Check current->cred->cap_effective]
      → selinux_capable() [Additional SELinux check]
```

### Path 3: Seccomp Filter
```
Syscall entry (e.g., execve):
  → syscall_trace_enter() [arch/x86/entry/common.c]
    → __secure_computing() [kernel/seccomp.c]
      → __seccomp_filter()
        → bpf_prog_run_pin_on_cpu() [Run BPF filter]
          → Return SECCOMP_RET_ALLOW / KILL / ERRNO / TRACE
```

---

## 5️⃣ Concurrency & Performance

### LSM Hooks
- **Invocation**: Inline function calls throughout kernel (security_* functions)
- **Performance**: Negligible overhead when no LSM loaded; minimal with caching (AVC)
- **Locking**: RCU for policy lookups, spinlocks for cache updates

### SELinux AVC (Access Vector Cache)
- **Purpose**: Cache access decisions to avoid repeated policy queries
- **Structure**: Hash table keyed by (subject SID, target SID, class, permission)
- **Performance**: ~99% hit rate in typical workloads

---

## 6️⃣ Configuration

### SELinux
- **Policy**: `/etc/selinux/targeted/policy/policy.XX`
- **Modes**: Enforcing, Permissive, Disabled
- **Context**: `user:role:type:level`
- **Tools**: `sestatus`, `setenforce`, `getenforce`, `chcon`, `restorecon`

### AppArmor
- **Profiles**: `/etc/apparmor.d/`
- **Modes**: Enforce, Complain, Disabled
- **Tools**: `aa-status`, `aa-enforce`, `aa-complain`

### Capabilities
- **Bounding Set**: `/proc/sys/kernel/cap_last_cap`
- **Per-Process**: `/proc/<pid>/status` (CapEff, CapPrm, CapInh)
- **Tools**: `getcap`, `setcap`, `capsh`

### Seccomp
- **Modes**: Strict (only read/write/exit/_exit), Filter (BPF)
- **Filter**: BPF program loaded via `prctl(PR_SET_SECCOMP, SECCOMP_MODE_FILTER, &prog)`

---

## 7️⃣ Common Security Checks

| Operation | DAC Check | Capability | LSM Hook |
|-----------|-----------|------------|----------|
| Open file | File mode bits (rwx) | - | `inode_permission` |
| Bind port < 1024 | - | `CAP_NET_BIND_SERVICE` | `socket_bind` |
| Mount filesystem | - | `CAP_SYS_ADMIN` | `sb_mount` |
| Kill process | EUID == target UID | `CAP_KILL` | `task_kill` |
| Load kernel module | - | `CAP_SYS_MODULE` | `kernel_module_request` |
| Change sysctls | - | `CAP_SYS_ADMIN` | `syslog` |

---

## 8️⃣ Error Codes

| Error | Meaning |
|-------|---------|
| `-EACCES` | Permission denied (DAC) |
| `-EPERM` | Operation not permitted (Capabilities, MAC) |
| `-EINVAL` | Invalid security context |
| `-ENOENT` | Security policy not found |

---

**End of Security Subsystem Documentation**
