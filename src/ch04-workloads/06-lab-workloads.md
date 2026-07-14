# Lab: Deploy, Scale, Update, and Rollback

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | Chapter 4 sections 4.1–4.5 read, Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Deploy nginx with a Deployment, scale it, perform a rolling update, observe self-healing, trigger a bad rollout and rollback, and run a CronJob |

## Objectives

- [ ] Deploy an application with 3 replicas using a Deployment
- [ ] Scale the Deployment up and down
- [ ] Perform a zero-downtime rolling update
- [ ] Observe ReplicaSet self-healing after pod deletion
- [ ] Trigger a bad rollout (wrong image) and roll back
- [ ] Create a CronJob and verify scheduled execution

---

## Setup

```bash
kubectl create namespace workloads-lab
kubectl config set-context --current --namespace=workloads-lab
```

---

## Exercise 1: Deploy and Inspect

**What we're doing:** Deploy nginx and understand what gets created.

```bash
# Create a deployment declaratively
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webserver
  namespace: workloads-lab
  annotations:
    kubernetes.io/change-cause: "Initial deployment — nginx 1.24"
spec:
  replicas: 3
  selector:
    matchLabels:
      app: webserver
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: webserver
        version: "1.24"
    spec:
      containers:
      - name: nginx
        image: nginx:1.24
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

# Wait for rollout
kubectl rollout status deployment/webserver
```

Now inspect what was created:

```bash
# Deployment
kubectl get deployment webserver

# ReplicaSet created by the Deployment
kubectl get replicaset

# Pods created by the ReplicaSet
kubectl get pods -l app=webserver -o wide

# Full ownership chain
kubectl describe deployment webserver | grep -A3 "NewReplicaSet"
```

**Expected output (deployment):**
```
NAME        READY   UP-TO-DATE   AVAILABLE   AGE
webserver   3/3     3            3           30s
```

> 💡 **What just happened?** Creating the Deployment caused it to create a ReplicaSet, which created 3 pods. The chain is: Deployment → ReplicaSet → Pods. You only manage the Deployment.

---

## Exercise 2: Scale Up and Down

```bash
# Scale to 5
kubectl scale deployment webserver --replicas=5
kubectl rollout status deployment/webserver
kubectl get pods -l app=webserver

# Scale back to 2
kubectl scale deployment webserver --replicas=2
kubectl get pods -l app=webserver -w  # Watch 3 pods terminate

# Scale back to 3 for the rest of the lab
kubectl scale deployment webserver --replicas=3
kubectl rollout status deployment/webserver
```

---

## Exercise 3: Self-Healing — Delete a Pod

**What we're doing:** Prove the ReplicaSet recreates killed pods.

```bash
# Get pod names
kubectl get pods -l app=webserver

# Delete one pod (replace with your actual pod name)
POD=$(kubectl get pods -l app=webserver -o name | head -1)
echo "Deleting: $POD"
kubectl delete $POD

# Immediately watch — new pod appears within seconds
kubectl get pods -l app=webserver -w
```

**Expected output:**
```
NAME                         READY   STATUS        RESTARTS   AGE
webserver-abc-x1             1/1     Running       0          5m
webserver-abc-x2             1/1     Running       0          5m
webserver-abc-x3             0/1     Terminating   0          5m   ← deleted
webserver-abc-x4             0/1     ContainerCreating   0   1s   ← NEW pod
webserver-abc-x4             1/1     Running       0          4s
```

The ReplicaSet detected the count dropped to 2 and immediately created a replacement.

---

## Exercise 4: Rolling Update

**What we're doing:** Update from nginx:1.24 to nginx:1.25 with zero downtime.

```bash
# In a separate watch (run this first)
kubectl get pods -l app=webserver -w &

# Perform the rolling update
kubectl set image deployment/webserver nginx=nginx:1.25
kubectl annotate deployment/webserver kubernetes.io/change-cause="Update to nginx 1.25" --overwrite

# Watch the rollout status
kubectl rollout status deployment/webserver
```

**Expected watch output (one-at-a-time with maxSurge:1 maxUnavailable:0):**
```
webserver-old-x1   1/1     Running             0   5m
webserver-old-x2   1/1     Running             0   5m
webserver-old-x3   1/1     Running             0   5m
webserver-new-y1   0/1     ContainerCreating   0   2s   ← new RS pod
webserver-new-y1   1/1     Running             0   5s   ← ready!
webserver-old-x1   1/1     Terminating         0   5m   ← old removed
webserver-new-y2   0/1     ContainerCreating   0   1s
...
```

```bash
# Kill the background watch
kill %1

# Confirm new image
kubectl get pods -l app=webserver -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'

# See rollout history
kubectl rollout history deployment/webserver
```

**Expected history:**
```
REVISION  CHANGE-CAUSE
1         Initial deployment — nginx 1.24
2         Update to nginx 1.25
```

---

## Exercise 5: Bad Rollout + Rollback

**What we're doing:** Deploy a broken image and roll back before it causes full outage.

