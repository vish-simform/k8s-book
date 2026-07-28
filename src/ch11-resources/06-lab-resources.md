# Lab: Resource Limits and HPA in Action

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | Chapter 11 sections 11.1–11.5 read, Minikube running, metrics-server enabled |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Set resource requests and limits, observe OOMKilled behavior, configure HPA, generate load to trigger autoscaling, and inspect QoS classes |

## Objectives

- [ ] Enable metrics-server and verify it works
- [ ] Configure a pod with requests and limits, observe throttling and OOMKill
- [ ] Check QoS classes for Guaranteed, Burstable, and BestEffort pods
- [ ] Create an HPA and watch it scale under load
- [ ] Observe HPA scale-down after load drops

---

## Setup

```bash
# Enable metrics-server
minikube addons enable metrics-server

# Wait for it to be ready and collecting metrics
kubectl wait deployment metrics-server \
  -n kube-system \
  --for=condition=available \
  --timeout=120s

# Verify it's working
sleep 30  # Give metrics-server time to collect initial data
kubectl top nodes
kubectl top pods -A | head -10

kubectl create namespace resources-lab
kubectl config set-context --current --namespace=resources-lab
```

---

## Exercise 1: Observe CPU Throttling

**What we're doing:** Create a CPU-hungry pod and watch it get throttled at its limit.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: cpu-stress
  namespace: resources-lab
spec:
  containers:
  - name: stress
    image: polinux/stress
    command: ["stress"]
    args: ["--cpu", "4", "--timeout", "120"]  # Wants 4 CPUs
    resources:
      requests:
        cpu: "100m"
      limits:
        cpu: "200m"     # Limited to 200m despite wanting 4 CPUs
        memory: "64Mi"
EOF

kubectl wait pod cpu-stress -n resources-lab --for=condition=Ready --timeout=30s

# Watch actual CPU usage — should be capped near 200m despite 4-CPU demand
watch kubectl top pod cpu-stress -n resources-lab
```

**Expected:** CPU usage stays around `200m` — throttled. The container isn't killed, just slowed down. Press `Ctrl+C` after a few seconds.

```bash
# Check QoS class — Burstable (requests != limits)
kubectl get pod cpu-stress -n resources-lab \
  -o jsonpath='{.status.qosClass}'
echo ""
```

---

## Exercise 2: Trigger OOMKilled

**What we're doing:** Force a container to exceed its memory limit and watch Kubernetes kill it.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: memory-hog
  namespace: resources-lab
spec:
  containers:
  - name: mem
    image: polinux/stress
    command: ["stress"]
    args: ["--vm", "1", "--vm-bytes", "150M", "--vm-hang", "1"]
    resources:
      requests:
        memory: "50Mi"
      limits:
        memory: "100Mi"    # Will be exceeded by 150M allocation
        cpu: "100m"
EOF

# Watch the pod status
echo "Watching for OOMKilled..."
kubectl get pod memory-hog -n resources-lab -w &
sleep 20
kill %1

# Check the restart reason
kubectl describe pod memory-hog -n resources-lab | grep -A10 "Last State:"
kubectl get pod memory-hog -n resources-lab
```

**Expected output:**
```
Last State:  Terminated
  Reason:    OOMKilled
  Exit Code: 137

NAME          READY   STATUS    RESTARTS   AGE
memory-hog    0/1     OOMKilled 1          15s
memory-hog    1/1     Running   1          18s  ← restarted, OOMKills again...
```

---

## Exercise 3: Compare QoS Classes

**What we're doing:** Create pods with different resource specs and verify their QoS classes.

```bash
# Guaranteed: requests == limits
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: qos-guaranteed
  namespace: resources-lab
spec:
  containers:
  - name: app
    image: busybox
    command: ["sleep", "3600"]
    resources:
      requests:
        cpu: "100m"
        memory: "64Mi"
      limits:
        cpu: "100m"     # Exactly equal
        memory: "64Mi"  # Exactly equal
---
apiVersion: v1
kind: Pod
metadata:
  name: qos-burstable
  namespace: resources-lab
spec:
  containers:
  - name: app
    image: busybox
    command: ["sleep", "3600"]
    resources:
      requests:
        cpu: "100m"
        memory: "64Mi"
      limits:
        cpu: "500m"      # Different from request
        memory: "256Mi"  # Different from request
---
apiVersion: v1
kind: Pod
metadata:
  name: qos-besteffort
  namespace: resources-lab
spec:
  containers:
  - name: app
    image: busybox
    command: ["sleep", "3600"]
    # No resources at all
EOF

sleep 5

# Check QoS classes
for POD in qos-guaranteed qos-burstable qos-besteffort; do
  QOS=$(kubectl get pod $POD -n resources-lab \
    -o jsonpath='{.status.qosClass}' 2>/dev/null)
  echo "$POD: $QOS"
done
```

**Expected:**
```
qos-guaranteed: Guaranteed
qos-burstable:  Burstable
qos-besteffort: BestEffort
```

---

## Exercise 4: HPA — Scale on CPU Load

**What we're doing:** Deploy an app, configure HPA, generate load, and watch replicas increase.

