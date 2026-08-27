# 12.6 Kustomize — Template-Free Configuration Management

⏱️ **6 min read · 6 min hands-on** · 🟡 Intermediate

> **TL;DR:** Kustomize lets you customize raw, pure Kubernetes YAML manifests without using a templating language. Built directly into `kubectl` via the `-k` flag, Kustomize uses a **base + overlays** model to generate environment-specific variants (dev, staging, prod) through declarative patches, prefixes, and image tag overrides.

> **After this section you will be able to:**
> - Explain how Kustomize's overlay model differs from Helm's Go-template model
> - Structure directories into reusable `base/` resources and environment `overlays/`
> - Generate and apply customized manifests using `kubectl apply -k` and `kustomize build`
> - Choose between Helm, Kustomize, or a hybrid of both for your projects

---

## The Philosophy: Why "Template-Free"?

Helm uses text templating (`{{ .Values.image.repository }}:{{ .Values.image.tag }}`). While flexible, templating has downsides:
- Template files are not valid Kubernetes YAML on their own (you can't lint them with standard tools without rendering first).
- Complex charts can turn into unreadable webs of nested conditionals (`{{ if ... }}`, `{{- range ... }}`).
- Debugging whitespace and indentation errors in templates is frustrating.

**Kustomize takes a different approach:**
1. Every base manifest is **100% valid, vanilla Kubernetes YAML**.
2. Environment differences (different replica counts, resource limits, hostnames) are applied via **declarative patches and overlays**.
3. It requires **no server-side components** and is built natively into `kubectl` (`kubectl apply -k`).

---

## Directory Structure: Base and Overlays

The standard Kustomize project layout separates shared foundations from environment-specific tweaks:

```
my-app/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml
    │   └── dev-patches.yaml
    └── prod/
        ├── kustomization.yaml
        └── replica-patch.yaml
```

---

## Step-by-Step Example

### 1. The Base (`base/`)

`base/deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
      - name: api
        image: myorg/api:1.0.0
        ports:
        - containerPort: 8080
```

`base/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deployment.yaml
  - service.yaml
```

---

### 2. The Development Overlay (`overlays/dev/`)

In development, we want a `dev-` name prefix, debug log levels, and local namespace isolation:

`overlays/dev/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: dev-apps
namePrefix: dev-

resources:
  - ../../base

images:
  - name: myorg/api
    newTag: dev-latest

configMapGenerator:
  - name: api-config
    literals:
      - LOG_LEVEL=DEBUG
      - ENVIRONMENT=development
```

---

### 3. The Production Overlay (`overlays/prod/`)

In production, we scale up replicas and apply strict memory/CPU limits:

`overlays/prod/kustomization.yaml`:
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

namespace: production
namePrefix: prod-

resources:
  - ../../base

images:
  - name: myorg/api
    newTag: v1.0.4 # Pinned release tag

patches:
  - path: prod-resources.yaml
```

`overlays/prod/prod-resources.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
spec:
  replicas: 5
  template:
    spec:
      containers:
      - name: api
        resources:
          requests:
            cpu: "250m"
            memory: "256Mi"
          limits:
            cpu: "1000m"
            memory: "512Mi"
```

---

## Building and Applying Manifests

You can inspect the rendered output or apply it directly to your cluster:

```bash
# Preview the generated YAML without applying
kubectl kustomize overlays/prod/

# Apply the overlay directly to your cluster
kubectl apply -k overlays/prod/

# Delete everything declared in the overlay
kubectl delete -k overlays/prod/
```

---

## Helm vs. Kustomize Comparison

| Feature | Helm | Kustomize |
|---|---|---|
| **Mechanism** | Go template rendering (`{{ .Values... }}`) | Declarative overlay transformations & patches |
| **Tooling** | Requires `helm` CLI binary | Built into `kubectl` (`kubectl apply -k`) |
| **Release Tracking** | Tracks releases with Secret metadata (`helm list`, `helm rollback`) | No release metadata (relies on Git / GitOps) |
| **Manifest Validity** | Raw templates are invalid YAML until rendered | Base and patches are always valid YAML |
| **Dependency Mgmt** | Built-in chart dependencies (`Chart.yaml`) | Submodule or remote Git URL references |
| **Best For** | Distributing third-party off-the-shelf software (Prometheus, cert-manager, Redis) | Managing your team's internal application manifests across multiple environments |

> 💡 **Best Practice (The Hybrid Model):** Many production teams use **Helm** to download third-party software charts (or render them with `helm template`), and use **Kustomize** to manage their proprietary microservices and GitOps repository overlays.

---

## ✅ Quick Check

**Q1:** What is the primary difference between `kubectl apply -f` and `kubectl apply -k`?

<details>
<summary>Answer</summary>
<code>kubectl apply -f</code> takes standard directory or manifest file paths and applies them as-is. <code>kubectl apply -k</code> targets a directory containing a <code>kustomization.yaml</code> file, runs the Kustomize engine to execute transformations (name prefixes, namespace injection, image tag overrides, patches), and applies the generated output.
</details>

**Q2:** When should you prefer Kustomize over Helm?

<details>
<summary>Answer</summary>
Kustomize is preferred for your organization's first-party internal applications where you want to maintain clean, readable, lintable vanilla YAML without template syntax errors, especially in GitOps workflows (ArgoCD / Flux). Helm is better when packaging applications for third-party distribution with complex variable knobs.
</details>