```bash
# Deploy a non-existent image tag (simulating a bad push)
kubectl set image deployment/webserver nginx=nginx:this-tag-does-not-exist
kubectl annotate deployment/webserver kubernetes.io/change-cause="BROKEN — bad tag" --overwrite

# Watch it fail — new pods get ImagePullBackOff
kubectl get pods -l app=webserver -w &
sleep 20 && kill %1

# Check deployment status
kubectl rollout status deployment/webserver --timeout=30s
```

**Expected output:**
```
Waiting for deployment "webserver" rollout to finish: 1 out of 3 new replicas have been updated...
error: timed out waiting for the condition
```

```bash
# See the bad pods
kubectl get pods -l app=webserver

# One pod is ImagePullBackOff — but maxUnavailable:0 means the old pods stay!
# Current state: 3 old pods still running + 1 new (broken) pod trying
```

> 💡 **Key insight:** Because we set `maxUnavailable: 0`, the old pods are NOT removed until the new ones are Ready. The broken new pod can't become Ready → the old pods keep serving traffic → no outage!

```bash
# Rollback immediately
kubectl rollout undo deployment/webserver
kubectl rollout status deployment/webserver

# Verify we're back on nginx:1.25
kubectl get pods -l app=webserver -o jsonpath='{range .items[*]}{.spec.containers[0].image}{"\n"}{end}'

# History now shows 4 revisions
kubectl rollout history deployment/webserver
```

---

## Exercise 6: DaemonSet Demo

```bash
# Create a simple DaemonSet (1 pod on our 1-node cluster)
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-monitor
  namespace: workloads-lab
spec:
  selector:
    matchLabels:
      app: node-monitor
  template:
    metadata:
      labels:
        app: node-monitor
    spec:
      containers:
      - name: monitor
        image: busybox
        command: ["sh", "-c", "while true; do echo \"Node: $(hostname), Time: $(date)\"; sleep 5; done"]
        resources:
          limits:
            memory: "32Mi"
            cpu: "50m"
EOF

kubectl get pods -l app=node-monitor -o wide
kubectl logs -l app=node-monitor

# Can't scale a DaemonSet
kubectl scale daemonset node-monitor --replicas=0  # ← Error
```

---

## Exercise 7: CronJob

```bash
# Run a job every minute
cat <<'EOF' | kubectl apply -f -
apiVersion: batch/v1
kind: CronJob
metadata:
  name: ticker
  namespace: workloads-lab
spec:
  schedule: "* * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
          - name: tick
            image: busybox
            command: ["sh", "-c", "echo \"Tick at: $(date)\""]
EOF

# Watch for the job to fire (wait ~70 seconds)
echo "Waiting 70 seconds for first CronJob run..."
sleep 70
kubectl get jobs
kubectl get pods -l job-name

# Get the output
kubectl logs -l job-name --tail=5
```

**Expected jobs output (after 2+ minutes):**
```
NAME                  STATUS     COMPLETIONS   DURATION   AGE
ticker-28000001       Complete   1/1           4s         2m
ticker-28000002       Complete   1/1           4s         1m
```

---

## 🔥 Break It! Challenge

> What happens when a Deployment's `maxUnavailable` causes an outage during a bad rollout?

```bash
# Create a "risky" deployment with maxUnavailable:1
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: risky-deploy
  namespace: workloads-lab
spec:
  replicas: 3
  selector:
    matchLabels:
      app: risky
  strategy:
    rollingUpdate:
      maxSurge: 0
      maxUnavailable: 1    # ← allows 1 pod to be missing
  template:
    metadata:
      labels:
        app: risky
    spec:
      containers:
      - name: app
        image: nginx:1.25
        resources:
          limits:
            memory: "32Mi"
            cpu: "50m"
EOF

kubectl rollout status deployment/risky-deploy

# Now push a broken image — this time 1 old pod WILL be removed first
kubectl set image deployment/risky-deploy app=nginx:broken-tag
kubectl get pods -l app=risky -w &
sleep 15 && kill %1

# State: 2 running old pods + 1 failed new pod = only 2 serving!
kubectl get pods -l app=risky
```

**The lesson:** `maxUnavailable: 0` is a safety net. If you use `maxUnavailable: 1` (or the 25% default), a bad rollout CAN reduce capacity. Always use `maxUnavailable: 0` with a `readinessProbe` for zero-risk deployments.

---

## Cleanup

```bash
kubectl config set-context --current --namespace=default
kubectl delete namespace workloads-lab
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | Deploy with Deployment | 3-replica nginx running from YAML |
| 2 | Scale up/down | `kubectl scale` changed pod count correctly |
| 3 | ReplicaSet self-heals | Deleted pod was recreated within seconds |
| 4 | Rolling update | Updated from nginx:1.24 → 1.25 with zero downtime |
| 5 | Safe rollback | Bad image rolled back with `rollout undo` |
| 6 | DaemonSet | One pod per node; can't be scaled manually |
| 7 | CronJob | Scheduled execution with job history |
| 8 | maxUnavailable risk | Saw how wrong strategy can reduce capacity |
