# Lab: Control Where Pods Land

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | Sections 14.1–14.4 read, Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Label nodes, use node selectors and affinity to pin pods, taint nodes to repel workloads, simulate node failure with NoExecute, and spread replicas using anti-affinity and topology spread constraints |

## Objectives

- [ ] Label nodes and use `nodeSelector` to pin a pod
- [ ] Use hard node affinity to require a specific node label
- [ ] Use soft node affinity with fallback behavior
- [ ] Taint a node and observe pod repulsion
- [ ] Add a toleration to allow a pod onto a tainted node
- [ ] Use pod anti-affinity to spread replicas across nodes
- [ ] Use `topologySpreadConstraints` for even distribution
- [ ] Observe what happens when scheduling constraints can't be satisfied

---

## Setup: Multi-Node Minikube

For this lab, a 3-node cluster gives the most interesting results:

```bash
# Start a 3-node cluster (or add nodes to existing)
# If you have a running single-node Minikube, add nodes:
minikube node add
minikube node add

# Verify 3 nodes exist
kubectl get nodes
# NAME           STATUS   ROLES           AGE
# minikube       Ready    control-plane   ...
# minikube-m02   Ready    <none>          ...
# minikube-m03   Ready    <none>          ...
```

> **Single-node workaround:** If you can't add nodes, you can still complete most exercises by using fake labels. The anti-affinity exercises will show the "Pending" behavior directly — which is actually a useful learning outcome.

```bash
# Create a namespace for this lab
kubectl create namespace sched-lab
kubectl config set-context --current --namespace=sched-lab
```

---

## Exercise 1: Node Labels and nodeSelector

**What we're doing:** Label nodes to represent different hardware tiers and pin pods using `nodeSelector`.

```bash
# View current labels on all nodes
kubectl get nodes --show-labels | grep -v "node.kubernetes"

# Label the nodes to simulate different hardware
kubectl label node minikube       disk=hdd  tier=standard
kubectl label node minikube-m02   disk=ssd  tier=premium
kubectl label node minikube-m03   disk=ssd  tier=premium gpu=true

# Verify
kubectl get nodes -L disk,tier,gpu
# NAME           DISK   TIER       GPU
# minikube       hdd    standard
# minikube-m02   ssd    premium
# minikube-m03   ssd    premium    true
```

**Deploy a pod that requires SSD:**

```bash
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: ssd-pod
  namespace: sched-lab
spec:
  nodeSelector:
    disk: ssd
  containers:
  - name: app
    image: nginx:alpine
    resources:
      requests:
        cpu: "50m"
        memory: "32Mi"
EOF

# Check which node it landed on
kubectl get pod ssd-pod -o wide -n sched-lab
# Should be on minikube-m02 or minikube-m03 (both have disk=ssd)
```

**Verify it won't schedule on the HDD node:**

```bash
kubectl apply -f - <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: impossible-pod
  namespace: sched-lab
spec:
  nodeSelector:
    disk: ssd
    gpu: "true"
    tier: standard          # Conflict! No node has ssd+gpu+standard
  containers:
  - name: app
    image: nginx:alpine
EOF

kubectl get pod impossible-pod -n sched-lab
# STATUS: Pending

kubectl describe pod impossible-pod -n sched-lab | grep -A 5 "Events:"
# Event: 0/3 nodes are available: 1 node(s) didn't match node selector, ...

# Clean up
kubectl delete pod impossible-pod -n sched-lab
```

---

## Exercise 2: Hard Node Affinity

**What we're doing:** Use `requiredDuringScheduling` affinity with the `In` operator.

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: premium-app
  namespace: sched-lab
spec:
  replicas: 3
  selector:
    matchLabels:
      app: premium-app
  template:
    metadata:
      labels:
        app: premium-app
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: tier
                operator: In
                values: [premium]
      containers:
      - name: app
        image: nginx:alpine
        resources:
          requests:
            cpu: "50m"
            memory: "32Mi"
EOF

kubectl rollout status deployment/premium-app -n sched-lab

