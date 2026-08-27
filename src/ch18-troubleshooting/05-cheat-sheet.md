# 18.5 The Troubleshooting Cheat Sheet

⏱️ **5 min read · 4 min hands-on** · 🔴 Advanced

> **TL;DR:** This is the single-page reference you'll return to every time something breaks in Kubernetes. Bookmark it.

> **After this section you will be able to:**
> - Quickly look up universal one-liner diagnostic commands for rapid incident triage
> - Reference exit codes and failure fingerprints during active production debugging
> - Navigate common Kubernetes error messages and their verified resolution steps

---

## Universal First Commands

```bash
# The "what's wrong?" overview
kubectl get pods -A | grep -v Running | grep -v Completed
kubectl get events --all-namespaces --sort-by='.lastTimestamp' | tail -30

# Zoom into a specific broken thing
kubectl describe pod <name> -n <ns>
kubectl logs <name> -n <ns> --previous
kubectl describe node <node-name>
```

---

## Pod Status Reference

| Status | Cause | Fix |
|---|---|---|
| `Pending` | No node available | Check `describe pod` → Events → FailedScheduling |
| `ContainerCreating` | Image pull, volume mount, or CNI | Check Events for specific error |
| `CrashLoopBackOff` | Container exits immediately | `logs --previous` → check exit code |
| `OOMKilled` | Memory limit exceeded | Increase `limits.memory` or fix memory leak |
| `ImagePullBackOff` | Can't pull image | Wrong tag, bad auth, network issue |
| `Evicted` | Node under pressure | Check node conditions (disk/memory pressure) |
| `Terminating` | Stuck shutdown | Force-delete: `kubectl delete pod --grace-period=0 --force` |
| `Running` but not `Ready` | Readiness probe failing | Check probe config and app health endpoint |
| `Completed` | Job/init container finished (normal) | No action needed |

---

## Diagnosis Commands by Symptom

### My pod won't start

```bash
kubectl describe pod <name>                    # check Events section
kubectl logs <name> --previous                 # logs from last crash
kubectl get events --sort-by='.lastTimestamp'  # cluster-wide events
```

### My service doesn't work

```bash
kubectl describe service <name>                # check Endpoints (empty = label mismatch)
kubectl get pods --show-labels                 # verify pod labels match selector
kubectl exec -it debug-pod -- curl http://<pod-ip>:<port>  # bypass service
kubectl exec -it debug-pod -- nslookup <svc>   # verify DNS
```

### My DNS doesn't resolve

```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns   # CoreDNS running?
kubectl logs -n kube-system -l k8s-app=kube-dns        # CoreDNS errors?
kubectl exec -it debug-pod -- nslookup kubernetes.default  # test basic DNS
```

### My PVC is stuck

```bash
kubectl describe pvc <name>                    # check Events
kubectl get storageclass                       # does the StorageClass exist?
kubectl get pv                                 # available PVs?
kubectl get pods -n kube-system | grep csi     # CSI driver running?
```

### My pod can't write to its volume

```bash
kubectl exec -it <pod> -- ls -la /mountpath    # check ownership/permissions
kubectl get pod <name> -o yaml | grep -A5 securityContext  # check fsGroup
```

### A node is unhealthy

```bash
kubectl describe node <name>                   # check Conditions
kubectl get pods --field-selector spec.nodeName=<name>  # pods on that node
minikube ssh; sudo journalctl -u kubelet -f    # kubelet logs
```

---

## Common Error Patterns

