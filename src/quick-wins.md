# ⚡ Quick Wins (5-minute tasks when motivation is low)

Pick one. Do it. Feel good. Come back for more.

## 🟢 Beginner (Chapters 1–3)
- [ ] Run `kubectl get pods -A` and identify every pod's role
- [ ] Deploy nginx and curl it via `kubectl port-forward`
- [ ] List all containers in the `kube-system` namespace
- [ ] Inspect cluster events using `kubectl get events --sort-by='.lastTimestamp'`

## 🟡 Intermediate (Chapters 4–8)
- [ ] Scale a deployment from 1→5 and watch pods appear with `kubectl get pods -w`
- [ ] Create a Secret and mount it as a volume in a pod
- [ ] Create a PersistentVolumeClaim and verify it binds to local storage
- [ ] Create an Ingress rule with path routing and test with curl

## 🔴 Advanced (Chapters 9–18)
- [ ] Break a readiness probe and watch traffic stop routing to the pod
- [ ] Install a Helm chart, then inspect rendered templates with `helm template`
- [ ] Create a NetworkPolicy that blocks all ingress except from a specific namespace
- [ ] Query etcd directly to see raw serialized pod keys
