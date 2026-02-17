# Linux Device Model Subsystem
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
The device model provides a unified framework for representing hardware devices, buses, drivers, and their relationships in the Linux kernel. It abstracts hardware topology, enables automatic driver loading (udev), provides sysfs filesystem for userspace device access, implements driver binding to devices, manages device lifecycles, and supports power management, hotplug, and device discovery. It's the foundation for all hardware interaction in Linux.

### System Architecture
```
┌─────────────────────────────────────────┐
│   User Space (udev, hotplug, sysfs)     │
│   /sys/devices/, /sys/bus/, /sys/class/ │
└─────────────────┬───────────────────────┘
                  │ Sysfs, uevents
┌─────────────────▼───────────────────────┐
│     DEVICE MODEL                         │
│  - struct device (all devices)           │
│  - struct bus_type (PCI, USB, I2C, etc.) │
│  - struct device_driver (drivers)        │
│  - struct class (device classes)         │
│  - kobject/kset (sysfs hierarchy)        │
│  - Driver core (binding, probe)          │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│  Bus          │   │  Devices         │
│  Subsystems   │   │  (PCI, USB, etc.)│
│  (PCI, USB)   │   │                  │
└───────────────┘   └──────────────────┘
```

---

## 2️⃣ Core Components

### Driver Core (`drivers/base/`)
- **core.c**: Device registration, driver binding
- **bus.c**: Bus type registration, device-driver matching
- **dd.c**: Device-driver binding, probe/remove
- **class.c**: Device classes (input, net, block, etc.)
- **platform.c**: Platform devices (non-discoverable devices)

### sysfs (`fs/sysfs/`)
- **Purpose**: Filesystem view of kernel objects (devices, drivers, buses)
- **Structure**: `/sys/devices/`, `/sys/bus/`, `/sys/class/`

### Kobject (`lib/kobject.c`)
- **Purpose**: Base object for kernel reference counting and sysfs representation
- **Features**: Reference counting (kref), hotplug event generation (uevents)

---

## 3️⃣ Key Data Structures

### `struct device`
```c
struct device {
    struct device *parent;            // Parent device
    struct device_private *p;         // Private data
    struct kobject kobj;              // Sysfs representation
    const char *init_name;            // Device name
    const struct device_type *type;   // Device type
    struct bus_type *bus;             // Bus this device is on
    struct device_driver *driver;     // Driver bound to this device
    void *platform_data;              // Platform-specific data
    void *driver_data;                // Driver private data
    struct dev_pm_info power;         // Power management info
    struct dev_links_info links;      // Device links (dependencies)
    struct device_node *of_node;      // Device tree node
    struct fwnode_handle *fwnode;     // Firmware node handle
    u64 *dma_mask;                    // DMA addressing capability
    struct device_dma_parameters *dma_parms;
    struct list_head dma_pools;       // DMA memory pools
    int numa_node;                    // NUMA node
    const struct attribute_group **groups; // Sysfs attribute groups
};
```

### `struct device_driver`
```c
struct device_driver {
    const char *name;                 // Driver name
    struct bus_type *bus;             // Bus this driver works with
    struct module *owner;             // Module owning this driver
    const struct of_device_id *of_match_table; // Device tree match
    const struct acpi_device_id *acpi_match_table; // ACPI match
    int (*probe)(struct device *dev); // Probe function
    int (*remove)(struct device *dev); // Remove function
    void (*shutdown)(struct device *dev);
    int (*suspend)(struct device *dev, pm_message_t state);
    int (*resume)(struct device *dev);
    const struct attribute_group **groups; // Sysfs attributes
    const struct dev_pm_ops *pm;      // Power management ops
};
```

### `struct bus_type`
```c
struct bus_type {
    const char *name;                 // Bus name ("pci", "usb", etc.)
    const char *dev_name;             // Device name prefix
    struct device *dev_root;          // Root device
    const struct attribute_group **bus_groups; // Bus attributes
    const struct attribute_group **dev_groups; // Device attributes
    const struct attribute_group **drv_groups; // Driver attributes
    
    int (*match)(struct device *dev, struct device_driver *drv); // Match device to driver
    int (*probe)(struct device *dev); // Probe device
    int (*remove)(struct device *dev); // Remove device
    void (*shutdown)(struct device *dev);
    const struct dev_pm_ops *pm;      // Bus-level PM ops
};
```

