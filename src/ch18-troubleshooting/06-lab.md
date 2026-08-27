# Lab: The Kubernetes Debugging Gauntlet

⏱️ **~30 min hands-on** · 🔴 Advanced

| | |
|---|---|
| **Prerequisites** | Chapters 18.1–18.5 read, Minikube running |
| **Difficulty** | 🔴 Advanced |
| **What you'll do** | Debug five real-world broken workloads: ImagePullBackOff, CrashLoopBackOff, OOMKilled, Missing Secret Mount, and Network DNS resolution failures |

## Objectives

- [ ] Diagnose and fix image pull failures (`ErrImagePull`, `ImagePullBackOff`)
- [ ] Inspect crash history using `kubectl logs --previous` on `CrashLoopBackOff` pods
- [ ] Identify OOMKills (`ExitCode: 137`) in pod events and container termination states
- [ ] Diagnose pods stuck in `ContainerCreating` / `CreateContainerConfigError` due to missing Config/Secrets
- [ ] Troubleshoot service discovery and DNS issues using the `nicolaka/netshoot:v0.13` tool container

---

## Setup

```bash
# Create an isolated debugging namespace
kubectl create namespace gauntlet-lab
kubectl config set-context --current --namespace=gauntlet-lab
```

---

## Challenge 1: The Phantom Image (`ImagePullBackOff`)

**Scenario:** A deployment was committed with a typo in the image tag.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: broken-image
  namespace: gauntlet-lab
spec:
  containers:
  - name: app
    image: nginx:1.25-nonexistent-tag
EOF
```

**Diagnose:**
```bash
kubectl get pods
# STATUS will show ErrImagePull -> ImagePullBackOff

kubectl describe pod broken-image | grep -A5 Events
```

**Expected output:**
```
Failed to pull image "nginx:1.25-nonexistent-tag": rpc error: code = NotFound desc = failed to pull and unpack image ...
Error: ImagePullBackOff
```

**Fix:**
```bash
# Update the image to a valid pinned tag
kubectl set image pod/broken-image app=nginx:1.25-alpine
```

---

## Challenge 2: The Crashing Entrypoint (`CrashLoopBackOff`)

**Scenario:** An application container boots, immediately encounters a fatal configuration error or bad command, and exits.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: crashing-app
  namespace: gauntlet-lab
spec:
  containers:
  - name: backend
    image: busybox:1.36
    command: ["sh", "-c", "echo 'Booting service...'; sleep 2; echo 'Fatal: DB config missing!'; exit 1"]
EOF
```

**Diagnose:**
```bash
kubectl get pods -w
# Pod transitions from Running -> Error -> CrashLoopBackOff

# Inspect the previous container run's exit logs
kubectl logs crashing-app --previous
```

**Expected output:**
```
Booting service...
Fatal: DB config missing!
```

`kubectl logs --previous` captures logs from the terminated instance before the restart backoff kicked in.

---

## Challenge 3: The Memory Ceiling (`OOMKilled`)

**Scenario:** A container exceeds its specified memory limit during peak computation.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: memory-hog
  namespace: gauntlet-lab
spec:
  containers:
  - name: hog
    image: python:3.12-slim
    resources:
      limits:
        memory: "32Mi"
    command: ["python", "-c", "a = ' ' * 100 * 1024 * 1024"] # Tries to allocate 100MB
EOF
```

**Diagnose:**
```bash
kubectl describe pod memory-hog | grep -E "(OOMKilled|Exit Code|Reason)"
```

**Expected output:**
```
State:          Terminated
  Reason:       OOMKilled
  Exit Code:    137
```
*Exit Code 137 = 128 + Signal 9 (SIGKILL from Linux OOM Killer).*

---

## Challenge 4: The Missing Secret Dependency

**Scenario:** A pod requires a secret that hasn't been created yet in the namespace.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: secret-dependent
  namespace: gauntlet-lab
spec:
  containers:
  - name: web
    image: nginx:1.25-alpine
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: db-credentials
          key: password
EOF
```

**Diagnose:**
```bash
kubectl get pods
# STATUS: CreateContainerConfigError

kubectl describe pod secret-dependent | grep -A5 Events
```

**Expected output:**
```
Warning  Failed  ...  Error: secret "db-credentials" not found
```

**Fix:**
```bash
kubectl create secret generic db-credentials --from-literal=password=SuperSecret123!
# Pod automatically recovers and starts within a few seconds!
```

---

## Challenge 5: Network Debugging with Netshoot

**Scenario:** You need to debug network connectivity and DNS resolution from inside the cluster.

```bash
# Run a temporary diagnostic container attached to the gauntlet-lab network
kubectl run netshoot --rm -i --tty --image=nicolaka/netshoot:v0.13 -- /bin/bash
```

Inside the Netshoot terminal:
```bash
# Test CoreDNS resolution
nslookup kubernetes.default.svc.cluster.local

# Test HTTP connectivity to another namespace
curl -I http://kubernetes.default.svc.cluster.local:443 --insecure

# Exit netshoot
exit
```

---

## Cleanup

```bash
kubectl delete namespace gauntlet-lab
kubectl config set-context --current --namespace=default
```

---

## ✅ Quick Check

**Q1:** What does `Exit Code 137` indicate when viewing container termination state?

<details>
<summary>Answer</summary>
Exit code 137 indicates the container was terminated by <code>SIGKILL</code> (Signal 9, 128 + 9 = 137). When combined with <code>Reason: OOMKilled</code>, it proves the Linux kernel killed the container process because it exceeded its cgroup memory limit (or the node ran completely out of memory).
</details>

**Q2:** When a pod is stuck in `CreateContainerConfigError`, what should you check first?

<details>
<summary>Answer</summary>
Run <code>kubectl describe pod &lt;pod-name&gt;</code> and look at the Events section at the bottom. It will explicitly name the missing <code>Secret</code> or <code>ConfigMap</code> and the exact missing key.
</details>
