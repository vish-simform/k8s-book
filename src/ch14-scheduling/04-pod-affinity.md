# 14.4 Pod Affinity and Anti-Affinity

⏱️ **~6 min read**

> **TL;DR:** **Pod Affinity** co-locates pods with other pods (e.g., put my cache next to my app). **Pod Anti-Affinity** spreads pods apart (e.g., never put two replicas on the same node). Both work by examining what pods are **already running** on candidate nodes/zones, not node labels. The result is placement decisions that are dynamic and topology-aware.

---

## Pod Affinity vs Node Affinity

```
Node Affinity:   "Schedule me on nodes with these LABELS"
                  → Static; based on node properties

Pod Affinity:    "Schedule me near nodes that are running pods with THESE labels"
                  → Dynamic; based on what OTHER PODS are already running where
```

---

## Topology Keys — The Scope of "Near"

Pod affinity/anti-affinity operates within a **topology domain**. The `topologyKey` defines the scope:

| topologyKey | Scope of "same" |
|-------------|-----------------|
| `kubernetes.io/hostname` | Same node |
| `topology.kubernetes.io/zone` | Same availability zone |
| `topology.kubernetes.io/region` | Same region |
| `custom-label` | Any custom grouping label on nodes |

---

## Pod Affinity — Co-locate Pods

### Use Case: Cache Sidecar Pattern

You want your Redis cache pods to land on the same nodes as your app pods (to minimize latency):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-cache
spec:
  replicas: 3
  template:
    metadata:
      labels:
        app: redis-cache
        role: cache
    spec:
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values: [web-app]       # Co-locate with web-app pods
            topologyKey: kubernetes.io/hostname  # On the SAME node
      containers:
      - name: redis
        image: redis:7-alpine
```

### Soft Co-location: Prefer Same Zone

```yaml
spec:
  affinity:
    podAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app: my-app
          topologyKey: topology.kubernetes.io/zone  # Prefer same AZ
```

---

## Pod Anti-Affinity — Spread Pods Apart

### Use Case: High Availability — One Replica Per Node

Never put two replicas of the same Deployment on the same node:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 3
  template:
    metadata:
      labels:
        app: web-app
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values: [web-app]      # Don't be near other web-app pods
            topologyKey: kubernetes.io/hostname  # On the SAME node
      containers:
      - name: web
        image: nginx:alpine
```

> ⚠️ **Watch out:** Hard anti-affinity with `requiredDuringScheduling` can make pods **Pending** if there aren't enough nodes. If you have 3 replicas and 2 nodes, the third replica can never schedule. Use `preferredDuringScheduling` for safety.

### Soft Anti-Affinity: Prefer Different Zones

For truly high availability, spread across zones (not just nodes):

```yaml
spec:
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app: web-app
          topologyKey: topology.kubernetes.io/zone
```

---

## TopologySpreadConstraints — The Modern Alternative

For evenly spreading pods, `topologySpreadConstraints` (available since 1.18) is simpler and more powerful than anti-affinity:

```yaml
spec:
  topologySpreadConstraints:
  # Constraint 1: Spread evenly across zones (max 1 pod difference between zones)
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule   # Hard (use ScheduleAnyway for soft)
    labelSelector:
      matchLabels:
        app: web-app

  # Constraint 2: Also spread evenly across nodes within each zone
  - maxSkew: 1
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway  # Soft
    labelSelector:
      matchLabels:
        app: web-app
```

| Field | Values | Meaning |
|-------|--------|---------|
| `maxSkew` | Integer ≥ 1 | Max allowed difference in pod count between any two topology domains |
| `topologyKey` | Label key | Groups nodes into topology domains |
| `whenUnsatisfiable` | `DoNotSchedule` / `ScheduleAnyway` | Hard or soft constraint |

**Comparison:**

| | Pod Anti-Affinity | TopologySpreadConstraints |
|--|------------------|--------------------------|
| **Goal** | Avoid specific pods | Even distribution |
| **Control** | Binary (near/not near) | Skew-based (quantitative) |
| **Multi-constraint** | Combine multiple rules | Native multi-constraint support |
| **Best for** | Co-location patterns | Even spreading (HA) |

---

## Complete Production Pattern: HA + Co-location

Putting it all together — a 3-replica web app spread across zones, with its Redis co-located per node:

```yaml
# web-app: spread across zones, never two on same node
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 3
  template:
    metadata:
      labels:
        app: web-app
        tier: frontend
    spec:
      topologySpreadConstraints:
      - maxSkew: 1
        topologyKey: topology.kubernetes.io/zone
        whenUnsatisfiable: DoNotSchedule
        labelSelector:
          matchLabels:
            app: web-app
      - maxSkew: 1
        topologyKey: kubernetes.io/hostname
        whenUnsatisfiable: ScheduleAnyway
        labelSelector:
          matchLabels:
            app: web-app
      containers:
      - name: web
        image: my-web-app:latest
---
# redis: co-located with web-app on each node
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-local
spec:
  replicas: 3
  template:
    metadata:
      labels:
        app: redis-local
    spec:
      affinity:
        podAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: web-app
            topologyKey: kubernetes.io/hostname
      containers:
      - name: redis
        image: redis:7-alpine
```

---

## ✅ Quick Check

**Q1:** You have 4 replicas of a Deployment with hard anti-affinity (`requiredDuringScheduling`) using `topologyKey: kubernetes.io/hostname`. Your cluster has 3 nodes. What happens?

<details>
<summary>Answer</summary>
3 replicas schedule (one per node), but the **4th replica stays Pending** indefinitely — there's no node that doesn't already have one of its own pods. You'll see a `FailedScheduling` event like "3 node(s) didn't match pod anti-affinity rules". Fix: switch to `preferredDuringScheduling` (soft), or add a 4th node, or reduce replicas to 3.
</details>

**Q2:** What's the difference between `topologyKey: kubernetes.io/hostname` and `topologyKey: topology.kubernetes.io/zone` in an anti-affinity rule?

<details>
<summary>Answer</summary>
- `kubernetes.io/hostname`: The topology domain is each individual node. Anti-affinity means "don't put two of my pods on the same **node**".
- `topology.kubernetes.io/zone`: The topology domain is an availability zone (group of nodes). Anti-affinity means "don't put two of my pods in the same **zone**", so they land in different AZs for HA. With zone-level anti-affinity, two pods can still land on different nodes in the same zone.
</details>

**Q3:** When should you use `topologySpreadConstraints` instead of pod anti-affinity?

<details>
<summary>Answer</summary>
Use `topologySpreadConstraints` when you want **even, quantitative distribution** — e.g., "keep the count difference between zones ≤ 1". Anti-affinity is binary (avoid or don't avoid a specific set of pods) and doesn't natively control how many pods per domain. For HA spreading of stateless replicas, `topologySpreadConstraints` is simpler, more flexible (supports `maxSkew`), and is the modern recommended approach over complex anti-affinity rules.
</details>
