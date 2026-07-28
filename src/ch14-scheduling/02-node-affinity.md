# 14.2 Node Affinity and Node Selectors

⏱️ **~6 min read**

> **TL;DR:** **Node Selectors** are the simple, legacy way to pin pods to nodes with matching labels (`key: value`). **Node Affinity** is the modern replacement — it supports `In`, `NotIn`, `Exists`, `Gt`/`Lt` operators, and crucially, a `preferred` (soft) mode that lets the scheduler fall back to other nodes if the preferred ones are unavailable.

---

## Why Pin Pods to Specific Nodes?

Common use cases:

| Scenario | Requirement |
|----------|-------------|
| GPU workloads | Pod must land on a node with a GPU |
| Zone-aware data | DB pod should land in the same zone as its PV |
| Hardware tiers | CPU-intensive workloads on `high-cpu` nodes |
| Compliance | Regulated workloads only on nodes in specific datacenters |
| Edge/IoT | Pod must run on `arm64` nodes at the edge |

The mechanism: **label nodes** → **tell pods which labels they require** → scheduler only places the pod on matching nodes.

---

## Node Labels

```bash
# View existing node labels
kubectl get nodes --show-labels
kubectl describe node minikube | grep -A 10 "Labels:"

# Common built-in labels (auto-set by Kubernetes)
kubernetes.io/hostname=minikube
kubernetes.io/arch=amd64
kubernetes.io/os=linux
node.kubernetes.io/instance-type=Standard_D4s_v3   # Cloud providers
topology.kubernetes.io/zone=us-east-1a              # Cloud zone
topology.kubernetes.io/region=us-east-1             # Cloud region

# Add a custom label to a node
kubectl label node minikube disk=ssd
kubectl label node minikube-m02 gpu=true
kubectl label node minikube-m03 tier=spot

# Remove a label
kubectl label node minikube disk-
```

---

## Option 1: nodeSelector (Simple, Legacy)

The simplest approach — pod only schedules on nodes where ALL key-value pairs match:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: ssd-pod
spec:
  nodeSelector:
    disk: ssd            # Node must have exactly this label
    kubernetes.io/arch: amd64
  containers:
  - name: app
    image: nginx:alpine
```

**Limitations of nodeSelector:**
- Only supports exact equality (`key: value`)
- No `OR` logic, no `NotIn`, no ranges
- No soft/"preferred" mode — if no node matches, pod is Pending forever

---

## Option 2: Node Affinity (Recommended)

Node Affinity has two modes:

| Mode | Scheduling Behavior | If No Node Matches |
|------|--------------------|--------------------|
| `requiredDuringSchedulingIgnoredDuringExecution` | **Hard** — must match | Pod stays Pending |
| `preferredDuringSchedulingIgnoredDuringExecution` | **Soft** — try to match | Fall back to any node |

> The `IgnoredDuringExecution` suffix means: if a running pod's node later loses the label, the pod is **not** evicted. A future `RequiredDuringExecution` mode (in alpha) will evict pods if nodes stop matching.

### Hard Requirement — Pod Must Land on SSD Node

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: db
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: disk
                operator: In
                values:
                - ssd
                - nvme           # SSD OR NVMe is fine
              - key: kubernetes.io/arch
                operator: In
                values:
                - amd64           # AND must be AMD64
      containers:
      - name: db
        image: postgres:15
```

### Soft Preference — Prefer GPU Node, Fall Back If Unavailable

```yaml
spec:
  affinity:
    nodeAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 80          # Higher weight = stronger preference (1–100)
        preference:
          matchExpressions:
          - key: gpu
            operator: Exists  # Any node that has a "gpu" label at all
      - weight: 20
        preference:
          matchExpressions:
          - key: tier
            operator: NotIn
            values:
            - spot            # Mildly prefer to avoid spot instances
```

### Combining Hard and Soft

```yaml
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchExpressions:
          - key: kubernetes.io/os
            operator: In
            values: [linux]        # Hard: Linux only
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        preference:
          matchExpressions:
          - key: zone
            operator: In
            values: [us-east-1a]   # Soft: prefer this zone
```

---

## Supported Operators

| Operator | Meaning | Example |
|----------|---------|---------|
| `In` | Label value is in the list | `disk In [ssd, nvme]` |
| `NotIn` | Label value is NOT in the list | `tier NotIn [spot, preemptible]` |
| `Exists` | Label key exists (any value) | `gpu Exists` |
| `DoesNotExist` | Label key is absent | `maintenance DoesNotExist` |
| `Gt` | Label value > number (as string) | `cpu-count Gt 8` |
| `Lt` | Label value < number (as string) | `memory-gb Lt 32` |

---

## Multiple nodeSelectorTerms — OR Logic

Multiple `nodeSelectorTerms` entries are **OR**-ed; multiple `matchExpressions` within one term are **AND**-ed:

```yaml
nodeSelectorTerms:
- matchExpressions:                    # Term 1: disk=ssd AND zone=us-east-1a
  - key: disk
    operator: In
    values: [ssd]
  - key: zone
    operator: In
    values: [us-east-1a]
- matchExpressions:                    # OR Term 2: disk=nvme (any zone)
  - key: disk
    operator: In
    values: [nvme]
```

---

## nodeSelector vs nodeAffinity — Decision Guide

```
Use nodeSelector when:
  ✓ Simple exact match needed
  ✓ Quick pinning in a hurry
  ✗ No OR logic, no Exists, no preferred fallback

Use nodeAffinity when:
  ✓ Multiple acceptable values (In/NotIn)
  ✓ Soft preference with hard fallback
  ✓ Need Exists/DoesNotExist operators
  ✓ Production workloads
```

---

## ✅ Quick Check

**Q1:** You want a pod to prefer nodes with `tier=premium` but still schedule on any node if no premium nodes are available. Which affinity type do you use?

<details>
<summary>Answer</summary>
`preferredDuringSchedulingIgnoredDuringExecution` — this is the soft/best-effort mode. The scheduler boosts the score of matching nodes but won't block scheduling if none are available. Set a `weight` between 1–100 to control how strongly the preference is expressed relative to other scoring factors.
</details>

**Q2:** What's the difference between `Exists` and `In` operators in a matchExpression?

<details>
<summary>Answer</summary>
- `Exists`: The label key must be present on the node, but its value doesn't matter. Use when you've labeled nodes `gpu=true` or `gpu=nvidia` or `gpu=amd` and just want any GPU node.
- `In`: The label key must be present AND its value must be one of the listed values. Use when you care about the specific value, e.g., `disk In [ssd, nvme]` (but not `hdd`).
</details>

**Q3:** A pod has a `requiredDuringScheduling` rule for `disk=ssd`. You then remove the `disk=ssd` label from the node it's running on. What happens to the running pod?

<details>
<summary>Answer</summary>
Nothing — the pod **continues running**. The `IgnoredDuringExecution` suffix means the rule is only enforced at scheduling time, not continuously. Existing pods are not evicted if their node's labels change. A future `RequiredDuringExecution` mode will add runtime enforcement, but it is not yet GA.
</details>
