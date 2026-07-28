# 14.3 Taints and Tolerations

⏱️ **~6 min read**

> **TL;DR:** **Taints** are marks you put on nodes that **repel** pods. **Tolerations** are declarations on pods that say "I can handle that taint." The combination lets you dedicate nodes to specific workloads (e.g., GPU nodes for ML jobs only) or protect critical infrastructure nodes (like control-plane nodes) from regular workloads.

---

## The Mental Model: Bodyguard vs VIP Pass

```
Taint on Node  =  "No regular pods allowed here" (bodyguard at the door)
Toleration on Pod = "I have a VIP pass for that taint" (badge that gets you in)

Without a matching toleration → pod is repelled (Pending or evicted)
With a matching toleration    → pod is allowed (but not forced) onto the node
```

> ⚠️ **Key insight:** A toleration does NOT force a pod onto a tainted node. It only allows it. You still need **node affinity** if you want to guarantee the pod lands on that specific node.

---

## Taint Structure

A taint has three parts:

```
key=value:effect
```

| Part | Description | Example |
|------|-------------|---------|
| **key** | Identifier (label-like) | `dedicated`, `gpu`, `node-role.kubernetes.io/control-plane` |
| **value** | Optional qualifier | `ml-team`, `nvidia`, `true` |
| **effect** | What happens to non-tolerating pods | `NoSchedule`, `PreferNoSchedule`, `NoExecute` |

---

## The Three Effects

| Effect | Scheduling | Running Pods |
|--------|-----------|-------------|
| `NoSchedule` | New pods without toleration **won't be scheduled** here | Existing pods **stay** |
| `PreferNoSchedule` | Scheduler **avoids** this node (soft) | Existing pods stay |
| `NoExecute` | New pods blocked **AND** existing non-tolerating pods **evicted** | Evicted after `tolerationSeconds` |

---

## Working with Taints

```bash
# Add a taint
kubectl taint node minikube-m02 dedicated=ml-team:NoSchedule
kubectl taint node minikube-m02 gpu=true:NoSchedule

# View taints on nodes
kubectl describe node minikube-m02 | grep Taints
# Taints: dedicated=ml-team:NoSchedule, gpu=true:NoSchedule

kubectl get nodes -o custom-columns=NAME:.metadata.name,TAINTS:.spec.taints

# Remove a taint (append a minus sign)
kubectl taint node minikube-m02 dedicated=ml-team:NoSchedule-
kubectl taint node minikube-m02 gpu-      # Remove all taints with key "gpu"
```

---

## Tolerations on Pods

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ml-training
spec:
  template:
    spec:
      tolerations:
      # Exact match: key=dedicated, value=ml-team, effect=NoSchedule
      - key: "dedicated"
        operator: "Equal"
        value: "ml-team"
        effect: "NoSchedule"

      # Key exists with any value, specific effect
      - key: "gpu"
        operator: "Exists"
        effect: "NoSchedule"

      # Tolerate NoExecute with an eviction grace period
      - key: "node.kubernetes.io/not-ready"
        operator: "Exists"
        effect: "NoExecute"
        tolerationSeconds: 300   # Tolerate for 5 min before eviction

      containers:
      - name: trainer
        image: tensorflow/tensorflow:latest-gpu
```

### Toleration Operators

| Operator | Matches When |
|----------|-------------|
| `Equal` | key, value, AND effect all match exactly |
| `Exists` | key matches (ignores value); effect must still match or be omitted |

> If you omit `effect` in a toleration, it matches **all effects** for that key. If you omit `key`, you match **all keys** (a wildcard — tolerates every taint on the node).

---

## Real-World Patterns

### Pattern 1: Dedicated Node Pool

Reserve a node exclusively for one team. No other pods can land there:

```bash
# Taint the dedicated node
kubectl taint node gpu-node-1 dedicated=gpu-team:NoSchedule

# Label it too (so we can use affinity to force pods HERE specifically)
kubectl label node gpu-node-1 dedicated=gpu-team
```

```yaml
# GPU team's Deployment
spec:
  template:
    spec:
      tolerations:
      - key: dedicated
        operator: Equal
        value: gpu-team
        effect: NoSchedule
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: dedicated
                operator: In
                values: [gpu-team]
```

### Pattern 2: Control-Plane Node Isolation

Kubernetes automatically taints control-plane nodes:

```bash
kubectl describe node minikube | grep Taint
# Taints: node-role.kubernetes.io/control-plane:NoSchedule
```

Regular workloads don't tolerate this taint → they never land on the control-plane node. If you deliberately want to run a pod on the control-plane (e.g., a DaemonSet for monitoring), add:

```yaml
tolerations:
- key: node-role.kubernetes.io/control-plane
  operator: Exists
  effect: NoSchedule
```

### Pattern 3: NoExecute for Node Maintenance

`NoExecute` is powerful for draining workloads from a failing or under-maintenance node:

```bash
# Mark a node as draining (adds NoExecute taint)
kubectl taint node worker-1 maintenance=true:NoExecute

# Pods without tolerations are immediately evicted
# Pods with tolerationSeconds=300 get 5 minutes to finish work
```

Kubernetes itself uses `NoExecute` taints for node conditions:

| Automatic Taint | Condition |
|----------------|-----------|
| `node.kubernetes.io/not-ready` | Node is not ready |
| `node.kubernetes.io/unreachable` | Node unreachable from controller |
| `node.kubernetes.io/memory-pressure` | Node has memory pressure |
| `node.kubernetes.io/disk-pressure` | Node has disk pressure |
| `node.kubernetes.io/network-unavailable` | Node network not configured |

---

## Taints vs Node Affinity — When to Use Each

| Use Case | Mechanism |
|----------|-----------|
| "Only ML jobs on GPU nodes" | Taint GPU nodes + toleration on ML jobs + affinity to force them there |
| "Prefer SSD nodes but fallback OK" | Node affinity (preferredDuringScheduling) |
| "Protect control-plane nodes" | Taint (Kubernetes does this automatically) |
| "Evict pods from a failing node" | NoExecute taint (Kubernetes does this automatically) |
| "Different hardware for DB vs web" | Node affinity (required, label-based) |

---

## ✅ Quick Check

**Q1:** You taint a node `gpu=true:NoSchedule`. A regular nginx Deployment pod ends up running there anyway. How?

<details>
<summary>Answer</summary>
The pod was **already running** on that node before the taint was added. `NoSchedule` only blocks **new** pods from being scheduled — it does not evict existing pods. To evict running pods, you'd need a `NoExecute` taint. Or, kubectl drain the node first (which cordons it and evicts all pods), then apply the taint.
</details>

**Q2:** What's the minimal toleration that tolerates ALL taints on a node?

<details>
<summary>Answer</summary>
A toleration with no key and `operator: Exists` matches all taints:
```yaml
tolerations:
- operator: Exists
```
This is what DaemonSets typically use so they can run on every node regardless of taints (e.g., the Prometheus node-exporter DaemonSet).
</details>

**Q3:** A pod has a `NoExecute` toleration with `tolerationSeconds: 60`. The node becomes "not ready". What happens?

<details>
<summary>Answer</summary>
Kubernetes automatically adds a `node.kubernetes.io/not-ready:NoExecute` taint to the node. The pod **tolerates** this taint for 60 seconds (grace period). If the node recovers within 60 seconds, the pod continues running. If not, the pod is evicted after 60 seconds and rescheduled on another node. This is how Kubernetes balances availability with stability — it doesn't immediately reschedule on transient network blips.
</details>
