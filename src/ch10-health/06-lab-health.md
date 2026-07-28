# Lab: Probes and Shutdown Drills

⏱️ **~28 min hands-on**

| | |
|---|---|
| **Prerequisites** | Chapter 10 sections 10.1–10.5 read, Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Configure all three probe types, observe each failure mode, simulate app crashes and recoveries, and test graceful shutdown |

## Objectives

- [ ] Configure a liveness probe and trigger a restart
- [ ] Configure a readiness probe and watch pod leave/rejoin Endpoints
- [ ] Configure a startup probe for a slow-starting app
- [ ] Observe what happens without a readiness probe during rolling updates
- [ ] Test graceful shutdown with `preStop` and `terminationGracePeriodSeconds`

---

## Setup

```bash
kubectl create namespace health-lab
kubectl config set-context --current --namespace=health-lab
```

---

## Exercise 1: Liveness Probe — Detect and Restart a Stuck App

**What we're doing:** Deploy an app that becomes unhealthy after 30 seconds and watch it get restarted.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: liveness-test
  namespace: health-lab
spec:
  containers:
  - name: app
    image: busybox
    # App runs fine for 30s, then makes itself "sick"
    command:
    - sh
    - -c
    - |
      touch /tmp/healthy
      sleep 30
      rm /tmp/healthy
      echo "App is now sick!"
      sleep 9999
    livenessProbe:
      exec:
        command:
        - test
        - -f
        - /tmp/healthy
      initialDelaySeconds: 5
      periodSeconds: 5
      failureThreshold: 3       # 3 × 5s = 15s to detect failure
    resources:
      limits:
        memory: "16Mi"
        cpu: "50m"
EOF

# Watch the pod — it starts healthy, goes sick around 30s, restarts around 45s
echo "Watch for RESTARTS count to increment around t=45s..."
kubectl get pod liveness-test -n health-lab -w &

# Wait for a restart (takes ~45s)
sleep 60
kill %1

kubectl describe pod liveness-test -n health-lab | grep -E "Restart|Reason|Last State"
kubectl get pod liveness-test -n health-lab
```

**Expected:**
```
NAME             READY   STATUS    RESTARTS   AGE
liveness-test    1/1     Running   0          30s
liveness-test    1/1     Running   0          35s   ← /tmp/healthy removed
liveness-test    0/1     Running   0          40s   ← probe failing
liveness-test    0/1     Running   1          48s   ← restarted!
liveness-test    1/1     Running   1          52s   ← healthy again (file recreated)
```

---

## Exercise 2: Readiness Probe — Traffic Gate

**What we're doing:** Watch a pod get removed from and re-added to Service Endpoints based on readiness.

```bash
# Deploy a 3-replica Deployment with readiness probe
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: readiness-demo
  namespace: health-lab
spec:
  replicas: 3
  selector:
    matchLabels:
      app: readiness-demo
  template:
    metadata:
      labels:
        app: readiness-demo
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
        readinessProbe:
          httpGet:
            path: /ready
            port: 80
          initialDelaySeconds: 2
          periodSeconds: 3
          failureThreshold: 2
        resources:
          limits:
            memory: "32Mi"
            cpu: "50m"
---
apiVersion: v1
kind: Service
metadata:
  name: readiness-svc
  namespace: health-lab
spec:
  selector:
    app: readiness-demo
  ports:
  - port: 80
EOF

# Wait for pods to start (they'll be NOT READY — /ready doesn't exist in default nginx)
kubectl rollout status deployment/readiness-demo -n health-lab --timeout=30s || true
kubectl get pods -n health-lab -l app=readiness-demo
kubectl get endpoints readiness-svc -n health-lab
```

You'll see the Endpoints are empty because nginx doesn't have a `/ready` path — readiness probe fails:

```bash
# Check Endpoints — all pods not ready
kubectl get endpoints readiness-svc -n health-lab
# Expected: readiness-svc   <none>

# Now make ONE pod ready by creating the /ready file
FIRST_POD=$(kubectl get pods -n health-lab -l app=readiness-demo -o name | head -1)
kubectl exec -n health-lab $FIRST_POD -- \
  sh -c "echo 'OK' > /usr/share/nginx/html/ready"

# Wait a few seconds
sleep 10

# Only that one pod should be in Endpoints now
kubectl get endpoints readiness-svc -n health-lab
kubectl get pods -n health-lab -l app=readiness-demo
```

**Expected:**
```
NAME                            READY   STATUS    RESTARTS
readiness-demo-xxx-aaa          1/1     Running   0   ← only this one is ready
readiness-demo-xxx-bbb          0/1     Running   0
readiness-demo-xxx-ccc          0/1     Running   0

Endpoints: 10.244.0.x:80   ← only one IP
```

Make the rest ready and watch Endpoints grow:

```bash
# Make all pods ready
for POD in $(kubectl get pods -n health-lab -l app=readiness-demo -o name); do
  kubectl exec -n health-lab $POD -- \
    sh -c "echo 'OK' > /usr/share/nginx/html/ready"
done

