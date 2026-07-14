# Lab: Your First Cluster — Minikube Setup & Exploration

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | `minikube`, `kubectl`, and Docker installed |
| **Difficulty** | 🟢 Beginner |
| **What you'll do** | Start a cluster, explore every component, poke the API Server directly |

## Objectives

- [ ] Start a Minikube cluster and verify all control plane components are running
- [ ] Inspect a node and understand what the output means
- [ ] Navigate the cluster using `kubectl get`, `describe`, and `cluster-info`
- [ ] Access the Kubernetes Dashboard
- [ ] Call the API Server directly with `curl`

---

## Setup

```bash
# Verify your tools are installed
kubectl version --client
minikube version
docker version

# Start minikube with 2 CPUs and 2GB RAM
minikube start --cpus=2 --memory=2048
```

**Expected output:**
```
😄  minikube v1.33.x on Linux
✨  Using the docker driver based on existing profile
👍  Starting "minikube" primary control-plane node in "minikube" cluster
🚜  Pulling base image v0.0.44 ...
🔄  Restarting existing docker container for "minikube" ...
🐳  Preparing Kubernetes v1.30.x on Docker 26.x.x ...
🔎  Verifying Kubernetes components...
🌟  Enabled addons: storage-provisioner, default-storageclass
🏄  Done! kubectl is now configured to use "minikube" cluster and "default" namespace by default
```

---

## Exercise 1: Verify the Cluster is Healthy

**What we're doing:** Check that all control plane components are running and the node is ready.

```bash
kubectl cluster-info
```

**Expected output:**
```
Kubernetes control plane is running at https://192.168.49.2:8443
CoreDNS is running at https://192.168.49.2:8443/api/v1/namespaces/kube-system/services/kube-dns:dns/proxy

To further debug and diagnose cluster problems, use 'kubectl cluster-info dump'.
```

> 💡 **What just happened?** `cluster-info` shows the API Server URL and any running cluster services. The IP `192.168.49.2` is the Minikube VM's internal IP.

```bash
# Check node status
kubectl get nodes
```

**Expected output:**
```
NAME       STATUS   ROLES           AGE   VERSION
minikube   Ready    control-plane   5m    v1.30.x
```

```bash
# Get more detail
kubectl get nodes -o wide
```

**Expected output:**
```
NAME       STATUS   ROLES           AGE   VERSION    INTERNAL-IP    EXTERNAL-IP   OS-IMAGE             KERNEL-VERSION   CONTAINER-RUNTIME
minikube   Ready    control-plane   5m    v1.30.x    192.168.49.2   <none>        Ubuntu 22.04.4 LTS   5.15.x           containerd://1.7.x
```

Note the `CONTAINER-RUNTIME` column — you can see containerd is what's actually running your containers.

---

## Exercise 2: Inspect the Control Plane Pods

**What we're doing:** Kubernetes runs its own control plane as pods in the `kube-system` namespace.

```bash
kubectl get pods -n kube-system
```

**Expected output:**
```
NAME                               READY   STATUS    RESTARTS   AGE
coredns-5dd5756b68-abcde           1/1     Running   0          10m
etcd-minikube                      1/1     Running   0          10m
kube-apiserver-minikube            1/1     Running   0          10m
kube-controller-manager-minikube   1/1     Running   0          10m
kube-proxy-xxxxx                   1/1     Running   0          10m
kube-scheduler-minikube            1/1     Running   0          10m
storage-provisioner                1/1     Running   0          10m
```

> 💡 **What just happened?** The control plane runs as pods! Each component (etcd, API server, scheduler, controller manager) is a pod managed by the kubelet. This is called a **static pod** — defined directly in `/etc/kubernetes/manifests/` on the node, not via the API.

```bash
# Describe the API server pod
kubectl describe pod kube-apiserver-minikube -n kube-system | head -30
```

Look at the `Image:` line — you'll see the exact version of the API server binary being used.

---

## Exercise 3: Deeply Inspect the Node

```bash
kubectl describe node minikube
```

This is a long output. Here's what to focus on:

```bash
# Pipe through grep to extract key sections
kubectl describe node minikube | grep -A5 "Conditions:"
kubectl describe node minikube | grep -A5 "Allocatable:"
kubectl describe node minikube | grep -A10 "Allocated resources:"
```

**What to look for:**

