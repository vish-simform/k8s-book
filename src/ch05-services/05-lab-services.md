# Lab: Service Discovery and Connectivity Debugging

⏱️ **~25 min hands-on**

| | |
|---|---|
| **Prerequisites** | Chapter 5 sections 5.1–5.4 read, Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Wire up a two-service app using ClusterIP, expose it with NodePort, debug DNS, and break the label selector to observe the failure |

## Objectives

- [ ] Deploy two services and connect them via ClusterIP DNS
- [ ] Expose an app externally with NodePort
- [ ] Debug DNS resolution from inside a pod
- [ ] Observe and fix a broken label selector
- [ ] Inspect Endpoints to understand what a Service is routing to
- [ ] Use `minikube tunnel` with a LoadBalancer Service

---

## Setup

```bash
kubectl create namespace svc-lab
kubectl config set-context --current --namespace=svc-lab
```

---

## Exercise 1: ClusterIP — Wiring Two Services

**What we're doing:** Deploy a frontend and backend, connect them using ClusterIP DNS.

```bash
# Deploy backend (simple nginx responding as our "API")
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: svc-lab
spec:
  replicas: 3
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: api
        image: nginx:1.25
        ports:
        - containerPort: 80
        resources:
          limits:
            memory: "64Mi"
            cpu: "100m"
---
apiVersion: v1
kind: Service
metadata:
  name: backend-svc
  namespace: svc-lab
spec:
  type: ClusterIP
  selector:
    app: backend
  ports:
  - port: 8080        # Service port clients use
    targetPort: 80    # Pod's actual port
EOF

# Verify
kubectl get deploy backend
kubectl get svc backend-svc
kubectl get endpoints backend-svc
```

**Expected endpoints output:**
```
NAME          ENDPOINTS                                         AGE
backend-svc   10.244.0.4:80,10.244.0.5:80,10.244.0.6:80       30s
```

Now test connectivity from a "frontend" pod:

```bash
# Run a curl pod as a frontend substitute
kubectl run frontend-test \
  --image=curlimages/curl \
  --rm -it --restart=Never \
  -- sh -c "
    echo 'Testing short DNS name:';
    curl -s -o /dev/null -w '%{http_code}' http://backend-svc:8080;
    echo '';
    echo 'Testing full DNS name:';
    curl -s -o /dev/null -w '%{http_code}' http://backend-svc.svc-lab.svc.cluster.local:8080;
    echo ''
  "
```

**Expected output:**
```
Testing short DNS name:
200
Testing full DNS name:
200
```

> 💡 **What just happened?** The pod resolved `backend-svc` via CoreDNS to the ClusterIP, which kube-proxy forwarded to one of the 3 backend pods. The `8080→80` port translation happened transparently.

---

## Exercise 2: Inspect the DNS Infrastructure

**What we're doing:** Look at CoreDNS and understand how Service DNS works.

```bash
# See CoreDNS pods (the cluster's DNS server)
kubectl get pods -n kube-system -l k8s-app=kube-dns

# Run a debug pod and perform DNS lookups
kubectl run dns-debug \
  --image=busybox \
  --rm -it --restart=Never \
  -- sh -c "
    echo '=== DNS server configured for this pod ===';
    cat /etc/resolv.conf;
    echo '';
    echo '=== Lookup backend-svc (ClusterIP) ===';
    nslookup backend-svc.svc-lab.svc.cluster.local;
    echo '';
    echo '=== Lookup kube-dns (system service) ===';
    nslookup kube-dns.kube-system.svc.cluster.local
  "
```

**Expected resolv.conf:**
```
nameserver 10.96.0.10        ← CoreDNS ClusterIP
search svc-lab.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

The `search` domains are why short names like `backend-svc` work — the OS appends the search suffix automatically.

---

## Exercise 3: Expose with NodePort

**What we're doing:** Expose the backend to the outside world using NodePort.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: backend-nodeport
  namespace: svc-lab
spec:
  type: NodePort
  selector:
    app: backend
  ports:
  - port: 80
    targetPort: 80
    nodePort: 30500
EOF

# Verify
kubectl get svc backend-nodeport

# Access via Minikube
MINIKUBE_IP=$(minikube ip)
echo "Accessing: http://$MINIKUBE_IP:30500"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://$MINIKUBE_IP:30500

# Or use minikube shortcut
minikube service backend-nodeport -n svc-lab --url
```

**Expected:**
```
HTTP Status: 200
```

---

## Exercise 4: Watch the Endpoints Live

**What we're doing:** Watch how the Endpoints list updates as pods are added/removed.