```
# Pattern 1: CrashLoopBackOff + exit code 1
→ App is crashing. Read logs --previous. Usually: missing config, wrong command.

# Pattern 2: CrashLoopBackOff + exit code 137
→ OOMKilled. Increase memory limit or fix memory leak.

# Pattern 3: Pending + "Insufficient cpu/memory"
→ Nodes are full. Scale cluster or reduce pod requests.

# Pattern 4: Pending + "didn't tolerate"
→ Taint on node doesn't have matching toleration in pod spec.

# Pattern 5: Service + Endpoints: <none>
→ Label selector mismatch. Compare pod labels vs service selector.

# Pattern 6: ImagePullBackOff + "unauthorized"
→ Missing imagePullSecret. Create docker-registry secret.

# Pattern 7: ContainerCreating + "Multi-Attach error"
→ RWO volume still attached to old node. Force-delete old pod.

# Pattern 8: MountVolume failed + "secret not found"
→ Secret/ConfigMap referenced by volume doesn't exist in that namespace.
```

---

## kubectl Debug Quick Reference

```bash
# Drop into a running pod
kubectl exec -it <pod> -- /bin/sh

# Inject a debug container (K8s 1.23+)
kubectl debug -it <pod> --image=nicolaka/netshoot:v0.13 --target=<container>

# Copy a crashing pod and add a debug container
kubectl debug <pod> -it --copy-to=debug-pod --image=busybox:1.36

# Watch pod status changes
kubectl get pods -w

# Stream logs from multiple pods
kubectl logs -l app=my-app --all-containers=true -f

# Get all resources in a namespace
kubectl get all -n <namespace>

# Get events for a specific pod
kubectl get events --field-selector involvedObject.name=<pod-name>

# Check resource consumption
kubectl top pods -n <namespace>
kubectl top nodes
```

---

## The 5-Minute Triage Checklist

When something breaks, run through this list in order:

- [ ] `kubectl get pods -n <ns>` — which pods are not Running?
- [ ] `kubectl describe pod <broken-pod>` — what do Events say?
- [ ] `kubectl logs <broken-pod> --previous` — what does the app say?
- [ ] `kubectl get events --sort-by='.lastTimestamp' | tail -20` — any cluster-wide issues?
- [ ] `kubectl describe service <svc>` — are Endpoints populated?
- [ ] `kubectl describe node <node>` — is the node healthy?

If you go through all six and still can't find the problem: the bug is in your application code, not in Kubernetes. That's actually the most common answer.

---

## Useful One-Liners

```bash
# All pods not in Running or Completed state
kubectl get pods -A --field-selector='status.phase!=Running,status.phase!=Succeeded'

# Pods sorted by restart count
kubectl get pods -A --sort-by='.status.containerStatuses[0].restartCount'

# Find pods consuming the most memory
kubectl top pods -A --sort-by=memory | head -10

# List all images running in the cluster
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.containers[*].image}{"\n"}{end}' | sort -u

# Find all PVCs that are not Bound
kubectl get pvc -A --field-selector='status.phase!=Bound'

# Count pods per node
kubectl get pods -A -o wide --no-headers | awk '{print $8}' | sort | uniq -c | sort -rn
```

---

## When to Escalate

Most problems are solvable with the commands above. Escalate to the cluster administrator when:

- A node is in `NotReady` state and `journalctl -u kubelet` shows kernel panics or hardware errors
- etcd shows leader election failures (`kubectl get events -n kube-system`)
- The API server is down (all `kubectl` commands time out)
- A CNI plugin is crashing in a loop across all nodes

For those scenarios, you need access to the control plane — which in managed K8s (EKS, GKE, AKS) means opening a support ticket.

---

## Key Takeaways

| # | Concept | One-liner |
|---|---|---|
| 1 | Events first, always | `kubectl describe` Events tell you *what* K8s tried and *why* it failed |
| 2 | `--previous` for crash logs | Normal `logs` shows current (empty if crashed); `--previous` shows last run |
| 3 | Labels are the root of most bugs | 80% of service connectivity bugs = selector doesn't match pod labels |
| 4 | Debug pod is your Swiss Army knife | `nicolaka/netshoot:v0.13` gives you every network tool you need |
| 5 | Most bugs are in the app, not K8s | After ruling out infrastructure, check your code and config |
