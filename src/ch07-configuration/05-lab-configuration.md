# Lab: Configure a 12-Factor App

⏱️ **~25 min hands-on**

| | |
|---|---|
| **Prerequisites** | Chapter 7 sections 7.1–7.4 read, Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Deploy a realistic multi-tier app with config/secrets injected via env vars and volume mounts, observe live config updates, and simulate secret rotation |

## Objectives

- [ ] Create ConfigMaps for app config and an nginx config file
- [ ] Create Secrets for database credentials and an API key
- [ ] Deploy an app that reads from both env vars and mounted files
- [ ] Update a ConfigMap and observe live propagation via volume mount
- [ ] Rotate a Secret and trigger a rolling restart
- [ ] Debug a missing ConfigMap reference

---

## Setup

```bash
kubectl create namespace config-lab
kubectl config set-context --current --namespace=config-lab
```

---

## Exercise 1: Create ConfigMaps

**What we're doing:** Create two ConfigMaps — one for simple key-value config, one for a config file.

```bash
# ConfigMap 1: App settings
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: config-lab
data:
  APP_ENV: "production"
  LOG_LEVEL: "info"
  MAX_CONNECTIONS: "50"
  CACHE_TTL: "300"
  ALLOWED_HOSTS: "myapp.local,localhost"
EOF

# ConfigMap 2: NGINX config file (to be mounted as a file)
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
  namespace: config-lab
data:
  default.conf: |
    server {
        listen 80;
        server_name _;

        add_header X-Config-Source "ConfigMap" always;
        add_header X-App-Env "$APP_ENV" always;

        location /health {
            return 200 "OK\n";
            add_header Content-Type text/plain;
        }

        location / {
            root /usr/share/nginx/html;
            index index.html;
        }
    }
EOF

kubectl get configmap -n config-lab
```

---

## Exercise 2: Create Secrets

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
  namespace: config-lab
type: Opaque
stringData:
  DB_HOST: "postgres-svc.config-lab.svc.cluster.local"
  DB_USER: "appuser"
  DB_PASSWORD: "InitialPassword123!"
  DB_NAME: "appdb"
---
apiVersion: v1
kind: Secret
metadata:
  name: api-keys
  namespace: config-lab
type: Opaque
stringData:
  STRIPE_SECRET_KEY: "sk_test_abcdefghijklmnopqrstuvwx"
  SENDGRID_API_KEY: "SG.xxxxxxxxxxxxxxxx"
  JWT_SECRET: "my-jwt-signing-secret-minimum-32-chars-long"
EOF

# Verify Secrets exist (values are hidden)
kubectl get secrets -n config-lab

# Decode to verify (this is what an attacker would do too)
kubectl get secret db-credentials -n config-lab \
  -o jsonpath='{.data.DB_PASSWORD}' | base64 --decode
echo ""
```

---

## Exercise 3: Deploy the App

**What we're doing:** Deploy nginx with config injected via both env vars and volume mounts.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webapp
  namespace: config-lab
spec:
  replicas: 2
  selector:
    matchLabels:
      app: webapp
  template:
    metadata:
      labels:
        app: webapp
    spec:
      volumes:
      # ConfigMap as a file (nginx config)
      - name: nginx-conf-vol
        configMap:
          name: nginx-config
      # Secret as files (credentials)
      - name: secret-vol
        secret:
          secretName: db-credentials
          defaultMode: 0400

      containers:
      - name: nginx
        image: nginx:1.25
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "32Mi"
            cpu: "50m"
          limits:
            memory: "64Mi"
            cpu: "100m"

        # Env vars from ConfigMap (simple values)
        envFrom:
        - configMapRef:
            name: app-config

        # Individual Secret values as env vars
        env:
        - name: STRIPE_KEY
          valueFrom:
            secretKeyRef:
              name: api-keys
              key: STRIPE_SECRET_KEY

        volumeMounts:
        # Mount nginx config file
        - name: nginx-conf-vol
          mountPath: /etc/nginx/conf.d
          readOnly: true
        # Mount credentials as files
        - name: secret-vol
          mountPath: /etc/secrets
          readOnly: true
EOF

kubectl rollout status deployment/webapp -n config-lab
```

