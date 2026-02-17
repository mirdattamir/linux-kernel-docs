# Linux Networking Stack Subsystem
## Full Architecture Documentation

---

## 1️⃣ High-Level Purpose

### What Problem It Solves
The Linux networking stack provides a complete, high-performance implementation of network protocols (TCP/IP, UDP, IPv6, etc.), enabling processes to communicate across machines and networks. It handles packet reception from network devices, protocol processing through the OSI layers, socket abstractions for applications, routing decisions, traffic control/QoS, firewalling (netfilter), and packet transmission. The stack balances performance (zero-copy, batching, hardware offload), scalability (RPS/RFS, lockless data structures), and flexibility (extensible via eBPF, custom protocols).

### Position in System Architecture
```
┌─────────────────────────────────────────┐
│   User Space Applications                │
│   socket(), send(), recv(), connect()    │
└─────────────────┬───────────────────────┘
                  │ Socket layer (BSD sockets)
┌─────────────────▼───────────────────────┐
│     NETWORKING STACK                     │
│  - Transport Layer (TCP, UDP, SCTP)      │
│  - Network Layer (IPv4, IPv6, routing)   │
│  - Data Link Layer (Ethernet, ARP)       │
│  - Socket buffers (sk_buff)              │
│  - Netfilter (firewall, NAT, conntrack)  │
│  - Traffic Control (QoS, shaping)        │
└─────────────────┬───────────────────────┘
                  │ Device drivers (NAPI)
        ┌─────────┴─────────┐
        ▼                   ▼
┌───────────────┐   ┌──────────────────┐
│  Network      │   │  Network         │
│  Devices      │   │  Namespaces      │
│  (NIC, WiFi)  │   │  (containers)    │
└───────────────┘   └──────────────────┘
```

### Interaction with Other Subsystems
- **Scheduler**: Network softirqs scheduled for packet processing
- **Memory Management**: sk_buff allocation, page pooling, zero-copy (sendfile, splice)
- **VFS**: Socket files, /proc/net statistics
- **Device Drivers**: NIC drivers provide NAPI poll interface
- **Crypto**: IPsec, TLS offload
- **Security**: SELinux hooks, seccomp filters on sockets

---

## 2️⃣ Directory Mapping

```
net/
├── socket.c               # Socket system calls (socket, bind, listen, accept)
├── core/
│   ├── dev.c              # Network device handling, receive path, NAPI
│   ├── skbuff.c           # Socket buffer allocation and manipulation
│   ├── sock.c             # Socket core functions
│   ├── neighbour.c        # Neighbor (ARP) cache
│   ├── rtnetlink.c        # Netlink for route configuration
│   ├── filter.c           # BPF (Berkeley Packet Filter)
│   └── flow.c             # Flow cache for routing
├── ipv4/
│   ├── tcp.c              # TCP protocol implementation
│   ├── tcp_input.c        # TCP input processing (receive)
│   ├── tcp_output.c       # TCP output processing (send)
│   ├── tcp_ipv4.c         # TCP over IPv4
│   ├── udp.c              # UDP protocol implementation
│   ├── ip_input.c         # IPv4 input processing
│   ├── ip_output.c        # IPv4 output processing
│   ├── route.c            # IPv4 routing
│   ├── fib_frontend.c     # Forwarding Information Base (FIB)
│   ├── arp.c              # Address Resolution Protocol
│   └── icmp.c             # ICMP (ping, errors)
├── ipv6/
│   ├── tcp_ipv6.c         # TCP over IPv6
│   ├── udp.c              # UDP over IPv6
│   ├── ip6_input.c        # IPv6 input
│   ├── ip6_output.c       # IPv6 output
│   ├── route.c            # IPv6 routing
│   └── icmp.c             # ICMPv6
├── ethernet/
│   └── eth.c              # Ethernet protocol handling
├── packet/
│   └── af_packet.c        # Raw packet sockets (PF_PACKET)
├── unix/
│   └── af_unix.c          # Unix domain sockets
├── netlink/
│   └── af_netlink.c       # Netlink sockets (kernel-user communication)
├── netfilter/
│   ├── core.c             # Netfilter core (hooks)
│   ├── nf_conntrack_core.c # Connection tracking
│   ├── xt_*.c             # Xtables matches/targets
│   └── ipvs/              # IP Virtual Server (load balancing)
├── sched/
│   ├── sch_generic.c      # Traffic control (qdisc) core
│   ├── sch_fq.c           # Fair queuing
│   └── cls_bpf.c          # BPF classifier
└── xfrm/
    └── xfrm_policy.c      # IPsec (transforms)

drivers/net/
├── ethernet/              # Ethernet drivers (Intel, Broadcom, Realtek, etc.)
└── wireless/              # WiFi drivers
```

---

## 3️⃣ Core Source Files

| File | Purpose | Key Functions |
|------|---------|---------------|
| net/core/dev.c | Network device management, packet receive path | netif_receive_skb(), dev_queue_xmit(), napi_schedule() |
| net/core/skbuff.c | Socket buffer (sk_buff) allocation and manipulation | alloc_skb(), skb_clone(), skb_copy(), kfree_skb() |
| net/socket.c | Socket system call implementations | sys_socket(), sys_bind(), sys_sendto(), sys_recvfrom() |
| net/ipv4/tcp.c | TCP protocol core | tcp_sendmsg(), tcp_recvmsg(), tcp_connect() |
| net/ipv4/tcp_input.c | TCP receive processing (ACK handling, congestion control) | tcp_rcv_established(), tcp_ack(), tcp_data_queue() |
| net/ipv4/tcp_output.c | TCP transmit processing (segmentation, retransmit) | tcp_write_xmit(), tcp_send_ack(), tcp_retransmit_skb() |
| net/ipv4/ip_input.c | IPv4 packet input processing | ip_rcv(), ip_local_deliver() |
| net/ipv4/ip_output.c | IPv4 packet output processing | ip_queue_xmit(), ip_build_and_send_pkt() |
| net/ipv4/route.c | IPv4 routing table lookups | ip_route_input(), ip_route_output_key() |
| net/ipv4/udp.c | UDP protocol implementation | udp_sendmsg(), udp_recvmsg(), udp_queue_rcv_skb() |

