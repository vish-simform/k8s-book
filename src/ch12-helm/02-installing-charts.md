# 12.2 Installing Charts — `helm install` and Repositories

⏱️ **5 min read · 7 min hands-on** · 🟡 Intermediate

> **TL;DR:** Add a chart repository, search for what you need, preview the default values, customize with a `values.yaml`, and install. The output includes connection instructions from the chart's NOTES.txt.

> **After this section you will be able to:**
> - Add, update, and search chart repositories using the Helm CLI
> - Customize chart configurations using custom `values.yaml` files and `--set` overrides
> - Inspect release status, metadata, and generated notes with `helm status` and `helm list`

---

## Adding a Repository

```bash
# Bitnami hosts production-grade charts for most common services
helm repo add bitnami https://charts.bitnami.com/bitnami

# Other popular repos:
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo add cert-manager https://charts.jetstack.io
helm repo add prometheus https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts

# Update to get the latest chart versions
helm repo update

# List configured repos
helm repo list
```

---

## Finding Charts

```bash
# Search your added repos
helm search repo nginx
helm search repo postgresql

# Search ArtifactHub (the public Helm chart registry)
helm search hub nginx
helm search hub --max-col-width 80 nginx | head -20
```

**ArtifactHub** ([artifacthub.io](https://artifacthub.io)) is the central registry — like Docker Hub but for Helm charts.

---

## Inspecting a Chart Before Installing

```bash
# See all configurable values and their defaults
helm show values bitnami/nginx

# See what the chart installs (brief description)
helm show chart bitnami/nginx

# Full chart README
helm show readme bitnami/nginx

# Preview the actual YAML that would be installed
helm template my-nginx bitnami/nginx | head -60

# Preview with your custom values applied
helm template my-nginx bitnami/nginx --values my-values.yaml | head -80
```

> 💡 **Tip:** Always run `helm show values` and `helm template` before installing a chart in production. You want to know what's being created — especially for charts with many components.

---

## Installing a Chart

**Minimal install with defaults:**

```bash
helm install my-nginx bitnami/nginx \
  --namespace web \
  --create-namespace
```

**With inline value overrides:**

```bash
helm install my-nginx bitnami/nginx \
  --namespace web \
  --create-namespace \
  --set replicaCount=2 \
  --set service.type=NodePort
```

**With a custom values file (recommended for anything beyond trivial):**

```yaml
# nginx-values.yaml
replicaCount: 3

image:
  tag: "1.25.3"

service:
  type: ClusterIP

ingress:
  enabled: true
  hostname: myapp.local
  ingressClassName: nginx

resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "200m"
    memory: "256Mi"

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPU: 50
```

```bash
helm install my-nginx bitnami/nginx \
  --namespace web \
  --create-namespace \
  --values nginx-values.yaml
```

---

## After Installation

```bash
# Check the release
helm status my-nginx -n web

# See all objects created
kubectl get all -n web

# See the NOTES.txt output (connection instructions from chart author)
helm status my-nginx -n web | grep -A20 "NOTES:"

# See computed values (what was actually used)
helm get values my-nginx -n web           # Your overrides only
helm get values my-nginx -n web --all     # All values (including defaults)

# See the full manifest that's running
helm get manifest my-nginx -n web
```

---

## Specifying Chart Versions

```bash
# Install a specific version
helm install my-nginx bitnami/nginx --version 15.4.4

# See available versions
helm search repo bitnami/nginx --versions | head -10
```

---

## `--set` vs `--values` Syntax

```bash
# --set uses dot-notation for nested values
helm install my-app bitnami/nginx \
  --set image.repository=myrepo/myapp \
  --set image.tag=v1.2.3 \
  --set ingress.enabled=true \
  --set "ingress.hosts[0].host=myapp.local"   # List items

# --values uses a YAML file (preferred for multiple values)
helm install my-app bitnami/nginx --values values.yaml

# Both can be combined — --set overrides --values
helm install my-app bitnami/nginx \
  --values base-values.yaml \
  --set image.tag=v1.2.3    # Override just the tag
```

> ⚠️ **Warning:** Don't use `--set` for secrets (passwords, API keys). The value ends up in shell history and Helm release history. Use a separate `secrets.yaml` file or reference Kubernetes Secrets in the chart values.

---

### Try It

```bash
# Add bitnami repo
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update

# Preview what nginx chart installs
helm show chart bitnami/nginx | grep -E "description|version|appVersion"

# Preview computed values for a simple install
helm template test-nginx bitnami/nginx \
  --set replicaCount=2 \
  --set service.type=ClusterIP | grep "kind:" | sort -u

# Install
helm install demo-nginx bitnami/nginx \
  --namespace helm-demo \
  --create-namespace \
  --set replicaCount=1 \
  --set service.type=NodePort

# Verify
helm list -n helm-demo
kubectl get all -n helm-demo

# Cleanup
helm uninstall demo-nginx -n helm-demo
kubectl delete namespace helm-demo
```

---

## Key Takeaways

| # | Concept | One-liner |
|---|---------|-----------|
| 1 | `helm repo add` + `helm repo update` | Register and refresh chart repositories |
| 2 | `helm show values` | See all configurable options before installing |
| 3 | `helm template` | Preview YAML without installing |
| 4 | `--values file.yaml` | Preferred over `--set` for multiple overrides |
| 5 | `helm get manifest` | See what's actually running in the release |

---

## ✅ Quick Check

**Q1:** You need to install two separate PostgreSQL instances (one for auth, one for orders) in the same namespace. How?

<details>
<summary>Answer</summary>
Two `helm install` commands with different release names: `helm install auth-db bitnami/postgresql` and `helm install orders-db bitnami/postgresql`. Each release creates independently named pods, services, PVCs, and secrets. They coexist without conflict.
</details>

**Q2:** You have `base-values.yaml` with shared settings and want to override just the image tag for a hotfix. What command syntax?

<details>
<summary>Answer</summary>
`helm upgrade my-app bitnami/myapp --values base-values.yaml --set image.tag=1.2.4-hotfix`. The `--set` flag overrides the `image.tag` from `base-values.yaml`. Multiple `--values` files and `--set` flags are merged in order — last one wins.
</details>

**Q3:** `helm template` shows the YAML but doesn't install it. When would you use this in a CI pipeline?

<details>
<summary>Answer</summary>
Linting and validation. Pipe `helm template` output to `kubectl apply --dry-run=server -f -` to validate against a real cluster API server without actually creating objects. Or pipe to `kubeval` or `kubeconform` for schema validation without a cluster. This catches YAML errors before a real deployment.
</details>
