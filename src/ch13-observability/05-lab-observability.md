# Lab: Full Observability Stack on Minikube

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | Sections 13.1–13.4 read, `helm version` works, Minikube running with ≥4 GB RAM |
| **Difficulty** | 🟠 Intermediate–Advanced |
| **What you'll do** | Deploy a metrics-emitting app, install Prometheus + Grafana via Helm, query metrics with PromQL, set up Loki for logs, and build a custom Grafana dashboard |

## Objectives

- [ ] Enable metrics-server and use `kubectl top`
- [ ] Install the kube-prometheus-stack via Helm
- [ ] Deploy a sample app that exposes Prometheus metrics
- [ ] Query metrics using PromQL in the Prometheus UI
- [ ] Access Grafana and explore pre-built Kubernetes dashboards
- [ ] Build a custom panel for application-level metrics
- [ ] Install Loki and view logs in Grafana
- [ ] Write an alerting rule and observe it firing

---

## Setup

```bash
# Ensure Minikube has enough resources (restart if needed)
minikube config set memory 4096
minikube config set cpus 2

# If Minikube isn't running yet:
# minikube start --memory=4096 --cpus=2

# Verify status
minikube status
kubectl get nodes

# Create dedicated namespace
kubectl create namespace monitoring
kubectl create namespace obs-lab
```

---

## Exercise 1: metrics-server and kubectl top

**What we're doing:** Enable the built-in metrics-server addon and explore resource usage.

```bash
# Enable metrics-server
minikube addons enable metrics-server

# Deploy a load-generating workload to have something to measure
kubectl apply -f - <<'EOF' -n obs-lab
apiVersion: apps/v1
kind: Deployment
metadata:
  name: load-app
spec:
  replicas: 3
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
        image: nginx:alpine
        resources:
          requests:
            cpu: "50m"
            memory: "32Mi"
          limits:
            cpu: "100m"
            memory: "64Mi"
EOF

# Wait for pods
kubectl rollout status deployment/load-app -n obs-lab

# Wait ~60 seconds for metrics-server to collect data
sleep 60

# View resource usage
kubectl top nodes
kubectl top pods -n obs-lab
kubectl top pods -n obs-lab --sort-by=cpu
```

**Expected output:**
```
NAME                         CPU(cores)   MEMORY(bytes)
load-app-xxx-aaa             2m           3Mi
load-app-xxx-bbb             1m           3Mi
load-app-xxx-ccc             2m           3Mi
```

---

## Exercise 2: Install Prometheus + Grafana Stack

**What we're doing:** Install the production-grade monitoring stack via Helm.

```bash
# Add Prometheus community chart repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# Install the full kube-prometheus-stack
# (This takes 2-4 minutes to download and start)
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set grafana.adminPassword=admin123 \
  --set prometheus.prometheusSpec.retention=1h \
  --set alertmanager.alertmanagerSpec.storage.volumeClaimTemplate.spec.resources.requests.storage=512Mi \
  --timeout 5m

# Watch pods come up
kubectl get pods -n monitoring -w
# Press Ctrl+C when all are Running

# Verify all components
kubectl get pods -n monitoring
```

**Expected pods (all Running):**
```
alertmanager-monitoring-kube-prometheus-alertmanager-0   2/2   Running
monitoring-grafana-xxxxx                                 3/3   Running
monitoring-kube-prometheus-operator-xxxxx                1/1   Running
monitoring-kube-state-metrics-xxxxx                      1/1   Running
monitoring-prometheus-node-exporter-xxxxx                1/1   Running (on each node)
prometheus-monitoring-kube-prometheus-prometheus-0       2/2   Running
```

---

## Exercise 3: Deploy a Metrics-Emitting App

**What we're doing:** Deploy a real Python app that exposes Prometheus metrics on `/metrics`.