---

## 4️⃣ Core Data Structures

### Structure 1: `struct sk_buff`

**Purpose**: Socket buffer - fundamental data structure for network packets

**Definition** (`include/linux/skbuff.h`):
```c
struct sk_buff {
    struct sk_buff        *next;          // Next skb in list
    struct sk_buff        *prev;          // Previous skb in list
    struct sock           *sk;            // Owning socket
    ktime_t               tstamp;         // Timestamp

    struct net_device     *dev;           // Receiving/transmitting device
    unsigned int          len;            // Packet length
    unsigned int          data_len;       // Non-linear data length
    __u16                 mac_len;        // MAC header length
    __u16                 hdr_len;        // Writable header length

    unsigned char         *head;          // Buffer start
    unsigned char         *data;          // Data pointer (current layer)
    unsigned char         *tail;          // End of data
    unsigned char         *end;           // Buffer end

    sk_buff_data_t        transport_header; // Transport layer header
    sk_buff_data_t        network_header;   // Network layer header
    sk_buff_data_t        mac_header;       // MAC layer header

    __u32                 priority;       // Packet priority/QoS
    __u32                 mark;           // Packet mark (for filtering)
    __u16                 protocol;       // Protocol (ETH_P_IP, etc.)
    __u16                 queue_mapping;  // Multi-queue mapping

    __u8                  ip_summed;      // Checksum status
    __u8                  cloned;         // Cloned skb
    __u8                  pkt_type;       // Packet type (PACKET_HOST, etc.)

    skb_frag_t            frags[MAX_SKB_FRAGS]; // Non-linear fragments
    struct skb_shared_info *shinfo;       // Shared info (frags, etc.)
};
```

**Key Fields**:
| Field | Type | Purpose |
|-------|------|---------|
| `data` | `unsigned char *` | Points to current layer's header (moves as packet processed) |
| `head`/`tail`/`end` | `unsigned char *` | Buffer boundaries |
| `len` | `unsigned int` | Total packet length (linear + non-linear data) |
| `sk` | `struct sock *` | Socket this packet belongs to (NULL for forwarded packets) |
| `dev` | `struct net_device *` | Network device (RX: where received, TX: where to send) |
| `transport_header` | `sk_buff_data_t` | Offset to TCP/UDP header |
| `network_header` | `sk_buff_data_t` | Offset to IP header |

**Memory Layout**:
```
[head]        [data]                    [tail]            [end]
  |-------------|-------------------------|----------------|
      headroom         packet data            tailroom
```

**Lifetime**: Allocated on packet RX or TX, freed after processing/transmission

**Reference Counting**: `skb_get()` / `kfree_skb()` for refcounting (shared buffers via cloning)

---

### Structure 2: `struct sock`

**Purpose**: Socket - represents a network endpoint for communication

**Definition** (`include/net/sock.h`):
```c
struct sock {
    struct sock_common    __sk_common;    // Common fields (src/dst addresses, ports)
    #define sk_family     __sk_common.skc_family
    #define sk_state      __sk_common.skc_state
    #define sk_daddr      __sk_common.skc_daddr
    #define sk_dport      __sk_common.skc_dport

    socket_lock_t         sk_lock;        // Socket lock
    atomic_t              sk_rmem_alloc;  // Receive buffer allocation
    atomic_t              sk_wmem_alloc;  // Send buffer allocation
    int                   sk_rcvbuf;      // Receive buffer size limit
    int                   sk_sndbuf;      // Send buffer size limit

    struct sk_buff_head   sk_receive_queue; // Received packets
    struct sk_buff_head   sk_write_queue;   // Packets waiting to send
    struct sk_buff_head   sk_error_queue;   // Error packets

    struct socket         *sk_socket;     // BSD socket this belongs to
    void                  *sk_user_data;  // Application data pointer

    int                   sk_err;         // Last error
    unsigned long         sk_flags;       // Socket flags (SOCK_DEAD, etc.)
    int                   sk_protocol;    // Protocol (IPPROTO_TCP, etc.)

    void                  (*sk_state_change)(struct sock *sk);
    void                  (*sk_data_ready)(struct sock *sk);
    void                  (*sk_write_space)(struct sock *sk);
    void                  (*sk_error_report)(struct sock *sk);

    struct proto          *sk_prot;       // Protocol operations (TCP, UDP)
    struct net            *sk_net;        // Network namespace
};
```

**Purpose**: Represents both listening sockets and established connections. Contains receive/send queues, buffer limits, callbacks for events.

**Locking**: `sk_lock` protects socket state, separate from sk_buff queues

---

### Structure 3: `struct net_device`

**Purpose**: Represents a network interface (eth0, wlan0, etc.)