# Verify: ALL pods should be on premium nodes (minikube-m02 or minikube-m03)
kubectl get pods -n sched-lab -l app=premium-app -o wide
```

**Expected:** All 3 pods on `minikube-m02` or `minikube-m03`, none on `minikube` (which has `tier=standard`).

---

## Exercise 3: Soft Node Affinity with Fallback

**What we're doing:** Use `preferredDuringScheduling` and watch the fallback behavior.

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: soft-pref-app
  namespace: sched-lab
spec:
  replicas: 4
  selector:
    matchLabels:
      app: soft-pref-app
  template:
    metadata:
      labels:
        app: soft-pref-app
    spec:
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
          - weight: 100
            preference:
              matchExpressions:
              - key: gpu
                operator: Exists    # Strongly prefer GPU node (minikube-m03)
          - weight: 50
            preference:
              matchExpressions:
              - key: tier
                operator: In
                values: [premium]   # Also prefer premium nodes
      containers:
      - name: app
        image: nginx:alpine
        resources:
          requests:
            cpu: "50m"
            memory: "32Mi"
EOF

kubectl get pods -n sched-lab -l app=soft-pref-app -o wide
```

**Observe:** With 4 replicas and 3 nodes, most pods should cluster on the GPU node and premium nodes, but the scheduler may place some on the standard node rather than stack all 4 on one node — soft constraints guide, not force.

---

## Exercise 4: Taints and Tolerations

**What we're doing:** Taint a node to repel most pods, then add a toleration to allow a specific pod.

```bash
# Taint minikube-m03 to simulate a GPU-dedicated node
kubectl taint node minikube-m03 dedicated=gpu-team:NoSchedule

# Try to schedule a regular pod — it should avoid minikube-m03
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: regular-app
  namespace: sched-lab
spec:
  replicas: 4
  selector:
    matchLabels:
      app: regular-app
  template:
    metadata:
      labels:
        app: regular-app
    spec:
      containers:
      - name: app
        image: nginx:alpine
        resources:
          requests:
            cpu: "50m"
            memory: "32Mi"
EOF

kubectl get pods -n sched-lab -l app=regular-app -o wide
# Verify: NO pods on minikube-m03 (it's tainted)
```

**Now deploy a pod WITH the toleration:**

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gpu-app
  namespace: sched-lab
spec:
  replicas: 2
  selector:
    matchLabels:
      app: gpu-app
  template:
    metadata:
      labels:
        app: gpu-app
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
              - key: gpu
                operator: Exists    # Force onto the GPU node
      containers:
      - name: trainer
        image: nginx:alpine
        resources:
          requests:
            cpu: "50m"
            memory: "32Mi"
EOF

kubectl get pods -n sched-lab -l app=gpu-app -o wide
# All pods should be on minikube-m03 — the tainted GPU node
```

---

## Exercise 5: Pod Anti-Affinity for High Availability

**What we're doing:** Ensure no two replicas of the same app land on the same node.

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ha-app
  namespace: sched-lab
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ha-app
  template:
    metadata:
      labels:
        app: ha-app
    spec:
      affinity:
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchExpressions:
              - key: app
                operator: In
                values: [ha-app]
            topologyKey: kubernetes.io/hostname   # One per node
      containers:
      - name: app
        image: nginx:alpine
        resources:
          requests:
            cpu: "50m"
            memory: "32Mi"
EOF

kubectl get pods -n sched-lab -l app=ha-app -o wide
# Each pod should be on a different node
```

**Now try to scale beyond the node count:**

```bash
kubectl scale deployment ha-app --replicas=4 -n sched-lab

# Wait and observe
kubectl get pods -n sched-lab -l app=ha-app
# The 4th replica will be Pending — no node available that doesn't already have one

kubectl describe pod -n sched-lab -l app=ha-app | grep -A 3 "Events:"
# Event: 0/3 nodes are available: 3 node(s) didn't match pod anti-affinity rules

# Scale back
kubectl scale deployment ha-app --replicas=3 -n sched-lab
```

---

## Exercise 6: TopologySpreadConstraints

**What we're doing:** Use `topologySpreadConstraints` for even distribution with `maxSkew`.