```bash
# Create the app — a Flask server with prometheus_client
kubectl apply -f - <<'EOF' -n obs-lab
apiVersion: v1
kind: ConfigMap
metadata:
  name: metrics-app-code
data:
  app.py: |
    from flask import Flask, Response
    from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
    import time, random, threading

    app = Flask(__name__)

    # Define metrics
    REQUEST_COUNT = Counter('http_requests_total', 'Total HTTP requests',
                            ['method', 'endpoint', 'status'])
    REQUEST_LATENCY = Histogram('http_request_duration_seconds', 'Request duration',
                                ['endpoint'],
                                buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5])
    ACTIVE_REQUESTS = Gauge('http_active_requests', 'Currently active requests')
    ERROR_SIMULATION = Gauge('error_injection_active', '1 if errors are being injected')

    error_mode = False

    @app.route('/')
    def home():
        with ACTIVE_REQUESTS.track_inprogress():
            start = time.time()
            time.sleep(random.uniform(0.01, 0.05))
            status = "500" if error_mode and random.random() < 0.3 else "200"
            REQUEST_COUNT.labels(method='GET', endpoint='/', status=status).inc()
            REQUEST_LATENCY.labels(endpoint='/').observe(time.time() - start)
            if status == "500":
                return "Internal Server Error", 500
            return "Hello from metrics-app! Visit /metrics to see Prometheus data.\n"

    @app.route('/slow')
    def slow():
        with ACTIVE_REQUESTS.track_inprogress():
            start = time.time()
            time.sleep(random.uniform(0.5, 2.0))
            REQUEST_COUNT.labels(method='GET', endpoint='/slow', status='200').inc()
            REQUEST_LATENCY.labels(endpoint='/slow').observe(time.time() - start)
            return "That was slow!\n"

    @app.route('/error-on')
    def error_on():
        global error_mode
        error_mode = True
        ERROR_SIMULATION.set(1)
        return "Error injection ON — 30% of / requests will return 500\n"

    @app.route('/error-off')
    def error_off():
        global error_mode
        error_mode = False
        ERROR_SIMULATION.set(0)
        return "Error injection OFF\n"

    @app.route('/metrics')
    def metrics():
        return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)

    if __name__ == '__main__':
        app.run(host='0.0.0.0', port=8080)
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metrics-app
  labels:
    app: metrics-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: metrics-app
  template:
    metadata:
      labels:
        app: metrics-app
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8080"
        prometheus.io/path: "/metrics"
    spec:
      initContainers:
      - name: install-deps
        image: python:3.11-slim
        command: ["pip", "install", "--target=/app/deps", "flask", "prometheus-client"]
        volumeMounts:
        - name: app-deps
          mountPath: /app/deps
      containers:
      - name: app
        image: python:3.11-slim
        command: ["python", "/app/code/app.py"]
        env:
        - name: PYTHONPATH
          value: "/app/deps"
        ports:
        - containerPort: 8080
        resources:
          requests:
            cpu: "50m"
            memory: "64Mi"
          limits:
            cpu: "200m"
            memory: "128Mi"
        readinessProbe:
          httpGet:
            path: /metrics
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 5
        volumeMounts:
        - name: app-code
          mountPath: /app/code
        - name: app-deps
          mountPath: /app/deps
      volumes:
      - name: app-code
        configMap:
          name: metrics-app-code
      - name: app-deps
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: metrics-app
  labels:
    app: metrics-app
spec:
  selector:
    app: metrics-app
  ports:
  - port: 80
    targetPort: 8080
    nodePort: 30880
  type: NodePort
EOF

# Wait for pods to be ready (init container installs deps, may take 1-2 min)
kubectl rollout status deployment/metrics-app -n obs-lab

# Test the app
MINIKUBE_IP=$(minikube ip)
curl http://$MINIKUBE_IP:30880/
curl http://$MINIKUBE_IP:30880/metrics | head -30
```

**Expected metrics output (excerpt):**
```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{endpoint="/",method="GET",status="200"} 3.0

# HELP http_request_duration_seconds Request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{endpoint="/",le="0.05"} 3.0
...
```

### Generate Some Traffic

```bash
# Send 200 requests to generate meaningful metrics
for i in $(seq 1 200); do
  curl -s http://$MINIKUBE_IP:30880/ > /dev/null
  sleep 0.1
done &

# Also hit the slow endpoint
for i in $(seq 1 20); do
  curl -s http://$MINIKUBE_IP:30880/slow > /dev/null &
done

echo "Traffic generation running in background..."
```

---

## Exercise 4: Explore the Prometheus UI

**What we're doing:** Use the Prometheus UI to run PromQL queries.

```bash
# Port-forward Prometheus UI
kubectl port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090 -n monitoring &

echo "Open http://localhost:9090 in your browser"
```

In the Prometheus UI (`http://localhost:9090`):

1. Click **Status → Targets** — confirm `obs-lab/metrics-app` pods appear with `UP` state
2. Go to the **Graph** tab and run these queries:

