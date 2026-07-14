# Lab: Run, Inspect, Break, and Debug Pods

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | Chapters 3.1–3.4 read, Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Create pods imperatively and declaratively, exec into them, read logs, trigger an OOMKill, debug a CrashLoopBackOff, and use init containers |

## Objectives

- [ ] Create and inspect pods using both methods
- [ ] Use `kubectl exec` to run commands inside a container
- [ ] Read logs including from previous (crashed) containers
- [ ] Trigger and diagnose an OOMKilled container
- [ ] Debug a pod stuck in CrashLoopBackOff
- [ ] Use an init container to gate a pod's startup

---

## Setup

```bash
# Create a dedicated namespace
kubectl create namespace pod-lab
kubectl config set-context --current --namespace=pod-lab
```

---

## Exercise 1: Create and Inspect a Pod

**What we're doing:** Create a pod both ways and compare the experience.

```bash
# Method A: Imperative
kubectl run nginx-imperative --image=nginx:1.25

# Method B: Declarative
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: nginx-declarative
  namespace: pod-lab
  labels:
    method: declarative
    app: nginx
spec:
  containers:
  - name: nginx
    image: nginx:1.25
    ports:
    - containerPort: 80
    resources:
      requests:
        memory: "32Mi"
        cpu: "50m"
      limits:
        memory: "64Mi"
        cpu: "100m"
EOF

# Watch both come up
kubectl get pods -w
```

**Expected output:**
```
NAME                READY   STATUS              RESTARTS   AGE
nginx-declarative   0/1     ContainerCreating   0          2s
nginx-imperative    0/1     ContainerCreating   0          5s
nginx-declarative   1/1     Running             0          4s
nginx-imperative    1/1     Running             0          7s
```

Now deep-inspect:

```bash
# Full YAML of what's actually stored in K8s
kubectl get pod nginx-declarative -o yaml

# Human-readable summary with events
kubectl describe pod nginx-declarative
```

Look for these in `describe` output:
- `QoS Class:` — should be `Burstable`
- `Node:` — which minikube node
- `IP:` — the pod's internal IP
- `Events:` — the pull/start sequence

---

## Exercise 2: Exec and Port-Forward

**What we're doing:** Get inside a running container and access it from your laptop.

```bash
# Get a shell inside the nginx container
kubectl exec -it nginx-declarative -- bash

# Inside the container — explore
hostname          # Pod name
cat /etc/hostname # Same
env | grep KUBERNETES  # K8s injects these env vars
curl localhost    # Access nginx from inside
exit

# Port-forward to access from your host
kubectl port-forward pod/nginx-declarative 8080:80 &
curl http://localhost:8080
echo "Response received!"
kill %1
```

**Expected curl output:**
```html
<!DOCTYPE html>
<html>
<head><title>Welcome to nginx!</title></head>
...
```

> 💡 **What just happened?** `kubectl exec` opens a shell inside the running container's filesystem and process space. `port-forward` tunnels traffic from your laptop's port 8080 through the kubectl proxy to the pod's port 80.

---

## Exercise 3: Logs and Log Tailing

```bash
# View nginx access logs
kubectl logs nginx-declarative

# Follow logs in real time
kubectl logs nginx-declarative -f &

# In another command, generate some traffic
kubectl port-forward pod/nginx-declarative 8080:80 &
for i in {1..5}; do curl -s http://localhost:8080 > /dev/null; done

# You should see log entries appear in the -f stream
kill %1 %2

# Logs since a timestamp
kubectl logs nginx-declarative --since=5m

# Last N lines
kubectl logs nginx-declarative --tail=20
```

---

## Exercise 4: Trigger and Diagnose CrashLoopBackOff

**What we're doing:** Intentionally create a crashing pod and walk through the full debugging flow.

```bash
# Pod that exits immediately with an error message
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: crashloop-demo
  namespace: pod-lab
spec:
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "echo 'ERROR: Database connection refused at postgres:5432'; exit 1"]
  restartPolicy: Always
EOF
```

Watch the CrashLoopBackOff progression:

```bash
kubectl get pod crashloop-demo -w
```

**Expected output:**
```
NAME              READY   STATUS              RESTARTS   AGE
crashloop-demo    0/1     ContainerCreating   0          1s
crashloop-demo    0/1     Error               0          3s
crashloop-demo    0/1     CrashLoopBackOff    1          8s
crashloop-demo    0/1     Error               2          28s
crashloop-demo    0/1     CrashLoopBackOff    3          52s
```

Now debug:

```bash
# Step 1: Get the error from logs (current run — might be empty after restart)
kubectl logs crashloop-demo

# Step 2: Get logs from the PREVIOUS crash
kubectl logs crashloop-demo --previous

# Step 3: See restart count and last exit code
kubectl describe pod crashloop-demo | grep -A15 "Containers:"

# Step 4: Check via JSONPath
kubectl get pod crashloop-demo -o jsonpath='{.status.containerStatuses[0].lastState.terminated}'
```

**Expected output from `--previous` logs:**
```
ERROR: Database connection refused at postgres:5432
```