```bash
# First, remove the taint from minikube-m03 so all 3 nodes are available
kubectl taint node minikube-m03 dedicated=gpu-team:NoSchedule-

kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spread-app
  namespace: sched-lab
spec:
  replicas: 6
  selector:
    matchLabels:
      app: spread-app
  template:
    metadata:
      labels:
        app: spread-app
    spec:
      topologySpreadConstraints:
      - maxSkew: 1                              # Max 1 pod difference between nodes
        topologyKey: kubernetes.io/hostname
        whenUnsatisfiable: DoNotSchedule        # Hard constraint
        labelSelector:
          matchLabels:
            app: spread-app
      containers:
      - name: app
        image: nginx:alpine
        resources:
          requests:
            cpu: "30m"
            memory: "16Mi"
EOF

kubectl rollout status deployment/spread-app -n sched-lab

kubectl get pods -n sched-lab -l app=spread-app -o wide | awk '{print $7}' | sort | uniq -c
# Expected: 2 pods per node (6 pods / 3 nodes = 2 each, maxSkew=1 satisfied)
```

**Test the constraint:**

```bash
# Scale to 7 — one node will get 3, others 2, maxSkew=1 is met (3-2=1)
kubectl scale deployment spread-app --replicas=7 -n sched-lab
kubectl get pods -n sched-lab -l app=spread-app -o wide | awk '{print $7}' | sort | uniq -c

# Scale to 10 — now one node would need 4 but others have 3, skew=1, still OK
kubectl scale deployment spread-app --replicas=10 -n sched-lab
kubectl get pods -n sched-lab -l app=spread-app -o wide | awk '{print $7}' | sort | uniq -c
```

---

## 🔥 Break It! Challenge

> What happens when you combine **hard node affinity** (only premium nodes) with **hard pod anti-affinity** (one per node), and you have more replicas than premium nodes?

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: impossible-spread
  namespace: sched-lab
spec:
  replicas: 5        # 5 replicas, but only 2 premium nodes
  selector:
    matchLabels:
      app: impossible-spread
  template:
    metadata:
      labels:
        app: impossible-spread
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
            - matchExpressions:
              - key: tier
                operator: In
                values: [premium]       # Only 2 nodes qualify
        podAntiAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
          - labelSelector:
              matchLabels:
                app: impossible-spread
            topologyKey: kubernetes.io/hostname   # Only 1 per node
      containers:
      - name: app
        image: nginx:alpine
EOF

kubectl get pods -n sched-lab -l app=impossible-spread
# 2 pods Running (one per premium node), 3 pods Pending
kubectl describe pod -n sched-lab -l app=impossible-spread | grep -A 5 "Events:"
```

**Expected message:** `0/3 nodes are available: 1 node(s) didn't match node affinity, 2 node(s) didn't match pod anti-affinity rules`

This is the most common production scheduling trap: over-constrained configurations that silently leave replicas Pending.

---

## Cleanup

```bash
# Remove labels added to nodes
kubectl label node minikube disk- tier-
kubectl label node minikube-m02 disk- tier-
kubectl label node minikube-m03 disk- tier- gpu-

# Remove any remaining taints
kubectl taint node minikube-m03 dedicated- 2>/dev/null || true

# Delete the namespace (removes all resources)
kubectl delete namespace sched-lab

# Reset default namespace
kubectl config set-context --current --namespace=default

# Optionally remove extra Minikube nodes
# minikube node delete minikube-m02
# minikube node delete minikube-m03
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | Node labels | Labeled 3 nodes with `disk`, `tier`, `gpu` |
| 2 | nodeSelector | `ssd-pod` only ran on SSD-labeled nodes |
| 3 | Hard node affinity | `premium-app` only on `tier=premium` nodes |
| 4 | Soft node affinity | `soft-pref-app` clustered on GPU/premium but didn't stay Pending |
| 5 | Taints | `regular-app` never placed on tainted `minikube-m03` |
| 6 | Tolerations | `gpu-app` tolerated the taint and was pinned to the GPU node |
| 7 | Pod anti-affinity (hard) | `ha-app` spread one-per-node; 4th replica stayed Pending |
| 8 | TopologySpreadConstraints | `spread-app` maintained `maxSkew=1` across all 3 nodes |
| 9 | Over-constrained diagnosis | `impossible-spread` showed the scheduling deadlock pattern |