**Definition** (`include/linux/netdevice.h`):
```c
struct net_device {
    char                  name[IFNAMSIZ]; // Interface name (eth0, etc.)
    unsigned long         state;          // Device state (up, running, etc.)
    struct net_device     *next;          // Next device in list

    const struct net_device_ops *netdev_ops; // Device operations
    const struct ethtool_ops *ethtool_ops;   // Ethtool operations

    unsigned int          mtu;            // Maximum transmission unit
    unsigned short        type;           // Interface type (ARPHRD_ETHER, etc.)
    unsigned char         addr_len;       // Hardware address length
    unsigned char         dev_addr[MAX_ADDR_LEN]; // MAC address

    netdev_features_t     features;       // Device features (TSO, checksumming, etc.)
    netdev_features_t     hw_features;    // Hardware features

    struct netdev_queue   *_tx;           // Transmit queues (multi-queue)
    unsigned int          num_tx_queues;  // Number of TX queues
    unsigned int          real_num_tx_queues;

    struct Qdisc          *qdisc;         // Output queue (traffic control)

    unsigned long         tx_queue_len;   // Transmit queue length
    spinlock_t            tx_global_lock; // TX lock

    void                  *priv;          // Driver private data

    struct list_head      napi_list;      // NAPI instances

    struct net            *nd_net;        // Network namespace
};
```

**Key Operations** (net_device_ops):
- `ndo_start_xmit()`: Transmit packet
- `ndo_open()`: Bring interface up
- `ndo_stop()`: Bring interface down
- `ndo_get_stats64()`: Get statistics

---

### Structure 4: `struct napi_struct`

**Purpose**: NAPI (New API) - efficient packet polling interface

**Definition** (`include/linux/netdevice.h`):
```c
struct napi_struct {
    struct list_head      poll_list;      // NAPI poll list
    unsigned long         state;          // NAPI state (scheduled, etc.)
    int                   weight;         // Packets to process per poll
    int                   (*poll)(struct napi_struct *, int); // Poll function

    struct net_device     *dev;           // Associated device
    struct sk_buff        *gro_list;      // GRO (Generic Receive Offload) list
    unsigned int          gro_count;      // GRO packet count
};
```

**Purpose**: Instead of processing each packet in IRQ handler (expensive), NAPI schedules poll function in softirq context to process batches of packets.

**Flow**: IRQ → napi_schedule() → softirq → napi->poll() → process packets

---

### Structure 5: `struct proto` (TCP/UDP Operations)

**Purpose**: Protocol-specific operations (TCP vs UDP vs raw sockets)

**Definition** (`include/net/sock.h`):
```c
struct proto {
    void            (*close)(struct sock *sk, long timeout);
    int             (*connect)(struct sock *sk, struct sockaddr *uaddr, int addr_len);
    int             (*disconnect)(struct sock *sk, int flags);

    struct sock *   (*accept)(struct sock *sk, int flags, int *err);

    int             (*bind)(struct sock *sk, struct sockaddr *uaddr, int addr_len);
    int             (*sendmsg)(struct sock *sk, struct msghdr *msg, size_t len);
    int             (*recvmsg)(struct sock *sk, struct msghdr *msg, size_t len, int flags, int *addr_len);

    int             (*setsockopt)(struct sock *sk, int level, int optname, char __user *optval, unsigned int optlen);
    int             (*getsockopt)(struct sock *sk, int level, int optname, char __user *optval, int __user *optlen);

    void            (*hash)(struct sock *sk);
    void            (*unhash)(struct sock *sk);

    int             (*init)(struct sock *sk);
    void            (*destroy)(struct sock *sk);

    char            name[32];             // Protocol name ("TCP", "UDP")
    struct module   *owner;
};
```

**Usage**: Socket points to proto struct (tcp_prot, udp_prot), socket operations dispatch to these methods.

---

## 5️⃣ Call Path Tracing

### Path 1: Packet Reception (RX Path)

**Overview**: How a network packet travels from NIC hardware to application socket buffer

```
Hardware: Network packet arrives at NIC
              ↓
Interrupt: NIC raises IRQ
              ↓
IRQ Handler: Driver's IRQ handler                   [drivers/net/ethernet/.../driver.c]
  └→ napi_schedule(&napi)                           [include/linux/netdevice.h] // Schedule NAPI poll
              ↓
Softirq: NET_RX_SOFTIRQ                             [kernel/softirq.c]
              ↓
net_rx_action()                                     [net/core/dev.c:6526] // Process NAPI poll list
  └→ napi_poll()                                    [net/core/dev.c:6583]
      └→ driver_poll()                              [drivers/net/.../driver.c] // Driver's poll function
          ├→ DMA: Read descriptor ring
          ├→ netdev_alloc_skb()                     [net/core/skbuff.c] // Allocate sk_buff
          ├→ Copy packet data to skb (or DMA directly)
          ├→ Set skb->protocol = eth_type_trans()   [net/ethernet/eth.c] // Determine protocol
          └→ netif_receive_skb()                    [net/core/dev.c:5456] // Hand to network stack
              ↓
__netif_receive_skb_core()                          [net/core/dev.c:5357]
  ├→ packet_type handlers (tcpdump, etc.)
  └→ deliver_skb()                                  [net/core/dev.c:5237]
      └→ ip_rcv()                                   [net/ipv4/ip_input.c:530] // IPv4 receive
              ↓
ip_rcv_finish()                                     [net/ipv4/ip_input.c:429]
  └→ ip_local_deliver()                             [net/ipv4/ip_input.c:243] // Local packet
      └→ ip_local_deliver_finish()                  [net/ipv4/ip_input.c:207]
          └→ tcp_v4_rcv()                           [net/ipv4/tcp_ipv4.c:2073] // TCP handler
              ↓
tcp_v4_do_rcv()                                     [net/ipv4/tcp_ipv4.c:1713]
  └→ tcp_rcv_established()                          [net/ipv4/tcp_input.c:5937] // Established connection
      ├→ tcp_ack()                                  [net/ipv4/tcp_input.c:3820] // Process ACK
      ├→ tcp_data_queue()                           [net/ipv4/tcp_input.c:5041] // Queue data
      │   └→ __skb_queue_tail(&sk->sk_receive_queue) // Add to socket queue
      └→ sk->sk_data_ready(sk)                      [net/core/sock.c] // Wake up application
              ↓
User Space: Application woken from recv() system call
```

