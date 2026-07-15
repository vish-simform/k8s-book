# 7.1 ConfigMaps — Externalizing Configuration

⏱️ **~5 min read**

> **TL;DR:** A ConfigMap stores non-sensitive configuration as key-value pairs. It decouples your container image from its configuration — the same image can run in dev, staging, and prod with different ConfigMaps injected at runtime.

---

## The Problem: Hardcoded Config

```dockerfile
# Bad: config baked into the image
ENV DB_HOST=prod-db.internal
ENV MAX_CONNECTIONS=100
ENV LOG_LEVEL=info
```

Now you can't reuse the same image in dev (different DB), staging (different log level), or if the DB hostname changes.

> 🔗 **Docker Parallel:** In Compose, you use `.env` files or `environment:` keys. In Kubernetes, ConfigMaps serve the same purpose — but they're cluster objects that multiple pods can reference.

---

## Creating ConfigMaps

**Three ways to create a ConfigMap:**

```bash
# Method 1: From literal values
kubectl create configmap app-config \
  --from-literal=DB_HOST=postgres-svc \
  --from-literal=DB_PORT=5432 \
  --from-literal=LOG_LEVEL=info \
  --from-literal=MAX_CONNECTIONS=100

# Method 2: From a .env file
# Create app.env:
# DB_HOST=postgres-svc
# DB_PORT=5432
# LOG_LEVEL=info
kubectl create configmap app-config --from-env-file=app.env

# Method 3: From a file (key = filename, value = file content)
kubectl create configmap nginx-config --from-file=nginx.conf

# Method 4: Declarative YAML (preferred for GitOps)
```

**Declarative YAML (preferred):**

```yaml
# configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
  namespace: default
data:
  # Simple key-value pairs
  DB_HOST: "postgres-svc"
  DB_PORT: "5432"
  LOG_LEVEL: "info"
  MAX_CONNECTIONS: "100"

  # Multi-line config file content
  app.properties: |
    server.port=8080
    server.timeout=30
    feature.dark-mode=true

  nginx.conf: |
    server {
      listen 80;
      location / {
        proxy_pass http://backend:8080;
      }
    }
```

```bash
kubectl apply -f configmap.yaml
kubectl get configmap app-config
kubectl describe configmap app-config
```

---

## What ConfigMaps Store

ConfigMaps hold **strings only**. For binary data, use the `binaryData` field (base64-encoded), but this is uncommon — Secrets handle sensitive binary data better.

```yaml
data:
  key: "value"              # Simple string
  port: "5432"              # Numbers stored as strings — always quote them
  config.yaml: |            # Multi-line file content
    key: value
    nested:
      key: value
```

> ⚠️ **Warning:** ConfigMaps have a size limit of **1 MiB**. They're for configuration, not bulk data. If you need larger config files, use an init container to fetch them from an external source.

---

### Try It

```bash
# Create a ConfigMap declaratively
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: demo-config
data:
  APP_ENV: "production"
  MAX_RETRIES: "3"
  config.json: |
    {
      "debug": false,
      "timeout": 30,
      "retries": 3
    }
EOF

# View it
kubectl get configmap demo-config -o yaml

# See the data fields
kubectl get configmap demo-config \
  -o jsonpath='{range .data}{@}{"\n"}{end}'

# Cleanup
kubectl delete configmap demo-config
```

---

## Key Takeaways

| # | Concept | One-liner |
|---|---------|-----------|
| 1 | ConfigMap = configuration container | Stores strings: env vars, config file contents |
| 2 | Decouples image from config | Same image, different ConfigMaps per environment |
| 3 | 1 MiB limit | For config only — not bulk data |
| 4 | YAML preferred | Declarative ConfigMaps belong in Git |

---

## ✅ Quick Check

**Q1:** You update a ConfigMap while pods are running. Do the pods see the new values immediately?

<details>
<summary>Answer</summary>
It depends on how the ConfigMap is consumed. Pods that read ConfigMap values as **environment variables** do NOT see updates — env vars are set at container startup and don't change while the container is running. Pods that consume ConfigMaps as **volume-mounted files** WILL see updates within ~60 seconds (kubelet polling interval). For env vars, you need to restart (rolling-update) the pods.
</details>

**Q2:** Should you store a database password in a ConfigMap?

<details>
<summary>Answer</summary>
No. ConfigMaps store data in plain text — it's visible to anyone with `kubectl get configmap` access. For sensitive data (passwords, API keys, tokens, certs), use Secrets (section 7.2). Secrets have access control mechanisms that ConfigMaps don't.
</details>

**Q3:** You have three environments (dev, staging, prod) each with different DB hostnames. What's the recommended approach?

<details>
<summary>Answer</summary>
Create a ConfigMap named `app-config` in each namespace (or cluster), each with the appropriate `DB_HOST` value. Your pod spec references `app-config` without environment-specific logic — Kubernetes injects the right values based on which namespace/cluster the pod runs in. Same YAML, different ConfigMaps per environment.
</details>