Verify configuration was injected:

```bash
POD=$(kubectl get pods -n config-lab -l app=webapp -o name | head -1)

echo "=== Environment Variables from ConfigMap ==="
kubectl exec -n config-lab $POD -- env | grep -E "APP_ENV|LOG_LEVEL|MAX_CONN|CACHE_TTL"

echo ""
echo "=== Secret value as env var ==="
kubectl exec -n config-lab $POD -- sh -c 'echo "STRIPE_KEY starts with: ${STRIPE_KEY:0:10}..."'

echo ""
echo "=== Volume-mounted nginx config ==="
kubectl exec -n config-lab $POD -- cat /etc/nginx/conf.d/default.conf

echo ""
echo "=== Volume-mounted secret files ==="
kubectl exec -n config-lab $POD -- ls -la /etc/secrets/
kubectl exec -n config-lab $POD -- cat /etc/secrets/DB_USER
echo ""
```

**Expected output (partial):**
```
=== Environment Variables from ConfigMap ===
APP_ENV=production
LOG_LEVEL=info
MAX_CONNECTIONS=50
CACHE_TTL=300

=== Volume-mounted nginx config ===
server {
    listen 80;
    ...
    add_header X-Config-Source "ConfigMap" always;
    ...

=== Volume-mounted secret files ===
-r-------- 1 root root  11 DB_HOST
-r-------- 1 root root   7 DB_USER
-r-------- 1 root root  19 DB_PASSWORD
-r-------- 1 root root   5 DB_NAME
```

---

## Exercise 4: Live Config Update via Volume Mount

**What we're doing:** Update the nginx ConfigMap and watch the file change inside the container automatically.

```bash
# Record the current config file's last-modified time inside the pod
POD=$(kubectl get pods -n config-lab -l app=webapp -o name | head -1)
kubectl exec -n config-lab $POD -- stat /etc/nginx/conf.d/default.conf | grep Modify

# Update the ConfigMap — change a header value
kubectl patch configmap nginx-config -n config-lab \
  --type='merge' \
  -p='{"data":{"default.conf":"server {\n    listen 80;\n    server_name _;\n\n    add_header X-Config-Source \"ConfigMap-v2\" always;\n\n    location /health {\n        return 200 \"OK-v2\\n\";\n        add_header Content-Type text/plain;\n    }\n\n    location / {\n        root /usr/share/nginx/html;\n        index index.html;\n    }\n}\n"}}'

echo "ConfigMap updated. Waiting ~60 seconds for kubelet to propagate..."
sleep 65

# Check if the file changed (kubelet propagated the update)
kubectl exec -n config-lab $POD -- stat /etc/nginx/conf.d/default.conf | grep Modify
kubectl exec -n config-lab $POD -- grep "Config-Source" /etc/nginx/conf.d/default.conf
```

**Expected:**
```
# Before:
Modify: 2026-07-15 05:30:00.000000000 +0000

# After ~60 seconds:
Modify: 2026-07-15 05:31:05.000000000 +0000  ← changed!
    add_header X-Config-Source "ConfigMap-v2" always;  ← new value!
```

> 💡 **Note:** The file updated automatically without any pod restart. However, nginx doesn't reload its config automatically — you'd need to send SIGHUP to nginx or use an init container/sidecar that watches for file changes and reloads.

---

## Exercise 5: Secret Rotation

**What we're doing:** Simulate a database password rotation.