### `struct kobject`
```c
struct kobject {
    const char *name;                 // Name
    struct list_head entry;           // List entry
    struct kobject *parent;           // Parent kobject
    struct kset *kset;                // Container set
    struct kobj_type *ktype;          // Object type
    struct kernfs_node *sd;           // Sysfs directory entry
    struct kref kref;                 // Reference count
    unsigned int state_initialized:1;
    unsigned int state_in_sysfs:1;
    unsigned int state_add_uevent_sent:1;
    unsigned int state_remove_uevent_sent:1;
    unsigned int uevent_suppress:1;
};
```

---

## 4️⃣ Call Path Examples

### Path 1: Device Registration & Driver Binding (PCI Example)
```
PCI Bus Enumeration:
  → pci_scan_bus() [drivers/pci/probe.c]
    → pci_scan_child_bus()
      → pci_scan_slot()
        → pci_scan_single_device()
          → pci_scan_device() (read PCI config space)
            → pci_device_add()
              → device_add() [drivers/base/core.c:3424]
                ├→ kobject_add() (add to sysfs)
                ├→ bus_add_device() (add to bus)
                └→ bus_probe_device()
                    → device_initial_probe()
                      → __device_attach() [drivers/base/dd.c:940]
                        → bus_for_each_drv()
                          → __device_attach_driver()
                            ├→ driver_match_device() [Match device to driver]
                            │   → bus->match() (e.g., pci_bus_match())
                            │       → pci_match_device() (compare vendor/device ID)
                            └→ driver_probe_device() [If matched]
                                → really_probe() [drivers/base/dd.c:546]
                                  ├→ dev->bus->probe() or drv->probe()
                                  │   → pci_device_probe()
                                  │       → __pci_device_probe()
                                  │           → drv->probe(dev) [Driver's probe function]
                                  │               [Driver initializes device]
                                  └→ driver_bound() (link driver ↔ device)
```

### Path 2: Module Loading & Driver Registration
```
User: insmod driver.ko
  → Kernel loads module
    → module_init() [driver's init function]
      → pci_register_driver() [include/linux/pci.h]
        → __pci_register_driver() [drivers/pci/pci-driver.c]
          → driver_register() [drivers/base/driver.c]
            ├→ bus_add_driver()
            │   ├→ kobject_add() (add to sysfs: /sys/bus/pci/drivers/drivername/)
            │   └→ driver_attach() [Try to bind to existing devices]
            │       → bus_for_each_dev()
            │           → __driver_attach()
            │               └→ driver_probe_device() (if match)
            └→ Return
  → Driver now registered, will auto-bind to matching devices
```

### Path 3: Hotplug Event (USB Device Plugged In)
```
USB Device Inserted:
  → Hardware interrupt
    → USB Host Controller IRQ handler
      → usb_hcd_irq()
        → Hub detects new device
          → usb_new_device() [drivers/usb/core/hub.c]
            ├→ usb_get_configuration() (read descriptors)
            ├→ device_add() [Register with device model]
            │   ├→ kobject_add() (create sysfs entry)
            │   ├→ kobject_uevent(KOBJ_ADD) [Send uevent to userspace]
            │   │   → Uevent sent to udev: ACTION=add, SUBSYSTEM=usb, ...
            │   └→ bus_probe_device() (find matching driver)
            │       → __device_attach()
            │           → usb_device_match() (match driver)
            │           → driver_probe_device()
            │               → usb_probe_device() or usb_probe_interface()
            │                   → drv->probe()
            └→ Device operational

Userspace (udev):
  → Receives uevent
    → Runs rules (/lib/udev/rules.d/)
      → May create /dev nodes, load firmware, set permissions, etc.
```

