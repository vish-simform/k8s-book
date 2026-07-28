# Lab: Package and Deploy a Multi-Tier App

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | `helm version` works, Chapter 12 sections 12.1–12.5 read, Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Install a community chart, create your own chart from scratch, deploy to dev and prod with different values, upgrade, and roll back |

## Objectives

- [ ] Install and configure the NGINX Ingress Controller via Helm
- [ ] Install a community chart (Bitnami nginx) with custom values
- [ ] Create a custom Helm chart for a simple web app
- [ ] Deploy to "dev" and "prod" namespaces with different values
- [ ] Simulate a bad upgrade and roll back
- [ ] Inspect release history

---

## Setup

```bash
# Verify Helm is installed
helm version --short

# Add Bitnami repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

kubectl create namespace helm-lab-dev
kubectl create namespace helm-lab-prod
```

---

## Exercise 1: Install a Community Chart

**What we're doing:** Install Bitnami's nginx with custom values.

```bash
# First, preview configurable values
helm show values bitnami/nginx | head -60

# Create a custom values file
cat <<'EOF' > nginx-values.yaml
replicaCount: 1

service:
  type: NodePort

resources:
  requests:
    cpu: "50m"
    memory: "64Mi"
  limits:
    cpu: "100m"
    memory: "128Mi"

autoscaling:
  enabled: false

serverBlock: |-
  server {
    listen 0.0.0.0:8080;
    location / {
      return 200 "Hello from Helm-managed nginx!\n";
      add_header Content-Type text/plain;
    }
    location /health {
      return 200 "OK\n";
      add_header Content-Type text/plain;
    }
  }

containerPorts:
  http: 8080
EOF

# Install it
helm install community-nginx bitnami/nginx \
  --namespace helm-lab-dev \
  --values nginx-values.yaml

helm list -n helm-lab-dev
kubectl get pods -n helm-lab-dev
```

Test it:

```bash
# Wait for ready
kubectl rollout status deployment/community-nginx -n helm-lab-dev

# Get the NodePort
NODE_PORT=$(kubectl get svc community-nginx -n helm-lab-dev \
  -o jsonpath='{.spec.ports[0].nodePort}')
MINIKUBE_IP=$(minikube ip)

curl http://$MINIKUBE_IP:$NODE_PORT
# Expected: Hello from Helm-managed nginx!

curl http://$MINIKUBE_IP:$NODE_PORT/health
# Expected: OK
```

---

## Exercise 2: Create Your Own Chart

**What we're doing:** Build a chart from scratch for a simple "info-app".

```bash
# Scaffold the chart
helm create info-app

# Update Chart.yaml
cat <<'EOF' > info-app/Chart.yaml
apiVersion: v2
name: info-app
description: A simple info web application
type: application
version: 0.1.0
appVersion: "1.0.0"
EOF

# Update values.yaml
cat <<'EOF' > info-app/values.yaml
replicaCount: 1

image:
  repository: nginxdemo/hello
  tag: "plain-text"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80
  targetPort: 80

ingress:
  enabled: false

resources:
  requests:
    cpu: "50m"
    memory: "32Mi"
  limits:
    cpu: "100m"
    memory: "64Mi"

env:
  APP_COLOR: blue
  APP_ENV: development

autoscaling:
  enabled: false
  minReplicas: 1
  maxReplicas: 5
  targetCPU: 70

podAnnotations: {}
EOF

# Update the deployment template to inject env vars
cat <<'EOF' > info-app/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "info-app.fullname" . }}
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "info-app.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "info-app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "info-app.selectorLabels" . | nindent 8 }}
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - containerPort: {{ .Values.service.targetPort }}
        env:
        {{- range $key, $val := .Values.env }}
        - name: {{ $key }}
          value: {{ $val | quote }}
        {{- end }}
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
        readinessProbe:
          httpGet:
            path: /
            port: {{ .Values.service.targetPort }}
          initialDelaySeconds: 5
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /
            port: {{ .Values.service.targetPort }}
          initialDelaySeconds: 10
          periodSeconds: 15
          failureThreshold: 3
EOF

# Lint and validate
helm lint info-app/
helm template test-release info-app/ | grep "kind:" | sort -u
```

**Expected lint output:**
```
==> Linting info-app/
[INFO] Chart.yaml: icon is recommended
1 chart(s) linted, 0 chart(s) failed
```

---

## Exercise 3: Deploy to Dev and Prod

**What we're doing:** Install the same chart with different values per environment.