```bash
# Current password
kubectl exec -n config-lab $POD -- cat /etc/secrets/DB_PASSWORD
echo ""

# Rotate the password
kubectl create secret generic db-credentials \
  -n config-lab \
  --from-literal=DB_HOST="postgres-svc.config-lab.svc.cluster.local" \
  --from-literal=DB_USER="appuser" \
  --from-literal=DB_PASSWORD="RotatedPassword456!" \
  --from-literal=DB_NAME="appdb" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "Secret updated. Waiting ~60 seconds for kubelet propagation..."
sleep 65

# New password is live in the file — no pod restart needed
kubectl exec -n config-lab $POD -- cat /etc/secrets/DB_PASSWORD
echo ""

# However — the env var DB_PASSWORD is NOT updated (if it were set via env)
# Env vars are static: compare with STRIPE_KEY (set via env, not file):
kubectl exec -n config-lab $POD -- env | grep STRIPE_KEY
```

**Expected:**
```
# Before rotation:
InitialPassword123!

# After ~60 seconds:
RotatedPassword456!   ← updated via volume mount, no restart needed
```

---

## Exercise 6: Debug a Missing ConfigMap

**What we're doing:** Create a pod that references a non-existent ConfigMap and diagnose the failure.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: missing-config-pod
  namespace: config-lab
spec:
  containers:
  - name: app
    image: nginx:1.25
    envFrom:
    - configMapRef:
        name: this-configmap-does-not-exist   # ← doesn't exist
    resources:
      limits:
        memory: "32Mi"
        cpu: "50m"
EOF

# Pod stays in Pending / CreateContainerConfigError
kubectl get pod missing-config-pod -n config-lab

# Describe to see the error
kubectl describe pod missing-config-pod -n config-lab | tail -15
```

**Expected describe output (Events):**
```
Warning  Failed     Error: configmap "this-configmap-does-not-exist" not found
```

Fix it:

```bash
# Create the missing ConfigMap
kubectl create configmap this-configmap-does-not-exist \
  -n config-lab \
  --from-literal=PLACEHOLDER=true

# Pod should start now (K8s retries)
kubectl get pod missing-config-pod -n config-lab -w
```

---

## 🔥 Break It! Challenge

> What happens when a ConfigMap is deleted while pods are running?

```bash
# Create a pod with a volume-mounted ConfigMap
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: mounted-cm-pod
  namespace: config-lab
spec:
  volumes:
  - name: cfg
    configMap:
      name: app-config
  containers:
  - name: app
    image: busybox
    command: ["sh", "-c", "while true; do cat /cfg/LOG_LEVEL; sleep 5; done"]
    volumeMounts:
    - name: cfg
      mountPath: /cfg
    resources:
      limits:
        memory: "16Mi"
        cpu: "50m"
EOF

kubectl wait pod mounted-cm-pod -n config-lab --for=condition=Ready --timeout=30s
kubectl logs mounted-cm-pod -n config-lab

# Delete the ConfigMap while the pod is running
kubectl delete configmap app-config -n config-lab

# Check what happens to the pod and the files
sleep 5
kubectl get pod mounted-cm-pod -n config-lab   # Pod still running!
kubectl exec -n config-lab mounted-cm-pod -- cat /cfg/LOG_LEVEL  # Still readable!

# Key insight: deleting a ConfigMap doesn't kill running pods
# The mounted files remain accessible until the pod is restarted
```

**The lesson:** Deleting a ConfigMap doesn't immediately affect running pods that have already mounted it. The files remain cached by kubelet. However, if the pod restarts, it will fail to start — it can't mount a ConfigMap that no longer exists.

---

## Cleanup

```bash
kubectl config set-context --current --namespace=default
kubectl delete namespace config-lab
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | Create ConfigMaps and Secrets | Both deployed successfully with kubectl |
| 2 | Inject as env vars | `env` and `envFrom` blocks populated correctly |
| 3 | Mount as files | Nginx config and credentials visible as files |
| 4 | Live config update | ConfigMap file updated in ~60s without pod restart |
| 5 | Secret rotation | Password changed via volume mount, no restart needed |
| 6 | Missing ConfigMap debugging | Found `configmap not found` error via describe |
| 7 | Delete while running | Running pods keep working; restart would fail |