### Path 4: sysfs Attribute Read
```
User: cat /sys/bus/pci/devices/0000:00:1f.2/vendor
  → VFS: vfs_read()
    → kernfs_fop_read() [fs/kernfs/file.c]
      → kernfs_seq_show()
        → kobj_attr_show() [lib/kobject.c]
          → attr->show(kobj, attr, buf)
            → pci_dev_vendor_show() [drivers/pci/pci-sysfs.c]
              ├→ struct pci_dev *pdev = to_pci_dev(dev)
              ├→ sprintf(buf, "0x%04x\n", pdev->vendor)
              └→ Return
  → User sees: 0x8086 (Intel vendor ID)
```

---

## 5️⃣ Device Discovery Mechanisms

### Bus Enumeration
- **PCI**: Config space enumeration (scan bus/device/function)
- **USB**: Hub detects device insertion via electrical signal
- **I2C**: Software-initiated probe at specified addresses
- **Platform**: Static registration (non-discoverable devices)

### Device Tree (ARM, RISC-V)
- **DTS (Device Tree Source)**: Hardware description
- **DTB (Device Tree Blob)**: Compiled binary passed to kernel
- **Matching**: `of_match_table` in driver matches `compatible` property

### ACPI (x86)
- **ACPI Tables**: Describe hardware (DSDT, SSDT)
- **_HID, _CID**: Hardware/Compatible IDs for matching
- **Matching**: `acpi_match_table` in driver

---

## 6️⃣ sysfs Hierarchy

```
/sys/
├── devices/                 # All devices (canonical representation)
│   ├── pci0000:00/          # PCI root bus
│   │   ├── 0000:00:00.0/    # PCI device
│   │   └── 0000:00:1f.2/    # Another PCI device (SATA controller)
│   │       ├── vendor       # Attribute (0x8086)
│   │       ├── device       # Attribute (0x2829)
│   │       ├── ata1/        # Child device (SATA port)
│   │       └── driver -> ../../bus/pci/drivers/ahci # Symlink to driver
│   ├── platform/            # Platform devices
│   └── virtual/             # Virtual devices
├── bus/                     # Bus types
│   ├── pci/
│   │   ├── devices/         # Symlinks to devices on this bus
│   │   │   └── 0000:00:1f.2 -> ../../../devices/pci0000:00/0000:00:1f.2/
│   │   └── drivers/         # Drivers for this bus
│   │       ├── ahci/
│   │       └── e1000e/
│   ├── usb/
│   └── i2c/
├── class/                   # Device classes
│   ├── net/                 # Network devices
│   │   ├── eth0 -> ../../devices/.../net/eth0
│   │   └── wlan0 -> ../../devices/.../net/wlan0
│   ├── block/               # Block devices
│   ├── input/               # Input devices
│   └── drm/                 # DRM/Graphics
└── firmware/                # Firmware interfaces
```

---

## 7️⃣ Uevents (Hotplug)

### Uevent Format
```
ACTION=add
DEVPATH=/devices/pci0000:00/0000:00:1f.2
SUBSYSTEM=pci
MODALIAS=pci:v00008086d00002829sv0000103Csd000030F1bc01sc06i01
SEQNUM=1234
```

### Uevent Triggers
- Device add/remove (hotplug)
- Driver bind/unbind
- State changes (online/offline)

### Userspace Handling (udev)
- **Rules**: `/lib/udev/rules.d/`, `/etc/udev/rules.d/`
- **Actions**: Create /dev nodes, load firmware, set permissions, run scripts

---

## 8️⃣ Configuration & Tools

### Sysfs Exploration
- `ls -la /sys/devices/` - All devices
- `ls -la /sys/bus/pci/devices/` - PCI devices
- `cat /sys/class/net/eth0/address` - Read attribute

### Tools
- **lspci**: List PCI devices
- **lsusb**: List USB devices
- **udevadm**: Manage udev
  - `udevadm info /dev/sda` - Device info
  - `udevadm monitor` - Monitor uevents
  - `udevadm trigger` - Trigger uevents
- **ls /sys/**: Explore device model

### Debugging
- **dmesg**: Kernel messages (device probe, errors)
- `/sys/kernel/debug/devices_deferred`: Deferred probe list

---

**End of Device Model Subsystem Documentation**