```bash
# Start watching Endpoints
kubectl get endpoints backend-svc -w &

# Scale the backend up — watch new IPs appear
kubectl scale deployment backend --replicas=5
sleep 5

# Scale down — watch IPs disappear
kubectl scale deployment backend --replicas=1
sleep 5

# Kill the watch
kill %1
```

**Expected watch output:**
```
NAME          ENDPOINTS                                               AGE
backend-svc   10.244.0.4:80,10.244.0.5:80,10.244.0.6:80             5m
backend-svc   10.244.0.4:80,...+2 more...                            5m30s   ← scaled to 5
backend-svc   10.244.0.4:80                                          6m      ← scaled to 1
```

Scale back to 3 for the next exercise:
```bash
kubectl scale deployment backend --replicas=3
```

---

## Exercise 5: Break It — Wrong Label Selector

**What we're doing:** Misconfigure the Service selector and debug the resulting failure.

```bash
# Create a Service with a WRONG selector
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: broken-svc
  namespace: svc-lab
spec:
  type: ClusterIP
  selector:
    app: typo-backend    # ← WRONG — pods are labeled app=backend
  ports:
  - port: 80
    targetPort: 80
EOF

# Test connectivity — it fails
kubectl run curl-test \
  --image=curlimages/curl \
  --rm -it --restart=Never \
  -- curl --connect-timeout 3 http://broken-svc || echo "Connection failed!"
```

**Expected:**
```
curl: (28) Connection timed out after 3001 milliseconds
Connection failed!
```

Now diagnose:

```bash
# Step 1: Check Endpoints — is anything there?
kubectl get endpoints broken-svc
# Expected: broken-svc   <none>   ← empty! No pods match the selector

# Step 2: Describe the Service
kubectl describe svc broken-svc | grep -A5 "Selector:"
# Selector: app=typo-backend  ← wrong!

# Step 3: Fix it
kubectl patch svc broken-svc -p '{"spec":{"selector":{"app":"backend"}}}'

# Step 4: Verify Endpoints now populated
kubectl get endpoints broken-svc

# Step 5: Test connectivity — now succeeds
kubectl run curl-test \
  --image=curlimages/curl \
  --rm -it --restart=Never \
  -- curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://broken-svc
```

> 💡 **The debugging rule:** If a Service isn't routing, check Endpoints first. Empty Endpoints = selector mismatch. That's the #1 Service failure cause.

---

## Exercise 6: LoadBalancer with Minikube Tunnel

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: backend-lb
  namespace: svc-lab
spec:
  type: LoadBalancer
  selector:
    app: backend
  ports:
  - port: 80
    targetPort: 80
EOF

kubectl get svc backend-lb
# EXTERNAL-IP: <pending> initially

# Open a NEW terminal and run:
# minikube tunnel
# (keep it running while you test)

# Back in this terminal, wait a moment then:
kubectl get svc backend-lb
# EXTERNAL-IP: 127.0.0.1

curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://127.0.0.1
```

---

## 🔥 Break It! Challenge

> What happens when you send traffic to a ClusterIP from OUTSIDE the cluster?

```bash
# Get the ClusterIP of the backend-svc
CLUSTER_IP=$(kubectl get svc backend-svc -o jsonpath='{.spec.clusterIP}')
echo "ClusterIP: $CLUSTER_IP"

# Try to curl it directly from your host machine
curl --connect-timeout 3 http://$CLUSTER_IP:8080 || echo "Cannot reach ClusterIP from outside!"

# Try from inside the cluster (works fine)
kubectl run curl-inside \
  --image=curlimages/curl \
  --rm -it --restart=Never \
  -- curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://$CLUSTER_IP:8080
```

**The lesson:** ClusterIPs are **only routable inside the cluster**. They exist in a virtual IP space managed by kube-proxy's iptables rules on cluster nodes. Your host machine has no routes to that IP space (unless you use `kubectl proxy` or `minikube tunnel`).

---

## Cleanup

```bash
kubectl config set-context --current --namespace=default
kubectl delete namespace svc-lab
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | ClusterIP DNS routing | `backend-svc:8080` resolved and returned HTTP 200 |
| 2 | DNS mechanics | Read `/etc/resolv.conf` and ran `nslookup` from inside a pod |
| 3 | Live Endpoints | Watched IPs appear/disappear as pods scaled |
| 4 | NodePort external access | Reached app on `minikube-ip:30500` from host |
| 5 | Broken selector debugging | Found empty Endpoints → fixed selector → connectivity restored |
| 6 | LoadBalancer + tunnel | Used `minikube tunnel` to get a real external IP |
| 7 | ClusterIP is cluster-only | Confirmed unreachable from host machine |