**Detailed Function Information**:

#### `netif_receive_skb()`
- **File**: `net/core/dev.c:5456`
- **Purpose**: Core network receive function - hands packet to protocol stack
- **Parameters**:
  - `struct sk_buff *skb` - Packet to process
- **Return**: `int` - NET_RX_SUCCESS, NET_RX_DROP, etc.
- **Description**: Entry point from drivers into network stack. Processes taps (tcpdump), invokes registered packet_type handlers based on skb->protocol (ETH_P_IP, ETH_P_IPV6). Delivers to appropriate protocol handler (ip_rcv, ipv6_rcv, arp_rcv). Handles GRO (Generic Receive Offload) for aggregating packets.

#### `ip_rcv()`
- **File**: `net/ipv4/ip_input.c:530`
- **Purpose**: IPv4 packet receive - validates and routes packet
- **Parameters**:
  - `struct sk_buff *skb` - Packet
  - `struct net_device *dev` - Receiving device
  - `struct packet_type *pt` - Packet type
  - `struct net_device *orig_dev` - Original device (bonding)
- **Return**: `int` - Receive status
- **Description**: Validates IP header (version, checksum, length), processes IP options, checks if packet is for local delivery or forwarding. Calls netfilter hooks (PREROUTING). Dispatches to ip_local_deliver() or ip_forward().

#### `tcp_v4_rcv()`
- **File**: `net/ipv4/tcp_ipv4.c:2073`
- **Purpose**: TCP packet receive handler
- **Parameters**:
  - `struct sk_buff *skb` - TCP packet
- **Return**: `int` - 0 on success
- **Description**: Validates TCP header and checksum. Looks up socket in TCP hash table based on (src IP, src port, dst IP, dst port). If SYN packet and listening socket, creates new connection (three-way handshake). For established connections, dispatches to tcp_rcv_established(). Handles TCP state machine transitions.

#### `tcp_rcv_established()`
- **File**: `net/ipv4/tcp_input.c:5937`
- **Purpose**: Fast path for established TCP connections
- **Parameters**:
  - `struct sock *sk` - Socket
  - `struct sk_buff *skb` - Packet
- **Return**: `void`
- **Description**: Processes packets on established connections. Fast path: in-order data with expected sequence number - directly queues to receive buffer. Slow path: out-of-order data, duplicate ACKs (triggers fast retransmit), window updates. Updates congestion control (CUBIC, BBR). Calls tcp_data_queue() to buffer data, wakes application via sk_data_ready().

---

### Path 2: Packet Transmission (TX Path)

**Overview**: How data travels from application through socket, protocols, and out to NIC

```
User Space: Application calls send() or write()
              ↓
System Call: sys_sendto()                           [net/socket.c:2058]
              ↓
sock_sendmsg()                                      [net/socket.c:740]
  └→ sock->ops->sendmsg()                           [net/ipv4/af_inet.c] // inet_sendmsg()
      └→ sk->sk_prot->sendmsg()                     [net/ipv4/tcp.c:1449] // tcp_sendmsg()
              ↓
tcp_sendmsg()                                       [net/ipv4/tcp.c:1449]
  ├→ tcp_send_mss()                                 [net/ipv4/tcp.c:1273] // Calculate MSS
  ├→ skb = sk_stream_alloc_skb()                    [net/core/stream.c] // Allocate sk_buff
  ├→ copy_from_iter() → skb_add_data_nocache()      [net/ipv4/tcp.c:1344] // Copy user data
  └→ tcp_push()                                     [net/ipv4/tcp.c:723]
      └→ __tcp_push_pending_frames()                [net/ipv4/tcp_output.c:2585]
          └→ tcp_write_xmit()                       [net/ipv4/tcp_output.c:2485] // Transmit data
              ↓
tcp_transmit_skb()                                  [net/ipv4/tcp_output.c:1352]
  ├→ tcp_build_header()                             // Build TCP header
  ├→ tcp_options_write()                            // Write TCP options
  ├→ icsk->icsk_af_ops->queue_xmit()                [net/ipv4/ip_output.c:492] // ip_queue_xmit()
              ↓
ip_queue_xmit()                                     [net/ipv4/ip_output.c:492]
  ├→ ip_route_output_ports()                        [net/ipv4/route.c] // Routing lookup
  ├→ ip_build_and_send_pkt() or ip_local_out()      [net/ipv4/ip_output.c]
  │   └→ ip_local_out()                             [net/ipv4/ip_output.c:124]
  │       └→ __ip_local_out()                       [net/ipv4/ip_output.c:107]
  │           └→ nf_hook(NFHOOK_LOCAL_OUT)          // Netfilter OUTPUT hook
  │               └→ dst_output()                   [include/net/dst.h:431]
  │                   └→ ip_output()                [net/ipv4/ip_output.c:324]
  │                       └→ ip_finish_output()     [net/ipv4/ip_output.c:232]
  │                           └→ ip_finish_output2() [net/ipv4/ip_output.c:191]
  │                               └→ neigh_output()  [net/core/neighbour.c:1522] // ARP lookup
  │                                   └→ dev_queue_xmit() [net/core/dev.c:4290]
              ↓
__dev_queue_xmit()                                  [net/core/dev.c:4135]
  ├→ netdev_pick_tx()                               [net/core/dev.c:4041] // Select TX queue
  ├→ qdisc_run()                                    [net/sched/sch_generic.c] // Traffic control
  └→ dev_hard_start_xmit()                          [net/core/dev.c:3521]
      └→ xmit_one()                                 [net/core/dev.c:3498]
          └→ netdev_start_xmit()                    [include/linux/netdevice.h]
              └→ dev->netdev_ops->ndo_start_xmit()  [drivers/net/.../driver.c] // Driver TX
              ↓
Driver: Write to DMA descriptor ring, notify NIC
              ↓
Hardware: DMA transfer, transmit packet on wire
              ↓
TX Completion: Interrupt, free skb
```

