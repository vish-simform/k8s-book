# Lab: Tracing a Pod's Journey Through the Cluster

⏱️ **~25 min hands-on** · 🟡 Intermediate

| | |
|---|---|
| **Prerequisites** | Chapters 17.1–17.5 read, Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Trace a pod's lifecycle from API submission to etcd storage, scheduler decision, CRI container runtime execution, and CNI/CSI attachment |

## Objectives

- [ ] Watch real-time events and API server interactions during pod creation
- [ ] Inspect raw pod records directly in etcd
- [ ] Trace scheduler scoring and assignment
- [ ] Inspect the CRI pause container and task runtime via `crictl`
- [ ] Inspect CNI network namespace and interface creation

---

## Setup

```bash
# Create a dedicated namespace for internals lab
kubectl create namespace internals-lab
kubectl config set-context --current --namespace=internals-lab
```

---

## Exercise 1: Live Event Stream and API Submission

**What we're doing:** Open a watch stream on cluster events to observe the sequence of control-plane notifications during pod admission and creation.

In Terminal 1 (Watch events):
```bash
# In terminal 1: Stream events filtered for our target pod
kubectl get events -n internals-lab -w --field-selector involvedObject.name=trace-demo
```

In Terminal 2 (Create pod):
```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: trace-demo
  namespace: internals-lab
  labels:
    app: trace-demo
spec:
  containers:
  - name: web
    image: nginx:1.25-alpine
    resources:
      requests:
        memory: "32Mi"
        cpu: "50m"
      limits:
        memory: "64Mi"
        cpu: "100m"
EOF
```

**What to look for in Terminal 1:**
Notice the chronological order of events:
1. `Scheduled`: `default-scheduler` successfully assigned `internals-lab/trace-demo` to node `minikube`
2. `Pulling`: `kubelet` pulling image `nginx:1.25-alpine`
3. `Pulled`: Successfully pulled image
4. `Created`: Created container `web`
5. `Started`: Started container `web`

---

## Exercise 2: Inspecting Raw Keys in etcd

**What we're doing:** Access the control plane's etcd key-value store to verify how the pod definition and status are serialized.

```bash
# Query the pod object directly from etcd in the static etcd pod
kubectl exec -it etcd-minikube -n kube-system -- \
  etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/var/lib/minikube/certs/etcd/ca.crt \
  --cert=/var/lib/minikube/certs/etcd/healthcheck-client.crt \
  --key=/var/lib/minikube/certs/etcd/healthcheck-client.key \
  get /registry/pods/internals-lab/trace-demo --print-value-only | head -c 200
```

**Expected output:**
You will see protobuf-encoded binary data containing metadata, specs, and status for `trace-demo`.

To list all pods stored in etcd:
```bash
kubectl exec -it etcd-minikube -n kube-system -- \
  etcdctl \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/var/lib/minikube/certs/etcd/ca.crt \
  --cert=/var/lib/minikube/certs/etcd/healthcheck-client.crt \
  --key=/var/lib/minikube/certs/etcd/healthcheck-client.key \
  get /registry/pods --prefix --keys-only
```

---

## Exercise 3: Inspecting the CRI Runtime & Pause Container

**What we're doing:** SSH into the worker node to see how containerd/CRI isolates the pod using the `pause` container.

```bash
# SSH into Minikube and list CRI containers
minikube ssh -- sudo crictl ps --name web
```

**Expected output:**
```
CONTAINER           IMAGE               CREATED             STATE               NAME                ATTEMPT             POD ID
abc123456789        nginx:1.25-alpine   ...                 Running             web                 0                   def987654321
```

Now inspect the pod sandbox:
```bash
# List CRI pod sandboxes
minikube ssh -- sudo crictl pods --name trace-demo

# Inspect container runtime details
CONTAINER_ID=$(minikube ssh -- sudo crictl ps --name web -q)
minikube ssh -- sudo crictl inspect $CONTAINER_ID | grep -E "(pid|ip|cgroups)"
```

Observe that CRI assigns Linux cgroups for the memory and CPU limits defined in your Pod spec.

---

## Exercise 4: Tracing Scheduler Decisions

**What we're doing:** Inspect the scheduler's node assignment events and pod conditions.

```bash
kubectl describe pod trace-demo -n internals-lab | grep -A10 Conditions
```

**Expected output:**
```
Conditions:
  Type              Status
  Initialized       True 
  Ready             True 
  ContainersReady   True 
  PodScheduled      True 
```

Notice the transition order: `PodScheduled` (API server + kube-scheduler) → `Initialized` (Init containers) → `ContainersReady` (CRI containers started) → `Ready` (Readiness probes passed).

---

## Cleanup

```bash
kubectl delete namespace internals-lab
kubectl config set-context --current --namespace=default
```

---

## ✅ Quick Check

**Q1:** Why doesn't the scheduler communicate directly with the worker node's kubelet?

<details>
<summary>Answer</summary>
In Kubernetes architecture, all control-plane and node components communicate exclusively through the <code>kube-apiserver</code>. The scheduler watches the API server for unassigned pods (<code>spec.nodeName == ""</code>), computes the best node, and writes the binding back to the API server. The node's <code>kubelet</code> watches the API server for pods assigned to its specific node name. This decoupling provides security, auditing, resilience, and horizontal scalability.
</details>

**Q2:** When `crictl pods` shows a Pod Sandbox, what Linux primitives were created before the application container started?

<details>
<summary>Answer</summary>
The CRI runtime created the Linux network, IPC, and UTS namespaces anchored by the <code>pause</code> container, called CNI plugins to allocate an IP address and configure the veth pair and routes, and configured cgroups for CPU and memory resource accounting.
</details>
