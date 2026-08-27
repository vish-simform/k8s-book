# Appendix C: Common Kubernetes Error Reference

> **Quick lookup for error messages you'll encounter in the wild.**

---

## Pod Errors

### CrashLoopBackOff

**What it is:** Container starts and exits repeatedly. Kubernetes exponentially backs off restarts.

**Immediate check:**
```bash
kubectl logs <pod> --previous
kubectl describe pod <pod> | grep "Exit Code"
```

**Causes:**
- Exit code 1: Application error (check logs)
- Exit code 127: Binary not found in image
- Exit code 137: OOMKilled (memory limit exceeded)
- Exit code 139: Segfault

---

### ImagePullBackOff / ErrImagePull

**What it is:** Kubelet can't pull the container image.

**Immediate check:**
```bash
kubectl describe pod <pod> | grep -A 5 "Events"
```

**Causes and fixes:**

| Error | Cause | Fix |
|---|---|---|
| `404 Not Found` | Tag doesn't exist | Verify tag exists in registry |
| `401 Unauthorized` | No credentials | Add `imagePullSecret` |
| `context deadline exceeded` | Network timeout | Check node → registry connectivity |
| `name unknown` | Wrong image name | Check for typos in image path |

---

### OOMKilled

**What it is:** Container exceeded `limits.memory`. Kernel killed it with SIGKILL (exit code 137).

**Immediate check:**
```bash
kubectl describe pod <pod> | grep -A 3 "Last State"
kubectl top pod <pod>
```

**Fix:** Increase `limits.memory` or fix application memory leak.

---

### Evicted

**What it is:** Node was under memory or disk pressure; pod was evicted to free resources.

**Immediate check:**
```bash
kubectl describe pod <pod> | grep "Reason"
kubectl describe node <node> | grep -A 5 "Conditions"
```

**Fix:** Check node disk/memory usage. Free up space or add nodes.

---

### CreateContainerConfigError

**What it is:** Pod spec references a Secret or ConfigMap that doesn't exist.

**Immediate check:**
```bash
kubectl describe pod <pod> | grep -A 5 "Events"
```

**Common pattern:**
```
Error: secret "db-credentials" not found
```

**Fix:** Create the missing Secret or ConfigMap before the pod.

---

### Terminating (stuck)

**What it is:** Pod is stuck in `Terminating` state — usually because a finalizer isn't clearing or the node is unreachable.

**Fix:**
```bash
# Force delete
kubectl delete pod <pod> --grace-period=0 --force

# If still stuck: remove finalizers
kubectl patch pod <pod> -p '{"metadata":{"finalizers":[]}}' --type=merge
```

---

## Scheduling Errors

### FailedScheduling: Insufficient CPU/Memory

```
0/3 nodes are available: 3 Insufficient cpu.
```

**Fix:** Reduce pod `requests`, remove unused pods, or add nodes.

---

### FailedScheduling: node(s) had taints

```
0/1 nodes are available: 1 node(s) had untolerated taint {node-role.kubernetes.io/control-plane:NoSchedule}
```

**Fix:** Add matching toleration to pod spec, or target a worker node.

---

### FailedScheduling: didn't match node affinity

```
0/3 nodes are available: 3 node(s) didn't match Pod's node affinity/selector.
```

**Fix:** Relax `nodeAffinity` rules or label a node with the required label.

---

## Storage Errors

### ProvisioningFailed: no provisioner found

```
no provisioner found for "fast-ssd" in storage classes
```

**Fix:** Use an existing StorageClass (`kubectl get storageclass`) or install the CSI driver.

---

### Multi-Attach error for volume

```
Multi-Attach error: volume is already used by pod(s) on node worker-1
```

**What it is:** A ReadWriteOnce volume is still "attached" to a node while another pod on a different node tries to attach it.

**Fix:**
```bash
kubectl delete pod <old-pod> --grace-period=0 --force
# Wait 30-60 seconds for the volume to detach
```

---

### MountVolume.MountDevice failed

**What it is:** Volume exists and is attached, but couldn't be formatted or mounted on the node.

**Check:** Look at CSI node plugin logs:
```bash
kubectl logs -n kube-system -l app=csi-node-driver
```

---

## Networking Errors

### Service — No Endpoints

```bash
kubectl describe service my-svc
# Endpoints: <none>
```

**What it is:** Service selector labels don't match any pod labels.

**Fix:**
```bash
kubectl get pods --show-labels     # what labels do pods have?
kubectl edit service my-svc        # fix the selector
```

---

### DNS Resolution Failure

```
nslookup: can't resolve 'my-service': Name or service not known
```

**Check:**
```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns
```

---

### Connection Refused

```
curl: (7) Failed to connect to 10.96.55.100 port 80: Connection refused
```

**Causes:**
- Wrong port in Service (`port` vs `targetPort`)
- App not listening on the port
- Service selector doesn't match pod

---

## RBAC Errors

### Forbidden: User cannot list resource

```
Error from server (Forbidden): pods is forbidden: User "jane" cannot list resource "pods"
in API group "" in the namespace "production"
```

**Fix:** Create a Role/ClusterRole with the required permissions and bind it to the user.

```bash
kubectl create role pod-reader \
  --verb=get,list,watch --resource=pods -n production
kubectl create rolebinding jane-pod-reader \
  --role=pod-reader --user=jane -n production
```

---

## API Errors

### No matches for kind X in version Y

```
error: unable to recognize "manifest.yaml": no matches for kind "Ingress" in version "extensions/v1beta1"
```

**Fix:** You're using a deprecated API version. Update to the current stable version:
- `Ingress`: use `networking.k8s.io/v1` (not `extensions/v1beta1`)
- `CronJob`: use `batch/v1` (not `batch/v1beta1`)

```bash
# Check current API versions
kubectl api-resources | grep ingress
kubectl api-versions | grep networking
```

---

### server-side apply: conflict

```
Apply failed with 1 conflict: conflict with "kubectl-client-side-apply":
```

**Fix:**
```bash
# Force override (take ownership of fields)
kubectl apply -f manifest.yaml --force-conflicts --server-side
```

---

## Exit Code Reference

| Exit Code | Signal | Meaning |
|---|---|---|
| `0` | — | Success |
| `1` | — | General application error |
| `2` | — | Misuse of shell command |
| `125` | — | Container failed to run |
| `126` | — | Command not executable |
| `127` | — | Command not found |
| `130` | SIGINT (2) | Container interrupted (Ctrl+C) |
| `137` | SIGKILL (9) | OOMKilled or force-killed |
| `139` | SIGSEGV (11) | Segmentation fault |
| `143` | SIGTERM (15) | Graceful termination |

---

## ✅ Quick Check

**Q1:** What is the difference between container exit code 137 and exit code 143?

<details>
<summary>Answer</summary>
Exit code 137 represents <code>128 + 9 (SIGKILL)</code>, which means the process was abruptly terminated without chance to clean up — most commonly caused by the Linux OOM Killer when exceeding memory limits or failing to terminate before <code>terminationGracePeriodSeconds</code> expired. Exit code 143 represents <code>128 + 15 (SIGTERM)</code>, indicating standard graceful shutdown.
</details>

**Q2:** When debugging a `Connection refused` error on a Service, what are the top 2 things to verify with `kubectl`?

<details>
<summary>Answer</summary>
1. Check that the Service's <code>spec.selector</code> matches the labels on your target pods (verify with <code>kubectl get endpoints &lt;svc-name&gt;</code> to ensure endpoints are listed).<br/>
2. Check that the Service's <code>spec.ports[*].targetPort</code> matches the actual port your application container is listening on.
</details>