**Detailed Function Information**:

#### `tcp_sendmsg()`
- **File**: `net/ipv4/tcp.c:1449`
- **Purpose**: TCP send - copies user data to socket buffers and initiates transmission
- **Parameters**:
  - `struct sock *sk` - Socket
  - `struct msghdr *msg` - Message (iovec, flags)
  - `size_t size` - Bytes to send
- **Return**: `int` - Bytes sent or error code
- **Description**: Allocates sk_buffs, copies user data from iovec into skb linear or paged buffers. Respects socket send buffer limits (sk_sndbuf). Handles TCP segmentation (breaks data into MSS-sized segments). Calls tcp_push() to actually transmit. Implements Nagle algorithm (TCP_NODELAY). Blocks if send buffer full (unless non-blocking).

#### `tcp_write_xmit()`
- **File**: `net/ipv4/tcp_output.c:2485`
- **Purpose**: Main TCP transmission function - sends pending data
- **Parameters**:
  - `struct sock *sk` - Socket
  - `unsigned int mss_now` - Current MSS
  - `int nonagle` - Nagle flags
  - `int push_one` - Send only one packet
  - `gfp_t gfp` - Allocation flags
- **Return**: `bool` - False if hit cwnd/TSO limit
- **Description**: Walks sk_write_queue, sending as many packets as congestion window and receiver window allow. Implements TSO (TCP Segmentation Offload) if hardware supports it. Calls tcp_transmit_skb() for each packet. Updates congestion control state (slow start, congestion avoidance, fast recovery). Core of TCP send logic.

#### `dev_queue_xmit()`
- **File**: `net/core/dev.c:4290`
- **Purpose**: Enqueue packet on device for transmission
- **Parameters**:
  - `struct sk_buff *skb` - Packet to transmit
- **Return**: `int` - 0 on success, error on failure
- **Description**: Selects transmit queue (multi-queue NICs), applies traffic control (qdisc), invokes driver's ndo_start_xmit(). If queue full, returns NETDEV_TX_BUSY. May be called from softirq or process context. This is the handoff point to device driver.

---

### Path 3: TCP Connection Establishment (Three-Way Handshake)

**Overview**: How TCP connections are established

```
Client Side:
User Space: connect()
              ↓
sys_connect()                                       [net/socket.c:1936]
  └→ sock->ops->connect()                           [net/ipv4/af_inet.c:646] // inet_stream_connect()
      └→ sk->sk_prot->connect()                     [net/ipv4/tcp_ipv4.c:280] // tcp_v4_connect()
              ↓
tcp_v4_connect()                                    [net/ipv4/tcp_ipv4.c:280]
  ├→ ip_route_connect()                             // Find route to destination
  ├→ tcp_set_state(sk, TCP_SYN_SENT)                // Change state
  └→ tcp_connect()                                  [net/ipv4/tcp_output.c:3793]
      ├→ tcp_connect_init()                         // Initialize seq numbers, MSS
      ├→ tcp_transmit_skb()                         // Send SYN packet
      └→ inet_csk_reset_xmit_timer()                // Start retransmit timer
              ↓
Client waits for SYN-ACK...

Server Side (already listening):
Packet RX Path: SYN packet arrives
              ↓
tcp_v4_rcv()                                        [net/ipv4/tcp_ipv4.c:2073]
  └→ tcp_v4_do_rcv()
      └→ tcp_rcv_state_process()                    [net/ipv4/tcp_input.c:6508] // State machine
          └→ tcp_v4_conn_request()                  [net/ipv4/tcp_ipv4.c:1478] // Handle SYN
              ├→ tcp_conn_request()                 [net/ipv4/tcp_input.c:6984]
              │   ├→ tcp_parse_options()            // Parse SYN options
              │   ├→ syn_cookies (optional)         // SYN cookies if enabled
              │   └→ tcp_v4_send_synack()           [net/ipv4/tcp_ipv4.c:1026] // Send SYN-ACK
              └→ Add to SYN queue (inet_csk_reqsk_queue_hash_add)
              ↓
Server sends SYN-ACK

Client Side: SYN-ACK arrives
              ↓
tcp_rcv_state_process()                             [net/ipv4/tcp_input.c:6508]
  └→ tcp_rcv_synsent_state_process()                [net/ipv4/tcp_input.c:6245] // SYN_SENT state
      ├→ tcp_ack()                                  // Process ACK of our SYN
      ├→ tcp_set_state(sk, TCP_ESTABLISHED)         // Connection established!
      └→ tcp_send_ack()                             // Send final ACK
              ↓
Client sends ACK

Server Side: ACK arrives
              ↓
tcp_v4_rcv() → tcp_check_req()                      [net/ipv4/tcp_minisocks.c:753]
  ├→ tcp_v4_syn_recv_sock()                         [net/ipv4/tcp_ipv4.c:1538] // Create child socket
  ├→ inet_csk_reqsk_queue_add()                     // Add to accept queue
  └→ parent->sk_data_ready()                        // Wake accept()
              ↓
User Space: accept() returns new socket
```

**Detailed Function Information**:

#### `tcp_v4_connect()`
- **File**: `net/ipv4/tcp_ipv4.c:280`
- **Purpose**: Initiate TCP connection (client side)
- **Parameters**:
  - `struct sock *sk` - Socket
  - `struct sockaddr *uaddr` - Destination address
  - `int addr_len` - Address length