**Key fields from describe:**
```
    State:          Waiting
      Reason:       CrashLoopBackOff
    Last State:     Terminated
      Reason:       Error
      Exit Code:    1
      Started:      Mon, 14 Jul 2026 10:00:05 +0000
      Finished:     Mon, 14 Jul 2026 10:00:05 +0000
    Ready:          False
    Restart Count:  4
```

```bash
# Cleanup
kubectl delete pod crashloop-demo
```

---

## Exercise 5: Trigger an OOMKill

**What we're doing:** Set a very low memory limit and watch the container get killed by the kernel.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: oomkill-demo
  namespace: pod-lab
spec:
  containers:
  - name: memory-hog
    image: polinux/stress
    command: ["stress"]
    args: ["--vm", "1", "--vm-bytes", "150M", "--vm-hang", "1"]
    resources:
      requests:
        memory: "50Mi"
      limits:
        memory: "100Mi"   # Container will try to use 150M but limit is 100M
  restartPolicy: Never
EOF
```

Watch it get OOMKilled:

```bash
kubectl get pod oomkill-demo -w
```

**Expected output:**
```
NAME           READY   STATUS      RESTARTS   AGE
oomkill-demo   0/1     Pending     0          1s
oomkill-demo   1/1     Running     0          3s
oomkill-demo   0/1     OOMKilled   0          5s
oomkill-demo   0/1     Completed   0          5s
```

Diagnose it:

```bash
# Confirm OOMKill via exit code (137 = killed by signal 9)
kubectl get pod oomkill-demo -o jsonpath='{.status.containerStatuses[0].state.terminated.reason}'
# Output: OOMKilled

kubectl get pod oomkill-demo -o jsonpath='{.status.containerStatuses[0].state.terminated.exitCode}'
# Output: 137

# Full terminated state
kubectl describe pod oomkill-demo | grep -A10 "Last State:"
```

> 💡 **What just happened?** The container tried to allocate 150Mi of RAM, but the limit was 100Mi. The kernel's OOM killer terminated the process. Exit code 137 = killed by SIGKILL (128 + 9). The fix: either raise the memory limit or fix the memory leak in your app.

```bash
kubectl delete pod oomkill-demo
```

---

## Exercise 6: Init Container Gate

**What we're doing:** Use an init container to simulate a dependency check that gates the main app.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: init-demo
  namespace: pod-lab
spec:
  initContainers:
  - name: delay-start
    image: busybox
    command: ["sh", "-c", "echo 'Init: running preflight checks...'; sleep 10; echo 'Init: all checks passed!'"]

  containers:
  - name: app
    image: nginx:1.25
    resources:
      requests:
        memory: "32Mi"
        cpu: "50m"
      limits:
        memory: "64Mi"
        cpu: "100m"
EOF
```

Watch the init container run first:

```bash
kubectl get pod init-demo -w
```

**Expected progression:**
```
NAME        READY   STATUS     RESTARTS   AGE
init-demo   0/1     Init:0/1   0          2s
init-demo   0/1     Init:0/1   0          5s
init-demo   0/1     PodInitializing   0   11s
init-demo   1/1     Running    0          12s
```

See the init container logs:

```bash
kubectl logs init-demo -c delay-start
```

**Expected output:**
```
Init: running preflight checks...
Init: all checks passed!
```

```bash
kubectl delete pod init-demo
```

---

## 🔥 Break It! Challenge

> What happens when you try to schedule a pod that's too big for the node?

```bash
# Minikube has ~2GB RAM. Request more than exists.
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: toobig-pod
  namespace: pod-lab
spec:
  containers:
  - name: app
    image: nginx:1.25
    resources:
      requests:
        memory: "100Gi"   # 100GB on a 2GB node
        cpu: "64"         # 64 cores on a 2-core node
EOF

# See it stuck in Pending
kubectl get pod toobig-pod

# Find out WHY it's Pending
kubectl describe pod toobig-pod | grep -A10 "Events:"
```

**Expected event:**
```
Warning  FailedScheduling  0/1 nodes are available: 1 Insufficient memory, 1 Insufficient cpu.
```

The Scheduler found **zero** nodes that could satisfy the request. The pod stays Pending indefinitely.

```bash
kubectl delete pod toobig-pod
```

---

## Cleanup

```bash
# Delete all pods in the lab namespace
kubectl delete pod --all -n pod-lab

# Switch back to default namespace
kubectl config set-context --current --namespace=default

# Delete the lab namespace
kubectl delete namespace pod-lab
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | Create pods imperatively and declaratively | Both nginx pods ran successfully |
| 2 | Exec into a container | Ran `hostname`, `curl localhost` inside the pod |
| 3 | Read and tail logs | Captured nginx access logs with `-f` |
| 4 | Debug CrashLoopBackOff | Used `logs --previous` to find the error message |
| 5 | Diagnose OOMKilled | Confirmed exit code 137 and `OOMKilled` reason |
| 6 | Use init containers | Watched `Init:0/1` gate the main container |
| 7 | Understand scheduling failures | Saw `Insufficient memory` error for oversized pod |