```promql
-- Paste each query and click Execute --

-- Request rate (req/s)
rate(http_requests_total{namespace="obs-lab"}[5m])

-- Total requests by status code
sum by (status) (rate(http_requests_total{namespace="obs-lab"}[5m]))

-- p95 latency
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{namespace="obs-lab"}[5m])))

-- Active pods in obs-lab
count(kube_pod_status_phase{namespace="obs-lab", phase="Running"})

-- Memory usage in MB
container_memory_usage_bytes{namespace="obs-lab", container="app"} / 1024 / 1024
```

3. Click the **Graph** tab (not Table) for each query to see the time series visualization.

---

## Exercise 5: Grafana Dashboards

**What we're doing:** Access Grafana and build a custom dashboard.

```bash
# Port-forward Grafana (use a new terminal or kill the Prometheus port-forward first)
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring &

echo "Open http://localhost:3000"
echo "Login: admin / admin123"
```

### Step A: Explore Pre-Built Dashboards

1. Log in at `http://localhost:3000`
2. Go to **Dashboards → Browse**
3. Open **"Kubernetes / Compute Resources / Namespace (Pods)"**
4. Set the namespace dropdown to `obs-lab`
5. Observe CPU and memory for your `metrics-app` and `load-app` pods

### Step B: Create a Custom Dashboard

1. Click **Dashboards → New → New Dashboard**
2. Click **Add visualization**
3. Select **Prometheus** as the data source

**Panel 1 — Request Rate:**
```promql
sum by (status) (rate(http_requests_total{namespace="obs-lab"}[5m]))
```
- Panel type: **Time Series**
- Title: `HTTP Request Rate`
- Unit: `reqps`
- Legend: `Status {{status}}`

4. Click **Apply** then **Add** → **Visualization** for the next panel.

**Panel 2 — p95 Latency:**
```promql
histogram_quantile(0.95,
  sum by (le)(rate(http_request_duration_seconds_bucket{namespace="obs-lab"}[5m])))
```
- Panel type: **Time Series**
- Title: `p95 Request Latency`
- Unit: `seconds`

**Panel 3 — Error Rate %:**
```promql
(sum(rate(http_requests_total{namespace="obs-lab",status=~"5.."}[5m]))
  /
sum(rate(http_requests_total{namespace="obs-lab"}[5m]))) * 100
```
- Panel type: **Gauge**
- Title: `Error Rate`
- Unit: `percent (0-100)`
- Thresholds: Green=0, Yellow=1, Red=5

5. Click **Save dashboard** → Name it `"obs-lab: My App"`

---

## Exercise 6: Inject Errors and Watch Metrics Change

**What we're doing:** Simulate a production incident and watch metrics react in real time.

```bash
# Enable error injection in the app
curl http://$MINIKUBE_IP:30880/error-on
# Expected: Error injection ON — 30% of / requests will return 500

# Generate traffic with errors
for i in $(seq 1 300); do
  curl -s http://$MINIKUBE_IP:30880/ > /dev/null
  sleep 0.1
done
```

1. **Watch your Grafana dashboard** — the Error Rate gauge should climb to ~30%
2. **In Prometheus UI** (`http://localhost:9090`), query:

```promql
sum(rate(http_requests_total{status="500"}[1m]))
  /
sum(rate(http_requests_total[1m])) * 100
```

3. Turn off errors and watch recovery:
```bash
curl http://$MINIKUBE_IP:30880/error-off
```

---

## Exercise 7: Write an Alerting Rule

**What we're doing:** Create a PrometheusRule that fires when error rate exceeds 5%.

```bash
kubectl apply -f - <<'EOF' -n monitoring
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: obs-lab-alerts
  labels:
    release: monitoring
spec:
  groups:
  - name: obs-lab
    interval: 15s
    rules:
    - alert: ObsLabHighErrorRate
      expr: |
        (sum(rate(http_requests_total{namespace="obs-lab",status=~"5.."}[2m]))
          /
        sum(rate(http_requests_total{namespace="obs-lab"}[2m]))) * 100 > 5
      for: 1m
      labels:
        severity: warning
        team: platform
      annotations:
        summary: "High error rate in obs-lab"
        description: "Error rate is {{ $value | printf \"%.1f\" }}% (threshold: 5%)"
    - alert: ObsLabPodNotReady
      expr: |
        kube_pod_status_phase{namespace="obs-lab", phase!="Running"} == 1
      for: 2m
      labels:
        severity: critical
      annotations:
        summary: "Pod {{ $labels.pod }} is not Running"
EOF

# Verify the rule was picked up by Prometheus
kubectl get prometheusrule -n monitoring

# Check in Prometheus UI → Alerts tab
# Open http://localhost:9090/alerts
```