- **Return**: `int` - 0 on success, error code on failure
- **Description**: Performs routing lookup to destination. Allocates source port if not bound. Initializes TCP state (ISN generation, window scaling, timestamps). Changes state to TCP_SYN_SENT. Calls tcp_connect() to send SYN. Starts retransmit timer. Blocks waiting for SYN-ACK (unless non-blocking).

#### `tcp_conn_request()`
- **File**: `net/ipv4/tcp_input.c:6984`
- **Purpose**: Handle incoming SYN - create connection request (server side)
- **Parameters**:
  - `struct request_sock_ops *rsk_ops` - Request socket ops
  - `struct tcp_request_sock_ops *af_ops` - Address family ops
  - `struct sock *sk` - Listening socket
  - `struct sk_buff *skb` - SYN packet
- **Return**: `int` - 0 on success
- **Description**: Validates SYN packet. Checks SYN queue length (accept queue backlog). Creates request_sock (mini-socket for half-open connection). Sends SYN-ACK via tcp_v4_send_synack(). Adds to SYN queue. May use SYN cookies under SYN flood attack. Does NOT create full socket until final ACK.

---

### Path 4: Socket System Call (User → Kernel)

**Overview**: How socket() system call creates a socket

```
User Space: socket(AF_INET, SOCK_STREAM, IPPROTO_TCP)
              ↓
System Call: sys_socket()                           [net/socket.c:1545]
              ↓
__sys_socket()                                      [net/socket.c:1521]
  └→ sock_create()                                  [net/socket.c:1466]
      └→ __sock_create()                            [net/socket.c:1369]
          ├→ sock_alloc()                           [net/socket.c:616] // Allocate socket inode
          ├→ net_families[family]->create()         [net/ipv4/af_inet.c:289] // inet_create()
                  ↓
inet_create()                                       [net/ipv4/af_inet.c:289]
  ├→ sock->ops = &inet_stream_ops                   // Set socket operations (TCP)
  ├→ sk = sk_alloc()                                [net/core/sock.c:1925] // Allocate struct sock
  ├→ sock_init_data()                               [net/core/sock.c:3139] // Initialize sock
  └→ sk->sk_prot = &tcp_prot                        // Set protocol operations
      └→ sk->sk_prot->init()                        [net/ipv4/tcp_ipv4.c:2452] // tcp_v4_init_sock()
              ↓
sock_map_fd()                                       [net/socket.c:456] // Create file descriptor
              ↓
Return: fd to userspace
```

**Detailed Function Information**:

#### `__sys_socket()`
- **File**: `net/socket.c:1521`
- **Purpose**: Socket system call implementation
- **Parameters**:
  - `int family` - Address family (AF_INET, AF_INET6, AF_UNIX)
  - `int type` - Socket type (SOCK_STREAM, SOCK_DGRAM, SOCK_RAW)
  - `int protocol` - Protocol (IPPROTO_TCP, IPPROTO_UDP, 0 for default)
- **Return**: `int` - File descriptor or error code
- **Description**: Validates parameters. Calls sock_create() to allocate socket structure and call protocol-specific constructor. Creates file descriptor and associates with socket. Returns fd to userspace. Socket is now ready for bind(), listen(), connect().

#### `inet_create()`
- **File**: `net/ipv4/af_inet.c:289`
- **Purpose**: Create IPv4/IPv6 socket (AF_INET constructor)
- **Parameters**:
  - `struct net *net` - Network namespace
  - `struct socket *sock` - Socket to initialize
  - `int protocol` - Protocol number
  - `int kern` - Kernel socket flag
- **Return**: `int` - 0 on success
- **Description**: Looks up protocol in inet protocol table (TCP, UDP, ICMP, raw). Sets sock->ops based on type (stream=TCP, dgram=UDP). Allocates struct sock via sk_alloc(). Sets sk->sk_prot to protocol operations (tcp_prot, udp_prot). Calls protocol's init function. Returns initialized socket.

---

## 6️⃣ Concurrency Model

### Locking Hierarchy

1. **Socket Lock**: `socket_lock_t` (`sk->sk_lock`)
   - **Protects**: Socket state, send/receive queues
   - **Type**: Custom lock with user/softirq components
   - **Acquired**: During most socket operations (send, recv, setsockopt)

2. **Protocol-Specific Locks**: (TCP example)
   - **TCB (TCP Control Block) Lock**: Protects TCP connection state
   - **Write Queue Lock**: Protects sk_write_queue
   - **Listener Lock**: Protects listening socket's accept queue

3. **Routing Cache Lock**: RCU for lockless lookups

4. **Neighbor (ARP) Cache Lock**: Per-entry locks

5. **Device TX Queue Lock**: `netdev_queue->_xmit_lock`
   - **Protects**: Transmit queue
   - **Acquired**: During packet transmission

### Synchronization Mechanisms

- **RCU**: Extensively used for routing tables, socket hash tables, device list traversal. Allows lockless reads while rare writes use synchronize_rcu().

- **Per-CPU Data**: Per-CPU statistics counters avoid cache line bouncing (SNMP counters, per-CPU packet queues).

- **Lockless Data Structures**: sk_buff queues use atomic operations for lockless enqueue/dequeue in many paths.

- **Softirq Context**: Most packet processing happens in NET_RX_SOFTIRQ and NET_TX_SOFTIRQ softirqs, allowing batching and reduced interrupt overhead.

- **NAPI**: Polling mode during high packet rate - disables interrupts, polls packets until done, then re-enables interrupts. Prevents interrupt livelock.

### Lock-Free Techniques

