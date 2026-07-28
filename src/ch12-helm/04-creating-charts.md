# 12.4 Creating Your Own Chart

⏱️ **~5 min read**

> **TL;DR:** `helm create my-chart` scaffolds a complete, working chart with example templates. Strip it down to what you need and fill in your app's specifics. The scaffold follows best practices (labels, helpers, NOTES.txt) from the start.

---

## Scaffolding a New Chart

```bash
# Create a new chart with all the boilerplate
helm create my-app

# What gets created:
tree my-app
```

```
my-app/
├── Chart.yaml
├── values.yaml
├── charts/
└── templates/
    ├── deployment.yaml
    ├── hpa.yaml
    ├── ingress.yaml
    ├── service.yaml
    ├── serviceaccount.yaml
    ├── _helpers.tpl
    ├── NOTES.txt
    └── tests/
        └── test-connection.yaml
```

The scaffolded chart deploys `nginx` by default — replace values and templates for your app.

---

## Minimal Chart Walkthrough

After `helm create my-app`, the key changes to make:

**1. Update `Chart.yaml`:**
```yaml
name: my-app
description: My Application
version: 0.1.0
appVersion: "1.0.0"
```

**2. Update `values.yaml` defaults:**
```yaml
replicaCount: 2

image:
  repository: myrepo/my-app    # ← Your actual image
  tag: "1.0.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080                   # ← Your app's port

env:                           # Custom values section
  LOG_LEVEL: info
  DB_HOST: postgres-svc

resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "256Mi"
```

**3. Update `templates/deployment.yaml`** to use your custom env section:

```yaml
# In the containers section, add env vars from values:
        env:
        {{- range $key, $val := .Values.env }}
        - name: {{ $key }}
          value: {{ $val | quote }}
        {{- end }}
```

---

## Validating Your Chart

```bash
# Lint for common errors
helm lint my-app/

# Expected output (clean):
# ==> Linting my-app/
# [INFO] Chart.yaml: icon is recommended
# 1 chart(s) linted, 0 chart(s) failed

# Preview rendered YAML (catch template errors)
helm template test-release my-app/ | head -80

# Preview with custom values
helm template test-release my-app/ --values my-prod-values.yaml

# Validate against the cluster API without installing
helm template test-release my-app/ | kubectl apply --dry-run=server -f -
```

---

## Environment-Specific Values Files

```bash
# Directory structure for multi-environment deployment
config/
├── values-base.yaml     # Shared defaults
├── values-dev.yaml      # Dev overrides
├── values-staging.yaml  # Staging overrides
└── values-prod.yaml     # Prod overrides
```

```yaml
# values-prod.yaml — only what differs from base
replicaCount: 5

resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "2"
    memory: "1Gi"

ingress:
  enabled: true
  host: app.mycompany.com

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
```

```bash
# Deploy to each environment
helm install my-app ./my-app/ \
  --values config/values-base.yaml \
  --values config/values-prod.yaml \
  --namespace production \
  --create-namespace
```

---

## Packaging and Sharing a Chart

```bash
# Package the chart into a .tgz archive
helm package my-app/
# Creates: my-app-0.1.0.tgz

# Install from archive
helm install my-release ./my-app-0.1.0.tgz

# Create a simple file-based chart repository
mkdir -p helm-repo/charts
mv my-app-0.1.0.tgz helm-repo/charts/
helm repo index helm-repo/   # Creates index.yaml

# Host with any static file server (GitHub Pages, S3, etc.)
# Users add it with:
# helm repo add my-team https://my-bucket.s3.amazonaws.com/helm-repo/
```

---

### Try It

```bash
# Create and validate a minimal chart
helm create webapp

# Lint it
helm lint webapp/

# Preview the default nginx install
helm template my-webapp webapp/ | grep "kind:" | sort -u

# Update the image to a different one
sed -i 's|repository: nginx|repository: nginxdemo/hello|' webapp/values.yaml
sed -i 's|tag: ""|tag: "plain-text"|' webapp/values.yaml

# Install it
helm install my-webapp ./webapp/ \
  --namespace helm-create-demo \
  --create-namespace \
  --set service.type=NodePort

helm list -n helm-create-demo
kubectl get all -n helm-create-demo

# Cleanup
helm uninstall my-webapp -n helm-create-demo
kubectl delete namespace helm-create-demo
rm -rf webapp/
```

---

## Key Takeaways

| # | Concept | One-liner |
|---|---------|-----------|
| 1 | `helm create` scaffolds | Generates a complete working chart in seconds |
| 2 | `helm lint` catches errors | Run before every install or push to CI |
| 3 | `helm template` previews | See the final YAML before it touches the cluster |
| 4 | Multi-values files | Base + environment-specific overrides scale cleanly |
| 5 | `helm package` distributes | Creates a `.tgz` for sharing via a chart repo |

---

## ✅ Quick Check

**Q1:** `helm lint` shows no errors but the deployment fails after `helm install`. What could cause this?

<details>
<summary>Answer</summary>
`helm lint` validates chart structure and template syntax, but doesn't check Kubernetes API correctness or cluster-specific rules. The deployment could fail due to: image not existing in the registry, insufficient cluster permissions (RBAC), a node selector with no matching nodes, or an invalid resource reference. Use `helm template | kubectl apply --dry-run=server -f -` for deeper validation against a real cluster API.
</details>

**Q2:** You have `values-base.yaml` with `replicaCount: 2` and `values-prod.yaml` with `replicaCount: 5`. Which wins if you pass both with `--values`?

<details>
<summary>Answer</summary>
The last `--values` file wins. `helm install ... --values values-base.yaml --values values-prod.yaml` — `values-prod.yaml` overrides `values-base.yaml`. The replica count is `5`. This is the intentional merge behavior — base first, environment-specific last.
</details>

**Q3:** Can you add custom top-level keys to `values.yaml` (like `env:` in the example above) that don't appear in the upstream chart?

<details>
<summary>Answer</summary>
Yes — for your own charts, you define all values yourself, so you can add any structure you want. For third-party charts from repositories, you should only use keys that exist in the chart's `values.yaml` — unknown keys are silently ignored by templates that don't reference them (they don't cause errors, they just have no effect).
</details>