| Section | What it tells you |
|---------|-------------------|
| `Conditions` | Is the node healthy? DiskPressure, MemoryPressure, Ready |
| `Allocatable` | How much CPU/memory pods can use |
| `Allocated resources` | How much is already used by running pods |
| `Events` | Recent node-level events |

---

## Exercise 4: Explore All Namespaces

**What we're doing:** Everything in K8s lives in a namespace. Let's see what's already there.

```bash
kubectl get namespaces
```

**Expected output:**
```
NAME              STATUS   AGE
default           Active   15m
kube-node-lease   Active   15m
kube-public       Active   15m
kube-system       Active   15m
```

| Namespace | Purpose |
|-----------|---------|
| `default` | Where your workloads go unless you specify otherwise |
| `kube-system` | K8s internal components |
| `kube-public` | Readable by all; used for cluster info bootstrap |
| `kube-node-lease` | Node heartbeat lease objects |

```bash
# See EVERYTHING in every namespace
kubectl get all --all-namespaces
```

---

## Exercise 5: Access the Dashboard

```bash
minikube dashboard
```

> 💡 **What just happened?** Minikube opens a web browser with the Kubernetes Dashboard — a visual UI for the cluster. You can see pods, deployments, services, and more. It's useful for exploration but not recommended for production management.

The dashboard opens automatically. Explore:
- **Workloads** → Pods → see the kube-system pods
- **Cluster** → Nodes → see node resource usage

Press `Ctrl+C` to stop when done.

---

## Exercise 6: Talk to the API Server Directly

Every `kubectl` command is just an HTTP request. Let's see the raw API.

```bash
# Start a proxy to the API Server (runs in background)
kubectl proxy --port=8001 &

# Now call the API directly with curl
curl http://localhost:8001/api/v1/namespaces
```

**Expected output (truncated):**
```json
{
  "kind": "NamespaceList",
  "apiVersion": "v1",
  "items": [
    { "metadata": { "name": "default" } },
    { "metadata": { "name": "kube-system" } }
  ]
}
```

```bash
# List pods in kube-system via raw API
curl http://localhost:8001/api/v1/namespaces/kube-system/pods | python3 -m json.tool | grep '"name"' | head -10

# Stop the proxy
kill %1
```

> 💡 **What just happened?** You bypassed `kubectl` entirely and spoke directly to the Kubernetes API Server. This is exactly what `kubectl` does under the hood — it formats HTTP requests and pretty-prints the JSON responses.

---

## 🔥 Break It! Challenge

> Understand what happens when a control plane pod "disappears."

```bash
# On minikube, static pods are managed by the kubelet from manifests
minikube ssh "ls /etc/kubernetes/manifests/"
```

**Expected output:**
```
etcd.yaml  kube-apiserver.yaml  kube-controller-manager.yaml  kube-scheduler.yaml
```

These files define the control plane pods. If you delete one, the kubelet immediately recreates it. Try it:

```bash
# Move the scheduler manifest (simulating a crash)
minikube ssh "sudo mv /etc/kubernetes/manifests/kube-scheduler.yaml /tmp/"

# Watch the scheduler disappear
kubectl get pods -n kube-system -w
```

You'll see `kube-scheduler-minikube` go `Terminating`. Now create a new pod — it'll stay `Pending`:

```bash
kubectl run test-pod --image=nginx
kubectl get pod test-pod  # Status: Pending ← no scheduler!
```

Now restore it:

```bash
minikube ssh "sudo mv /tmp/kube-scheduler.yaml /etc/kubernetes/manifests/"
sleep 10
kubectl get pods -n kube-system  # Scheduler is back
kubectl get pod test-pod          # Now Running!
kubectl delete pod test-pod
```

**What you learned:** The Scheduler is needed for new pod placement. Existing pods are unaffected by its absence.

---

## Cleanup

```bash
# Everything is clean — minikube cluster keeps running for future chapters
minikube status
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | Start and verify a K8s cluster | `kubectl get nodes` shows `Ready` |
| 2 | Inspect control plane pods | `kubectl get pods -n kube-system` |
| 3 | Understand node resource allocation | `kubectl describe node minikube` |
| 4 | Navigate namespaces | `kubectl get all --all-namespaces` |
| 5 | Call the raw Kubernetes API | `curl localhost:8001/api/v1/namespaces` |
| 6 | Observe Scheduler failure impact | Pod stayed `Pending` without scheduler |