- **Socket lookup**: RCU-protected hash tables allow lockless lookup by (src IP, src port, dst IP, dst port)
- **Statistics**: Per-CPU counters aggregated on read
- **sk_buff refcounting**: Atomic refcount allows sharing without locks

### Softirq vs Process Context

- **RX Path**: Mostly softirq context (NET_RX_SOFTIRQ) after NAPI poll scheduled
- **TX Path**: Can be process context (sendmsg) or softirq (retransmit timer, ACK)
- **Socket Lock**: Prevents process and softirq from simultaneously accessing socket

---

## 7️⃣ Memory Model

### Allocation Patterns

- **GFP Flags**:
  - `GFP_ATOMIC`: sk_buff allocation in RX softirq (cannot sleep)
  - `GFP_KERNEL`: Socket allocation in process context (can sleep)
  - `GFP_DMA`: DMA buffers for some NICs

### sk_buff Allocation

- **alloc_skb()**: Allocates linear buffer (head → data → tail → end)
- **netdev_alloc_skb()**: Optimized for driver RX - uses page pools
- **__netdev_alloc_skb()**: Reserves headroom for headers (NET_SKB_PAD)

### Page Pools

Drivers use page pools for efficient packet buffer allocation:
- Pre-allocated pages recycled
- Reduces buddy allocator pressure
- Enables zero-copy RX via page_pool_dev_alloc_pages()

### Zero-Copy Techniques

1. **sendfile()**: File → socket without copy to userspace (splice)
2. **MSG_ZEROCOPY**: sk_buff references user pages directly (get_user_pages)
3. **mmap'd packet socket**: PF_PACKET with PACKET_MMAP avoids copies
4. **Paged sk_buff**: sk_buff->frags[] points to pages instead of copying

### NUMA Considerations

- **Socket allocation**: Allocated on local NUMA node
- **sk_buff allocation**: Preferably on same node as socket
- **Receive path**: Packets processed on CPU that received interrupt (RPS can redirect)

---

## 8️⃣ Hardware Interaction

### NIC (Network Interface Card) Interaction

**DMA Rings**:
- **RX Ring**: Circular buffer of descriptors pointing to DMA buffers
- **TX Ring**: Circular buffer of descriptors for packets to transmit
- **Descriptor**: Contains DMA address, length, flags (owned by HW or SW)

**Packet Reception**:
1. NIC DMAs packet into RX buffer (address from descriptor)
2. NIC writes descriptor (length, flags)
3. NIC raises IRQ
4. Driver IRQ handler schedules NAPI
5. NAPI polls: read descriptors, build sk_buffs, refill ring

**Packet Transmission**:
1. Driver writes TX descriptor (DMA address, length)
2. Driver rings doorbell (write to MMIO register)
3. NIC DMAs packet from memory
4. NIC transmits on wire
5. NIC raises TX completion IRQ or polls completed descriptors
6. Driver frees sk_buff

### Hardware Offloads