**Trigger the alert:**
```bash
# Turn errors back on and generate enough traffic to exceed the 5% threshold
curl http://$MINIKUBE_IP:30880/error-on

for i in $(seq 1 500); do
  curl -s http://$MINIKUBE_IP:30880/ > /dev/null
  sleep 0.05
done

# Check Prometheus → Alerts — should show ObsLabHighErrorRate as Firing
echo "Check http://localhost:9090/alerts"
```

---

## Exercise 8: Loki — Logs in Grafana (Optional, Extra Credit)

**What we're doing:** Install Loki and view Kubernetes logs directly in Grafana.

```bash
# Add Grafana Helm repo
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Loki + Promtail (lightweight log collector)
helm install loki grafana/loki-stack \
  --namespace monitoring \
  --set grafana.enabled=false \
  --set promtail.enabled=true \
  --set loki.persistence.enabled=false

# Wait for Loki and Promtail
kubectl rollout status statefulset/loki -n monitoring
kubectl get pods -n monitoring | grep -E "loki|promtail"
```

**Add Loki as a Grafana data source:**

1. In Grafana → **Configuration → Data Sources → Add data source**
2. Select **Loki**
3. URL: `http://loki:3100`
4. Click **Save & Test** — should show "Data source connected"

**Explore logs:**

1. Go to **Explore** (compass icon in left sidebar)
2. Select **Loki** data source
3. Run these LogQL queries:

```logql
# All logs from obs-lab namespace
{namespace="obs-lab"}

# Filter for error lines
{namespace="obs-lab"} |= "500"

# Python app logs only
{namespace="obs-lab", container="app"}

# Count error lines per minute (metric query)
sum(count_over_time({namespace="obs-lab"} |= "500" [1m]))
```

4. Switch to **Logs** view to see individual log lines with timestamp

---

## 🔥 Break It! Challenge

> Scale your `metrics-app` to 0 replicas and observe what happens to each layer of observability.

```bash
# Scale to zero
kubectl scale deployment metrics-app --replicas=0 -n obs-lab

# Wait 2 minutes then check:
# 1. kubectl top pods -n obs-lab          → metrics-app gone
# 2. Prometheus → Targets                 → metrics-app targets "down" or missing
# 3. Grafana Request Rate panel           → line drops to 0
# 4. Prometheus → Alerts                  → ObsLabPodNotReady should fire
# 5. Loki → {namespace="obs-lab"}         → no new log lines

# Now scale back and observe recovery
kubectl scale deployment metrics-app --replicas=2 -n obs-lab

kubectl rollout status deployment/metrics-app -n obs-lab

# 6. Generate traffic again and watch metrics recover
for i in $(seq 1 100); do curl -s http://$MINIKUBE_IP:30880/ > /dev/null; sleep 0.1; done
```

**What did you observe?**
- How long did it take for Prometheus to detect the targets were down?
- How long before the alert fired (remember `for: 2m`)?
- How long after scale-up before metrics reappeared?
- Were there any log gaps?

---

## Cleanup

```bash
# Stop port-forwards
kill %1 %2 2>/dev/null || true

# Remove the monitoring stack
helm uninstall monitoring -n monitoring
helm uninstall loki -n monitoring 2>/dev/null || true

# Remove the lab namespace and all its resources
kubectl delete namespace obs-lab

# Remove the monitoring namespace
kubectl delete namespace monitoring
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | metrics-server | `kubectl top pods` showed live CPU/memory |
| 2 | Prometheus via Helm | Full kube-prometheus-stack running in `monitoring` |
| 3 | App instrumentation | metrics-app exposed `/metrics` with 4 Golden Signals |
| 4 | Prometheus UI + PromQL | Queried request rate, latency, error rate |
| 5 | Grafana dashboards | Explored pre-built K8s dashboards |
| 6 | Custom panels | Built dashboard with 3 panels for app metrics |
| 7 | Live incident simulation | Injected 30% errors, watched metrics react in real time |
| 8 | Alerting rules | PrometheusRule fired ObsLabHighErrorRate alert |
| 9 | Loki logs | Installed Loki, queried logs via LogQL in Grafana |