```bash
# Deploy the HPA test app (a simple HTTP server that burns CPU)
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: load-app
  namespace: resources-lab
spec:
  replicas: 1
  selector:
    matchLabels:
      app: load-app
  template:
    metadata:
      labels:
        app: load-app
    spec:
      containers:
      - name: app
        image: registry.k8s.io/hpa-example
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: "200m"
          limits:
            cpu: "500m"
            memory: "128Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: load-app-svc
  namespace: resources-lab
spec:
  selector:
    app: load-app
  ports:
  - port: 80
EOF

kubectl rollout status deployment/load-app -n resources-lab

# Create HPA
cat <<'EOF' | kubectl apply -f -
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: load-app-hpa
  namespace: resources-lab
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: load-app
  minReplicas: 1
  maxReplicas: 5
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 50
EOF

# Wait for metrics to be available
sleep 30
kubectl get hpa load-app-hpa -n resources-lab
```

**Current state (before load):**
```
NAME           REFERENCE           TARGETS       MINPODS   MAXPODS   REPLICAS
load-app-hpa   Deployment/load-app  8%/50% (cpu)  1         5         1
```

Now generate load:

```bash
# START LOAD in background
kubectl run load-gen \
  --image=busybox \
  --namespace=resources-lab \
  --restart=Never \
  -- sh -c "while sleep 0.01; do wget -q -O- http://load-app-svc; done" &

echo "Load generator started. Waiting 60 seconds for HPA to react..."
sleep 60

# Check HPA — should see CPU% climb and replicas increase
kubectl get hpa load-app-hpa -n resources-lab
kubectl get pods -n resources-lab -l app=load-app

echo ""
echo "=== HPA Status ==="
kubectl describe hpa load-app-hpa -n resources-lab | grep -A10 "Current Metrics:"
kubectl describe hpa load-app-hpa -n resources-lab | tail -15
```

**Expected (under load):**
```
NAME           REFERENCE           TARGETS         MINPODS   MAXPODS   REPLICAS
load-app-hpa   Deployment/load-app  180%/50% (cpu)  1         5         4
```

Stop the load and watch scale-down:

```bash
kubectl delete pod load-gen -n resources-lab

echo "Load stopped. Watching HPA scale-down (takes ~5 minutes due to cooldown)..."
kubectl get hpa load-app-hpa -n resources-lab -w
```

---

## Exercise 5: Inspect Scaling Events

```bash
# See the full HPA scaling history
kubectl describe hpa load-app-hpa -n resources-lab

# Look for scaling events:
kubectl get events -n resources-lab \
  --field-selector reason=SuccessfulRescale \
  --sort-by='.lastTimestamp'
```

**Expected events:**
```
Type    Reason              Message
Normal  SuccessfulRescale   Scaled up to 4 replicas: cpu utilization above target
Normal  SuccessfulRescale   Scaled down to 1 replicas: all metrics below target
```

---

## 🔥 Break It! Challenge

> What happens when HPA has no `requests.cpu` set on the pod?

```bash
# Deploy without cpu requests
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: no-requests
  namespace: resources-lab
spec:
  replicas: 1
  selector:
    matchLabels:
      app: no-requests
  template:
    metadata:
      labels:
        app: no-requests
    spec:
      containers:
      - name: app
        image: nginx:1.25
        # No resources.requests.cpu set!
        resources:
          limits:
            cpu: "200m"   # Only a limit, no request
            memory: "64Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: no-requests-svc
  namespace: resources-lab
spec:
  selector:
    app: no-requests
  ports:
  - port: 80
EOF

kubectl rollout status deployment/no-requests -n resources-lab

# Create HPA
kubectl autoscale deployment no-requests \
  --cpu-percent=50 --min=1 --max=5 \
  -n resources-lab

# Check HPA status
sleep 30
kubectl describe hpa no-requests -n resources-lab | grep -A5 "Conditions:"
```

**Expected error:**
```
Conditions:
  ScalingActive  False  FailedGetResourceMetric
  Message:       the HPA was unable to compute the replica count: ...
                 missing request for cpu
```

The HPA can't compute utilization without a `requests.cpu` baseline. It shows `unknown/50%` for targets and won't scale.

Fix: always set `resources.requests.cpu`.

```bash
kubectl patch deployment no-requests -n resources-lab \
  --type='json' \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/resources","value":{"requests":{"cpu":"100m","memory":"32Mi"},"limits":{"cpu":"200m","memory":"64Mi"}}}]'

sleep 30
kubectl get hpa no-requests -n resources-lab
# Now shows a real CPU% instead of unknown
```

---

## Cleanup

```bash
kubectl config set-context --current --namespace=default
kubectl delete namespace resources-lab
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | CPU throttling | cpu-stress pod capped at 200m despite 4-CPU demand |
| 2 | Memory OOMKill | memory-hog killed with Exit Code 137, restarted |
| 3 | QoS classes | Verified Guaranteed/Burstable/BestEffort assignment |
| 4 | HPA scale-up | Replicas increased to 4 as CPU% climbed above 50% |
| 5 | HPA scale-down | Replicas reduced after 5-minute cooldown |
| 6 | Scaling events | `kubectl get events` showed SuccessfulRescale records |
| 7 | Missing requests | HPA showed `unknown` CPU% without `requests.cpu` |