| Offload | Purpose |
|---------|---------|
| **TX Checksum** | NIC calculates TCP/UDP/IP checksums |
| **RX Checksum** | NIC validates checksums, sets CHECKSUM_UNNECESSARY |
| **TSO (TCP Segmentation Offload)** | NIC segments large TCP packet into MTU-sized frames |
| **GSO (Generic Segmentation Offload)** | Software equivalent of TSO (done in stack if HW doesn't support) |
| **GRO (Generic Receive Offload)** | Aggregate multiple packets into one large packet (reverse of GSO) |
| **LRO (Large Receive Offload)** | Hardware packet aggregation |
| **RSS (Receive Side Scaling)** | NIC distributes packets across multiple RX queues/CPUs |
| **VLAN Offload** | NIC inserts/strips VLAN tags |
| **SR-IOV** | NIC presents multiple virtual functions for VMs |

### Interrupt Handling

**IRQ Handler** (hardirq context):
- Minimal work: ack interrupt, schedule NAPI, return
- Cannot sleep, must be fast

**NAPI Poll** (softirq context):
- Polls packets until budget exhausted or no more packets
- Can be preempted (unlike hardirq)
- Re-enables interrupts when done (napi_complete)

### MMIO (Memory-Mapped I/O)

NIC registers accessed via MMIO:
- **Doorbell Registers**: Write to notify NIC of new TX descriptors
- **Status Registers**: Read to check link status, statistics
- **Control Registers**: Configure NIC (enable queues, set MAC address, etc.)

---

## 9️⃣ Performance Considerations

### Critical Hot Paths

- **Packet RX**: Optimized with NAPI (batching), GRO (aggregation), page pools (reduced allocation overhead)
- **TCP Fast Path**: Inlined checks for common case (established connection, in-order data)
- **sk_buff Allocation**: Per-CPU caches, page pools

### Scalability Techniques

1. **Multi-Queue NICs**: Multiple RX/TX queues, each with own IRQ and NAPI instance. Packets distributed via RSS.

2. **RPS (Receive Packet Steering)**: Software equivalent of RSS - steer packets to CPUs based on hash

3. **RFS (Receive Flow Steering)**: Steer packets to CPU where application is running (cache locality)

4. **XPS (Transmit Packet Steering)**: Dedicate TX queues to specific CPUs

5. **Lockless TX**: Per-CPU TX queues eliminate contention

### Hardware Offloads Impact

- **TSO**: Reduces CPU overhead (one large send instead of many small), reduces per-packet processing
- **GRO**: Reduces stack overhead on RX (process one large packet instead of many small)
- **Checksum Offload**: Eliminates CPU checksum calculation (expensive)

### NUMA Awareness

- **Socket-CPU Affinity**: Keep socket processing on same NUMA node as socket memory
- **Interrupt Affinity**: Route NIC interrupts to CPUs on same node as NIC (PCIe locality)

### Zero-Copy Benefits

- **sendfile()**: Avoids copy to userspace for file transmission (web servers)
- **MSG_ZEROCOPY**: Avoids copy from userspace for large sends (databases, storage)
- Reduces memory bandwidth, CPU overhead, improves throughput

### Batching

- **NAPI**: Process multiple packets per NAPI poll (amortize overhead)
- **TSQ (TCP Small Queues)**: Limit bufferbloat while maintaining throughput
- **Byte Queue Limits (BQL)**: Dynamically size driver TX queue

---

## 🔟 Error Handling

### Common Error Codes

| Error Code | Meaning | Triggered When |
|------------|---------|----------------|
| `-ECONNREFUSED` | Connection refused | No listener on port, or firewall DROP |
| `-ETIMEDOUT` | Connection timed out | TCP retransmits exhausted, no ACK received |
| `-ENETUNREACH` | Network unreachable | No route to destination network |
| `-EHOSTUNREACH` | Host unreachable | No route to destination host |
| `-EPIPE` | Broken pipe | Write to socket after remote closed (sends SIGPIPE) |
| `-EADDRINUSE` | Address already in use | Bind to port already bound (SO_REUSEADDR not set) |
| `-EADDRNOTAVAIL` | Address not available | Bind to non-local address |
| `-EINVAL` | Invalid argument | Invalid socket option, bad address family |
| `-ENOMEM` | Out of memory | Cannot allocate sk_buff or socket |
| `-EMSGSIZE` | Message too large | Send larger than socket buffer or path MTU |

### TCP Retransmission

**Mechanism**: When ACK not received within RTO (retransmit timeout), TCP retransmits packet

**Exponential Backoff**: RTO doubles after each retransmit (1s, 2s, 4s, ..., up to 120s)

**Retransmit Limit**: After tcp_retries2 (default 15) retransmits, connection aborted with -ETIMEDOUT

### ICMP Error Handling

- **Destination Unreachable**: Converts to -ENETUNREACH or -EHOSTUNREACH
- **Time Exceeded (TTL=0)**: Used by traceroute
- **Fragmentation Needed**: Triggers PMTU discovery (reduce MSS)

### Socket Buffer Overflow

**Send Buffer Full**:
- Blocking socket: blocks in sendmsg until space available
- Non-blocking socket: returns -EAGAIN

**Receive Buffer Full**:
- TCP: Closes window (tells sender to stop sending)
- UDP: Drops packet (stateless - no flow control)

### Debugging

**Tracepoints**:
- `net:netif_receive_skb` - Packet reception
- `tcp:tcp_retransmit_skb` - TCP retransmits
- `sock:inet_sock_set_state` - TCP state transitions
- `skb:kfree_skb` - Packet drops (with drop reason)

**Proc/Sysfs**:
- `/proc/net/tcp` - TCP connections
- `/proc/net/dev` - Network device statistics
- `/proc/net/netstat` - Protocol statistics
- `/proc/net/snmp` - SNMP statistics

**Tools**:
- `ss -tan` - Show TCP sockets
- `netstat -s` - Protocol statistics
- `ethtool -S eth0` - NIC statistics
- `tcpdump` - Packet capture
- `perf record -e net:*` - Network tracing

---

## 📚 Additional Resources

### Kernel Documentation

- `Documentation/networking/` - Network subsystem documentation
- `Documentation/networking/ip-sysctl.rst` - Network tunables

### Key Header Files

- `include/linux/skbuff.h` - sk_buff structure
- `include/net/sock.h` - struct sock, socket core
- `include/linux/netdevice.h` - net_device, NAPI
- `include/net/tcp.h` - TCP definitions
- `include/net/route.h` - Routing

### System Calls

- `socket()`, `bind()`, `listen()`, `accept()`, `connect()` - Socket lifecycle
- `send()`, `recv()`, `sendto()`, `recvfrom()`, `sendmsg()`, `recvmsg()` - Data transfer
- `setsockopt()`, `getsockopt()` - Socket options
- `ioctl(SIOCGIFADDR)` - Interface configuration

---

## 🔍 Common Operations Reference

### Operation 1: TCP Send
**User API**: `send(fd, buf, len, flags)`
**Entry Point**: `sys_sendto()` [net/socket.c]
**Flow**: `sys_sendto() → sock_sendmsg() → tcp_sendmsg() → tcp_write_xmit() → ip_queue_xmit() → dev_queue_xmit()`
**Result**: Data copied to sk_buffs, segmented per MSS, transmitted via NIC

### Operation 2: TCP Receive
**User API**: `recv(fd, buf, len, flags)`
**Entry Point**: `sys_recvfrom()` [net/socket.c]
**Flow**: `sys_recvfrom() → sock_recvmsg() → tcp_recvmsg() → skb_copy_datagram_iter()`
**Result**: Blocks until data available (unless non-blocking), copies from sk_receive_queue to user buffer

### Operation 3: UDP Send
**User API**: `sendto(fd, buf, len, flags, dest, addrlen)`
**Entry Point**: `sys_sendto()` [net/socket.c]
**Flow**: `sys_sendto() → udp_sendmsg() → ip_route_output_flow() → ip_append_data() → udp_send_skb() → ip_send_skb()`
**Result**: Connectionless send - routing lookup, create packet, transmit immediately (no queueing)

### Operation 4: Packet Filtering (iptables)
**Trigger**: Packet traverses netfilter hook
**Entry Point**: `NF_HOOK()` macro [include/linux/netfilter.h]
**Flow**: `NF_HOOK() → nf_hook_slow() → nf_hook_entry_head() → iptables match/target modules`
**Result**: Packet accepted, dropped, or modified based on iptables rules

---

**End of Networking Stack Subsystem Documentation**