sleep 10
kubectl get endpoints readiness-svc -n health-lab
# Expected: 3 IPs in the Endpoints list
```

---

## Exercise 3: Startup Probe for a Slow App

**What we're doing:** Simulate a JVM-style slow-starting app that would kill itself with a basic liveness probe.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: slow-start
  namespace: health-lab
spec:
  containers:
  - name: app
    image: busybox
    command:
    - sh
    - -c
    - |
      echo "Starting... (takes 25 seconds)"
      sleep 25
      echo "Started! Creating health file."
      touch /tmp/started /tmp/live /tmp/ready
      sleep 9999
    startupProbe:
      exec:
        command: ["test", "-f", "/tmp/started"]
      periodSeconds: 5
      failureThreshold: 10      # 50s max startup window
    livenessProbe:
      exec:
        command: ["test", "-f", "/tmp/live"]
      periodSeconds: 10
      failureThreshold: 3
    readinessProbe:
      exec:
        command: ["test", "-f", "/tmp/ready"]
      periodSeconds: 5
    resources:
      limits:
        memory: "16Mi"
        cpu: "50m"
EOF

echo "Watching pod... startup probe keeps liveness from killing it during 25s startup"
kubectl get pod slow-start -n health-lab -w &
sleep 35
kill %1

kubectl describe pod slow-start -n health-lab | grep -E "RESTARTS|Started|startup|liveness"
kubectl get pod slow-start -n health-lab
```

**Expected:** `RESTARTS: 0` — the startup probe protected the pod during its long startup.

---

## Exercise 4: Rolling Update — With vs Without Readiness

**What we're doing:** Compare a rolling update that uses readiness probes vs one without.

```bash
# Update to a broken image — readiness probe prevents bad pods from serving traffic
kubectl set image deployment/readiness-demo nginx=nginx:1.25-broken-tag -n health-lab || true

# Actually, do it properly:
# First, remove the readiness probe from one pod manually to observe difference

# Check the rollout (it should fail/pause because new pods can't become ready)
kubectl rollout status deployment/readiness-demo -n health-lab --timeout=20s || \
  echo "Rollout paused — new pods not becoming ready"

kubectl get pods -n health-lab -l app=readiness-demo

# Endpoints still has the old ready pods
kubectl get endpoints readiness-svc -n health-lab

# Rollback
kubectl rollout undo deployment/readiness-demo -n health-lab
kubectl rollout status deployment/readiness-demo -n health-lab
```

---

## Exercise 5: Graceful Shutdown Test

**What we're doing:** Deploy a pod with a preStop hook and observe it handles termination cleanly.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: graceful-shutdown
  namespace: health-lab
spec:
  terminationGracePeriodSeconds: 30
  containers:
  - name: app
    image: busybox
    command:
    - sh
    - -c
    - |
      # Register SIGTERM handler
      trap 'echo "[$(date)] SIGTERM received. Finishing work..."; sleep 3; echo "[$(date)] Done. Exiting cleanly."; exit 0' TERM
      
      echo "[$(date)] App started"
      while true; do
        echo "[$(date)] Processing..."
        sleep 2
      done
    lifecycle:
      preStop:
        exec:
          command:
          - sh
          - -c
          - "echo '[preStop] Draining connections... sleeping 3s'; sleep 3"
    resources:
      limits:
        memory: "16Mi"
        cpu: "50m"
EOF

kubectl wait pod graceful-shutdown -n health-lab --for=condition=Ready --timeout=30s

# Start watching logs in background
kubectl logs graceful-shutdown -n health-lab -f &
LOGS_PID=$!

sleep 5

# Delete the pod and observe the shutdown sequence
echo ""
echo "--- Deleting pod ---"
time kubectl delete pod graceful-shutdown -n health-lab --grace-period=30

kill $LOGS_PID 2>/dev/null
```

**Expected log sequence:**
```
[timestamp] App started
[timestamp] Processing...
[timestamp] Processing...
[preStop] Draining connections... sleeping 3s    ← preStop runs
[timestamp] SIGTERM received. Finishing work...  ← SIGTERM after preStop
[timestamp] Done. Exiting cleanly.               ← Clean exit
```

---

## 🔥 Break It! Challenge

> What happens when `terminationGracePeriodSeconds` is too short?

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: force-killed
  namespace: health-lab
spec:
  terminationGracePeriodSeconds: 5   # Only 5 seconds!
  containers:
  - name: app
    image: busybox
    command:
    - sh
    - -c
    - |
      trap 'echo "SIGTERM received — but I need 30s to clean up!"; sleep 30' TERM
      echo "App running"
      sleep 9999
    resources:
      limits:
        memory: "16Mi"
        cpu: "50m"
EOF

kubectl wait pod force-killed -n health-lab --for=condition=Ready --timeout=30s

# Watch the deletion — app wants 30s but only gets 5s
echo "Deleting pod — watch SIGKILL fire after 5 seconds..."
time kubectl delete pod force-killed -n health-lab --grace-period=5
```

**Expected:**
```
Deleting pod... (took ~5 seconds, not 30)
```

The pod is SIGKILL'd — your "cleanup" code never finished. In production, this means dropped database transactions, incomplete file writes, or lost in-flight requests.

---

## Cleanup

```bash
kubectl config set-context --current --namespace=default
kubectl delete namespace health-lab
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | Liveness restart | App became sick → probe detected → container restarted |
| 2 | Readiness traffic gate | Pods with failing probe removed from Endpoints |
| 3 | Readiness for rolling updates | Bad rollout paused; old pods kept serving |
| 4 | Startup probe protection | Slow-starting app: `RESTARTS: 0` thanks to startup probe |
| 5 | Graceful shutdown sequence | preStop → SIGTERM → clean exit observed in logs |
| 6 | Force-kill danger | Short grace period = SIGKILL before cleanup finishes |
