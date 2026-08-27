# 18.4 Storage and Permission Issues

⏱️ **6 min read · 7 min hands-on** · 🔴 Advanced

> **TL;DR:** Storage bugs in Kubernetes almost always fall into three categories: the volume wasn't provisioned, it can't be mounted (because it's already attached elsewhere or the node doesn't have the driver), or the container can't write to it (filesystem permissions).

> **After this section you will be able to:**
> - Debug `Pending` PVCs caused by missing StorageClasses or capacity constraints
> - Resolve `Multi-Attach error for volume` when RWO volumes are locked by other nodes
> - Fix container filesystem permission denied errors using `securityContext.fsGroup`

---

## The Storage Debug Sequence

```bash
# 1. Check the PVC status
kubectl get pvc -n <namespace>

# 2. If PVC is not Bound, check the PV
kubectl get pv

# 3. Describe the failing pod for mount errors
kubectl describe pod <pod-name> | grep -A 10 "Events:"

# 4. If pod is running but can't write, exec in and check permissions
kubectl exec -it <pod-name> -- ls -la /data
```

---

## Problem 1: PVC Stuck in Pending

```bash
kubectl get pvc
```

```
NAME        STATUS    VOLUME   CAPACITY   STORAGECLASS   AGE
my-data     Pending                       standard       5m
```

### Causes

**Cause A: No matching PV (static provisioning)**

```bash
kubectl get pv
# No PVs listed, or existing PVs don't match (wrong capacity, wrong access mode)
```

Fix: Create a PV manually (if not using dynamic provisioning) or check the StorageClass.

**Cause B: StorageClass doesn't exist**

```bash
kubectl describe pvc my-data | grep Events -A 5
```

```
Events:
  Warning  ProvisioningFailed  2m  provisioner  no provisioner found for "fast-ssd"
```

```bash
# List available StorageClasses
kubectl get storageclass
```

Fix: Use an existing StorageClass name, or install the appropriate CSI driver.

**Cause C: ReadWriteMany not supported**

```bash
Events:
  Warning  ProvisioningFailed  1m  provisioner  
    requested access modes [ReadWriteMany] not supported by driver
```

Most block storage (EBS, Azure Disk) only supports **ReadWriteOnce**. ReadWriteMany requires NFS, CephFS, or similar.

---

## Problem 2: Pod Stuck in ContainerCreating — Volume Mount Failure

```bash
kubectl describe pod my-pod | grep -A 15 Events
```

Common mount errors and their meanings:

| Event Message | Cause | Fix |
|---|---|---|
| `Unable to attach or mount volumes` | Volume in wrong zone/region | Ensure pod and PV are in same AZ |
| `Multi-Attach error for volume` | RWO volume already attached to another node | Delete old pod first, or use RWX |
| `MountVolume.MountDevice failed` | CSI driver crash or filesystem error | Check CSI node plugin pod logs |
| `secret "x" not found` | Secret referenced in volume doesn't exist | Create the Secret before the pod |
| `configmap "x" not found` | ConfigMap doesn't exist | Create the ConfigMap first |

### Multi-Attach Error (RWO Stuck)

This is the most common production storage incident:

```
Warning  FailedAttachVolume  2m  attachdetach-controller  
  Multi-Attach error for volume "pvc-abc123": 
  volume is already used by pod(s) old-pod-xyz on node worker-1
```

