# 18.3 Networking Failures — DNS, Services, Connectivity

⏱️ **~10 min read**

> **TL;DR:** Networking bugs in Kubernetes have a reliable fingerprint. A service that doesn't route traffic is almost always a label selector mismatch. A DNS failure is almost always a CoreDNS issue. Start by verifying each layer with `curl` and `nslookup` from inside a pod.

---

## The Networking Debug Toolkit

Before anything else, deploy a debug pod you can use as a network probe:

```bash
# Launch a debug pod with curl and nslookup
kubectl run netdebug --image=nicolaka/netshoot --rm -it --restart=Never -- bash
```

`nicolaka/netshoot` has: `curl`, `nslookup`, `dig`, `nmap`, `tcpdump`, `netstat`, `ip`, `traceroute` — everything you need.

---

## Problem 1: Service Returns No Response / Connection Refused

**Symptom:** `curl http://my-service` from inside a pod returns `Connection refused` or hangs.

### Step 1 — Does the Service Exist?

```bash
kubectl get service my-service -n <namespace>
```

If it's missing, someone deleted it or applied to the wrong namespace.

### Step 2 — Check Endpoints

```bash
kubectl describe service my-service -n <namespace>
```

```
Name:              my-service
Selector:          app=my-app         ← must match pod labels
Endpoints:         <none>             ← THIS IS THE PROBLEM
```

**Empty endpoints = label selector mismatch.** This is the #1 networking bug in Kubernetes.

### Fixing the Label Mismatch

```bash
# Check what labels your pods actually have
kubectl get pods --show-labels | grep my-app
```

```
NAME            LABELS
my-app-xxx      app=my-application  ← "my-application", not "my-app"!
```

```yaml
# Fix the Service selector to match actual pod labels
spec:
  selector:
    app: my-application   # was: my-app
```

### Step 3 — Test Pod Reachability Directly

```bash
# Skip the Service, talk to the pod directly
kubectl get pod my-app-xxx -o wide  # get the pod IP

# From inside the debug pod:
curl http://10.244.1.5:8080/health
```

If this works but the Service doesn't, the issue is definitively in the Service (selector or port mapping).

### Step 4 — Check Port Mapping

```yaml
# Common mistake: targetPort doesn't match what the app listens on
spec:
  ports:
    - port: 80          # Service port (what clients call)
      targetPort: 8080  # Container port (what the app listens on)
                        # ← must match containerPort in the pod spec!
```

---

## Problem 2: DNS Resolution Failure

**Symptom:** `nslookup my-service` fails from inside a pod. App logs show "no such host" errors.

### Step 1 — Test DNS from Inside a Pod

```bash
kubectl exec -it <any-running-pod> -- nslookup my-service
```

**Expected output (working):**
```
Server:   10.96.0.10       ← CoreDNS ClusterIP
Address:  10.96.0.10:53

Name:     my-service.default.svc.cluster.local
Address:  10.96.55.100
```

**Broken output:**
```
;; connection timed out; no servers could be reached
```

### Step 2 — Is CoreDNS Running?

```bash
kubectl get pods -n kube-system -l k8s-app=kube-dns
```

```
NAME                   READY   STATUS    RESTARTS
coredns-xxx-yyy        0/1     Pending   0        ← CoreDNS is down!
```

```bash
# Check CoreDNS logs
kubectl logs -n kube-system -l k8s-app=kube-dns
```

### Step 3 — Test the Full DNS Name

Kubernetes DNS follows a predictable pattern:

```
<service>.<namespace>.svc.cluster.local
```

```bash
# Inside a pod, these should all resolve:
nslookup my-service                                          # in same namespace
nslookup my-service.other-ns                                 # cross-namespace
nslookup my-service.other-ns.svc.cluster.local               # fully qualified
nslookup kubernetes.default.svc.cluster.local                # API server (always works)
```

If `kubernetes.default` resolves but your service doesn't, the service itself might not exist in that namespace.

### Step 4 — Check ndots Setting

Pod DNS resolution adds the cluster domain as a search suffix. If your service name has dots, it can confuse resolution:

```bash
# Inside a pod
cat /etc/resolv.conf
```

