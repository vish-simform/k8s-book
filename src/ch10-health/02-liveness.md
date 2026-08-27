# 10.2 Liveness Probes — Restart the Stuck

⏱️ **5 min read · 6 min hands-on** · 🟡 Intermediate

> **TL;DR:** A liveness probe answers "Is this container still functional?" If it fails `failureThreshold` times in a row, Kubernetes kills and restarts the container. Use it for apps that can get stuck without crashing.

> **After this section you will be able to:**
> - Configure HTTP, TCP, and Exec liveness probes to detect deadlocked processes
> - Tune `initialDelaySeconds`, `periodSeconds`, `timeoutSeconds`, and `failureThreshold`
> - Avoid catastrophic restart loops caused by overly aggressive liveness timeouts

---

## Liveness Probe in Action

```yaml
spec:
  containers:
  - name: app
    image: myapp:latest
    livenessProbe:
      httpGet:
        path: /health/live    # Your liveness endpoint
        port: 8080
      initialDelaySeconds: 15   # Wait 15s after start (app startup time)
      periodSeconds: 20         # Check every 20s
      timeoutSeconds: 5         # Fail if no response in 5s
      failureThreshold: 3       # Restart after 3 consecutive failures (60s window)
      successThreshold: 1       # Once is enough to be "live"
```

**Timeline with failure:**

```
t=0s    Container starts
t=15s   First liveness check → 200 OK ✅
t=35s   App deadlocks internally
t=55s   Liveness check → timeout ❌ (1/3)
t=75s   Liveness check → timeout ❌ (2/3)
t=95s   Liveness check → timeout ❌ (3/3)
t=95s   Kubernetes restarts the container
t=95s   Container starts fresh — deadlock cleared
```

---

## What Your Liveness Endpoint Should Check

The `/health/live` endpoint should verify the app's core functionality — not dependencies:

```python
# ✅ Good liveness check — verifies internal state
@app.get("/health/live")
def liveness():
    # Check internal state only
    if worker_thread_pool.is_hung():
        raise HTTPException(503, "Thread pool hung")
    if memory_usage() > 95:
        raise HTTPException(503, "Out of memory")
    return {"status": "ok"}

# ❌ Bad liveness check — checks external database
@app.get("/health/live")
def liveness():
    db.execute("SELECT 1")  # If DB is slow, liveness fails → restart loop!
    return {"status": "ok"}
```

> ⚠️ **Warning:** Never check external dependencies (database, cache, third-party APIs) in a liveness probe. If the database goes down, ALL pods restart in a loop, causing total application failure. Check **only internal app state**.

---

## Liveness with exec

For apps without an HTTP server (batch jobs, workers):

```yaml
livenessProbe:
  exec:
    command:
    - sh
    - -c
    - "test -f /tmp/healthy && test $(( $(date +%s) - $(stat -c %Y /tmp/healthy) )) -lt 60"
  # App touches /tmp/healthy every 30s to signal it's alive
  # If the file is more than 60s old, something's wrong
  periodSeconds: 30
  failureThreshold: 2
```

```python
# App code touches the file regularly
import os, time

def main_loop():
    while True:
        process_message()
        # Touch the health file — I'm still alive
        open('/tmp/healthy', 'w').close()
        time.sleep(10)
```

---

## Liveness with TCP

For protocols that don't speak HTTP (Redis, Postgres, etc.):

```yaml
livenessProbe:
  tcpSocket:
    port: 6379         # Just checks if Redis accepts a TCP connection
  initialDelaySeconds: 10
  periodSeconds: 15
```

TCP is a shallow check — it verifies the port is open but not that the service is responding correctly.

---

## Common Liveness Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No `initialDelaySeconds` | App restarts before it finishes starting | Set to 2x startup time |
| Checking DB in liveness | DB slowness triggers restart loop | Only check internal state |
| `failureThreshold: 1` | One blip restarts the container | Use 3+ to avoid noise |
| `timeoutSeconds` too short | Slow but healthy response = failure | Test actual response times |
| No liveness probe at all | Stuck apps stay stuck forever | Always add one |

---

### Try It

```bash
# Deploy an app with liveness probe
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: liveness-demo
spec:
  containers:
  - name: app
    image: nginx:1.25
    livenessProbe:
      httpGet:
        path: /
        port: 80
      initialDelaySeconds: 5
      periodSeconds: 10
      failureThreshold: 3
    resources:
      limits:
        memory: "64Mi"
        cpu: "100m"
EOF

kubectl wait pod liveness-demo --for=condition=Ready --timeout=30s

# Watch the probe succeed
kubectl describe pod liveness-demo | grep -A5 "Liveness:"

# Now simulate a failure by blocking nginx
# We'll delete the index.html so nginx returns 403 (which liveness will detect as... still 403 is OK)
# More dramatically: stop nginx inside the container
kubectl exec liveness-demo -- nginx -s stop

# Watch the container get restarted
kubectl get pod liveness-demo -w
```

**Expected output after nginx stops:**
```
NAME             READY   STATUS    RESTARTS   AGE
liveness-demo    1/1     Running   0          30s
liveness-demo    0/1     Running   1          60s   ← restarted!
liveness-demo    1/1     Running   1          63s   ← healthy again
```

```bash
kubectl delete pod liveness-demo
```

---

## Key Takeaways

| # | Concept | One-liner |
|---|---------|-----------|
| 1 | Liveness = restart trigger | Container killed and restarted after `failureThreshold` failures |
| 2 | Check internal state only | Never check databases or external services |
| 3 | `initialDelaySeconds` critical | Prevents restart loops during normal startup |
| 4 | 3+ failure threshold | Tolerates transient blips |

---

## ✅ Quick Check

**Q1:** Your liveness probe has `failureThreshold: 3` and `periodSeconds: 10`. The app is slow for 25 seconds then recovers. Is the container restarted?

<details>
<summary>Answer</summary>
No. Three consecutive failures takes 30 seconds (3 × 10s). If the app recovers within 25 seconds, only 2 checks fail before the 3rd check passes. Since failures must be **consecutive**, a passing check resets the failure counter to 0. The container is not restarted.
</details>

**Q2:** A liveness probe check times out after `timeoutSeconds: 5`. Is that counted as a failure?

<details>
<summary>Answer</summary>
Yes. A timeout (no response within `timeoutSeconds`) is counted the same as an HTTP non-2xx response or a non-zero exec exit code. It increments the failure counter toward `failureThreshold`.
</details>

**Q3:** You have a stateful app where restarting corrupts in-flight transactions. Should you use a liveness probe?

<details>
<summary>Answer</summary>
Use it carefully. Consider using only a readiness probe (removes from load balancer) rather than a liveness probe (restarts). For truly stateful apps where restart = data loss or corruption, a liveness probe can do more harm than good. Use an `exec` probe that checks a very specific recoverable condition, and set a high `failureThreshold` to avoid spurious restarts.
</details>