**What happened:** A pod was on `worker-1`, got rescheduled to `worker-2`, but the disk is still "attached" to `worker-1` (the old pod didn't cleanly detach).

**Fix:**

```bash
# Step 1: Force-delete the old pod (stuck terminating)
kubectl delete pod old-pod-xyz --grace-period=0 --force

# Step 2: Wait for the volume to detach (30-60 seconds)
kubectl get pvc my-data -w

# Step 3: New pod should now attach successfully
```

> ⚠️ **Warning:** Force-deleting pods is risky if the node is actually still running them (split-brain). Only do this if you're sure the old node/pod is truly gone or the pod genuinely terminated.

---

## Problem 3: Permission Denied When Writing to Volume

**Symptom:** Pod is Running, but the app can't write to the mounted volume.

```bash
kubectl exec -it my-pod -- ls -la /data
```

```
drwxr-xr-x 2 root root 4096 ...   ← owned by root
```

The container runs as a non-root user (e.g., UID 1000) but the directory is owned by root. Classic permission mismatch.

### Fix: fsGroup in securityContext

```yaml
spec:
  securityContext:
    fsGroup: 2000          # All files created in volumes will be owned by GID 2000
    runAsUser: 1000        # Container runs as UID 1000
  containers:
    - name: app
      image: my-app:v1
      volumeMounts:
        - name: data
          mountPath: /data
```

With `fsGroup: 2000`, Kubernetes will `chown` the mounted volume to GID 2000 before starting the container. The container running as UID 1000 must be a member of GID 2000.

### Fix: initContainer to chmod (last resort)

```yaml
initContainers:
  - name: fix-permissions
    image: busybox:1.36
    command: ["sh", "-c", "chmod -R 777 /data"]
    volumeMounts:
      - name: data
        mountPath: /data
```

> 💡 **Tip:** Using `fsGroup` is cleaner and more secure than `chmod 777`. The init container approach is a workaround — use `fsGroup` whenever possible.

---

## Problem 4: Data Not Persisting After Pod Restart

**Symptom:** Your app writes data, pod restarts, data is gone.

```bash
# Check if it's a PVC or a plain emptyDir
kubectl get pod my-pod -o yaml | grep volumes -A 20
```

```yaml
volumes:
  - name: data
    emptyDir: {}    ← THIS is the problem! emptyDir is ephemeral!
```

`emptyDir` is deleted when the pod is deleted or rescheduled. You need a **PersistentVolumeClaim**.

```yaml
# Fix: replace emptyDir with a PVC
volumes:
  - name: data
    persistentVolumeClaim:
      claimName: my-data-pvc   ← must exist first
```

---

## Problem 5: StorageClass Doesn't Exist

```bash
kubectl apply -f statefulset.yaml
# Error: persistentvolumeclaims "my-sts-data-0" not found

kubectl get pvc
# my-sts-data-0   Pending   ...   fast-nvme   ...

kubectl get storageclass
# NAME       PROVISIONER   ...
# standard   k8s.io/minikube-hostpath   ← "fast-nvme" doesn't exist!
```

Fix: either create the StorageClass (install the right CSI driver) or change the PVC to use an existing StorageClass:

```yaml
spec:
  storageClassName: standard   # use what actually exists
```

---

## Key Takeaways

| # | Problem | First Check |
|---|---|---|
| 1 | PVC Pending | `kubectl describe pvc` → Events → provisioning error |
| 2 | ContainerCreating | `kubectl describe pod` → Events → mount error type |
| 3 | Multi-Attach error | Force-delete old pod, wait for detach |
| 4 | Permission denied | Check ownership with `ls -la`, add `fsGroup` |
| 5 | Data not persisting | Check volume type — `emptyDir` is ephemeral |

---

## ✅ Quick Check

**Q1:** A PVC has been `Pending` for 10 minutes. `kubectl describe pvc` shows no events at all. What should you check?

<details>
<summary>Answer</summary>
The StorageClass provisioner might not be running. If no external provisioner is watching for PVC requests, nothing happens and no events are generated. Check: `kubectl get storageclass` to verify the StorageClass exists, then `kubectl get pods -n kube-system | grep csi` to see if the CSI driver pods are running. Also verify the StorageClass has a `provisioner` field and that it matches a running component.
</details>

**Q2:** Your StatefulSet pod is stuck in `ContainerCreating` with "Multi-Attach error." You've confirmed the old pod is gone. The error persists for 5 minutes. Why might this still happen?

<details>
<summary>Answer</summary>
Cloud block volumes have a "safe detach" mechanism that can take 30-90 seconds after pod termination. If the old pod was force-deleted (not gracefully terminated), the volume detach may take longer as the cloud provider waits for the node to acknowledge detachment. If the old node is completely unreachable (node failure), you may need to manually detach the volume via the cloud console (e.g., AWS EC2 → Volumes → Detach).
</details>

**Q3:** An app writes files as UID 1001. The PVC mount point is owned by `root:root` with permissions `drwxr-xr-x`. Will writes succeed?

<details>
<summary>Answer</summary>
No. `drwxr-xr-x` gives write permission only to the owner (root). UID 1001 is neither the owner nor in the group with write access. The app will get `Permission denied`. Fix: set `securityContext.fsGroup` to a GID that UID 1001 belongs to, and Kubernetes will chown the mount to that GID with group-write permission.
</details>