```
nameserver 10.96.0.10
search default.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

The `ndots:5` means: if the name has fewer than 5 dots, try appending search domains first. This can cause surprising behavior for external hostnames.

---

## Problem 3: NetworkPolicy Blocking Traffic

**Symptom:** Pod-to-pod communication was working, then someone applied a NetworkPolicy and it broke.

```bash
# List all NetworkPolicies in the namespace
kubectl get networkpolicies -n <namespace>

# Describe to see what they allow/deny
kubectl describe networkpolicy <policy-name> -n <namespace>
```

> ⚠️ **Warning:** A NetworkPolicy with an empty `podSelector: {}` applies to **all pods** in the namespace. If it has no `ingress` or `egress` rules, it **blocks all traffic** to/from matched pods. This is the most common "why does nothing work" after someone applies a NetworkPolicy.

### Quick Egress Debug

```bash
# From inside a pod, test connectivity step by step
nslookup google.com         # external DNS
curl http://my-service:80   # service within cluster
curl http://10.244.1.5:8080 # direct pod IP (bypasses service but not NetworkPolicy)
```

If pod-to-pod by IP is blocked but there's no `podSelector` restriction, check if there's a **default-deny** NetworkPolicy applied to the namespace.

---

## Problem 4: Ingress Not Working

**Symptom:** External HTTP requests get 404 or timeout even though pods are running.

```bash
# Step 1: Is the Ingress controller running?
kubectl get pods -n ingress-nginx

# Step 2: Check Ingress resource
kubectl describe ingress my-ingress -n <namespace>

# Step 3: Check the backend service exists and has endpoints
kubectl describe service <backend-service> -n <namespace>
```

```bash
# Step 4: Test with curl, including the Host header (for host-based routing)
curl -H "Host: myapp.example.com" http://<minikube-ip>:80/
```

If the Ingress shows "no healthy upstream" in controller logs:

```bash
kubectl logs -n ingress-nginx -l app.kubernetes.io/component=controller | tail -50
```

---

## Problem 5: kube-proxy / iptables Issues

In rare cases, iptables rules get corrupted. Symptoms: services stop routing even though endpoints exist.

```bash
# Restart kube-proxy (it re-programs iptables on startup)
kubectl rollout restart daemonset/kube-proxy -n kube-system

# On the node directly
minikube ssh
sudo iptables -t nat -L KUBE-SERVICES | grep <service-cluster-ip>
```

---

## Key Takeaways

| # | Problem | First Command |
|---|---|---|
| 1 | Service not routing | `kubectl describe service` → check Endpoints |
| 2 | DNS not resolving | `kubectl exec -- nslookup service` + check CoreDNS |
| 3 | NetworkPolicy blocking | `kubectl get networkpolicies` + check for default-deny |
| 4 | Ingress not working | Check controller pods + `kubectl describe ingress` |
| 5 | Label mismatch | `kubectl get pods --show-labels` vs Service selector |

---

## ✅ Quick Check

**Q1:** `kubectl describe service my-svc` shows `Endpoints: <none>`. The pod is Running. What's the most likely cause?

<details>
<summary>Answer</summary>
The Service's `spec.selector` labels don't match the pod's actual labels. Run `kubectl get pods --show-labels` and compare with the Service selector. Even a case difference (`app: myApp` vs `app: myapp`) will cause this. Edit the Service selector to match the pod labels.
</details>

**Q2:** From inside Pod A, `nslookup my-service` works but `nslookup my-service.other-namespace` fails. What's the issue?

<details>
<summary>Answer</summary>
The service probably doesn't exist in `other-namespace`, or you have a typo in the namespace name. Try the fully qualified name: `nslookup my-service.other-namespace.svc.cluster.local`. Also run `kubectl get service my-service -n other-namespace` to verify the service exists in that namespace.
</details>

**Q3:** A developer applied a NetworkPolicy and now nothing can reach any pod in the `production` namespace. The policy's `podSelector` is empty (`{}`). Why did this happen?

<details>
<summary>Answer</summary>
An empty `podSelector: {}` matches ALL pods in the namespace. If the NetworkPolicy has an `ingress:` key but it's empty (no rules), it means "deny all ingress." This is a default-deny policy. To fix: either delete the policy, or add explicit ingress rules to allow the traffic you need. Always test NetworkPolicies in a staging namespace first.
</details>