```bash
# Dev values
cat <<'EOF' > values-dev.yaml
replicaCount: 1
env:
  APP_COLOR: blue
  APP_ENV: development
service:
  type: NodePort
resources:
  requests:
    cpu: "50m"
    memory: "32Mi"
  limits:
    cpu: "100m"
    memory: "64Mi"
EOF

# Prod values
cat <<'EOF' > values-prod.yaml
replicaCount: 2
env:
  APP_COLOR: green
  APP_ENV: production
service:
  type: ClusterIP
resources:
  requests:
    cpu: "100m"
    memory: "64Mi"
  limits:
    cpu: "300m"
    memory: "128Mi"
autoscaling:
  enabled: false
EOF

# Install to dev
helm install info-app ./info-app/ \
  --namespace helm-lab-dev \
  --values values-dev.yaml

# Install to prod
helm install info-app ./info-app/ \
  --namespace helm-lab-prod \
  --values values-prod.yaml

# See both releases
helm list -A | grep info-app

# Verify different replica counts
kubectl get deploy -n helm-lab-dev info-app   # 1 replica
kubectl get deploy -n helm-lab-prod info-app  # 2 replicas
```

---

## Exercise 4: Upgrade and Roll Back

**What we're doing:** Simulate a chart upgrade and a bad upgrade with rollback.

```bash
# First, check current state
helm history info-app -n helm-lab-dev

# Good upgrade: bump replica count
helm upgrade info-app ./info-app/ \
  --namespace helm-lab-dev \
  --values values-dev.yaml \
  --set replicaCount=2

helm history info-app -n helm-lab-dev
kubectl get deploy -n helm-lab-dev info-app  # Now 2 replicas

# Simulate a bad upgrade: use an image tag that doesn't exist
helm upgrade info-app ./info-app/ \
  --namespace helm-lab-dev \
  --values values-dev.yaml \
  --set image.tag=this-tag-does-not-exist \
  --wait \
  --timeout 30s || echo "Upgrade FAILED as expected!"

# Check status
helm list -n helm-lab-dev   # Status: failed
kubectl get pods -n helm-lab-dev   # New pod in ImagePullBackOff

# Rollback to revision 2 (the last good one)
helm rollback info-app 2 -n helm-lab-dev

# Verify rollback succeeded
helm history info-app -n helm-lab-dev
kubectl get pods -n helm-lab-dev   # All pods running with correct image
kubectl get deploy -n helm-lab-dev info-app  # Back to correct state
```

**Expected history after rollback:**
```
REVISION  STATUS     DESCRIPTION
1         superseded  Install complete
2         superseded  Upgrade complete
3         failed      Upgrade failed (... timeout waiting for pods)
4         deployed    Rollback to 2
```

---

## Exercise 5: Release Inspection

```bash
# See what values are active in the dev release
helm get values info-app -n helm-lab-dev

# See the full manifest (all YAML being managed)
helm get manifest info-app -n helm-lab-dev | grep "kind:"

# See all releases with status
helm list -A --output table

# Find the Helm history Secrets
kubectl get secrets -n helm-lab-dev | grep helm.release
```

---

## 🔥 Break It! Challenge

> What happens when you `helm upgrade --install` with a values file that has a syntax error?

```bash
# Create a broken values file
cat <<'EOF' > broken-values.yaml
replicaCount: 2
env:
  APP_COLOR blue   # ← Missing colon!
  APP_ENV: test
EOF

helm upgrade --install info-app ./info-app/ \
  --namespace helm-lab-dev \
  --values broken-values.yaml
```

**Expected:**
```
Error: YAML parse error on broken-values.yaml: ...
       mapping values are not allowed in this context
```

The upgrade fails before reaching the cluster. The running release is **unaffected** — Helm validates values files before applying anything. This is one of Helm's key safety features.

---

## Cleanup

```bash
helm uninstall community-nginx -n helm-lab-dev
helm uninstall info-app -n helm-lab-dev
helm uninstall info-app -n helm-lab-prod

kubectl delete namespace helm-lab-dev helm-lab-prod

rm -f nginx-values.yaml values-dev.yaml values-prod.yaml broken-values.yaml
rm -rf info-app/
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | Install community chart | Bitnami nginx with custom server block running |
| 2 | Custom values override | nginx returned custom response via serverBlock |
| 3 | Create chart from scratch | `helm create` → lint passed → template valid |
| 4 | Multi-environment deploy | Dev (1 replica, NodePort) and Prod (2 replicas, ClusterIP) |
| 5 | Upgrade with new values | Replica count changed via `helm upgrade` |
| 6 | Failed upgrade + rollback | Bad image tag → upgrade failed → rollback to rev 2 |
| 7 | Release inspection | `helm get values/manifest/history` showed release state |
| 8 | YAML error safety | Broken values file rejected before cluster is touched |
