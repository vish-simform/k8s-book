# 16.3 Kubernetes Manifest Validation in CI

⏱️ **5 min read · 6 min hands-on** · 🔴 Advanced

> **TL;DR:** Validating Kubernetes manifests in CI catches broken YAML, schema violations, security misconfigurations, and policy violations **before they reach the cluster** — where they'd cause failed deployments or runtime security issues. The three layers: **syntax** (`kubectl --dry-run`), **schema** (`kubeconform`), and **policy** (Kyverno CLI or OPA conftest).

> **After this section you will be able to:**
> - Implement three-tier CI validation: syntax checking, schema validation (`kubeconform`), and policy linting
> - Enforce organizational standards and best practices before code reaches cluster environments
> - Prevent broken YAML and misconfigurations from ever entering the deployment pipeline

---

## Why Validate Manifests in CI?

Without manifest validation in CI, problems surface only after `kubectl apply`:

| Problem | Caught by | Without CI validation, discovered when... |
|---------|-----------|-------------------------------------------|
| YAML syntax error | kubectl / kubeconform | `kubectl apply` fails |
| Unknown API field typo | kubeconform | Pod silently ignores field; bug at runtime |
| Wrong API version (`extensions/v1beta1` removed) | kubeconform | `kubectl apply` returns API not found |
| Missing resource limits | Kyverno/OPA | HPA can't scale; node OOM |
| Image uses `latest` tag | Kyverno/OPA | Non-reproducible deployments |
| Missing required labels | Kyverno/OPA | Monitoring alerts don't fire |
| Privileged container | Kyverno/OPA | Security incident |

---

## Layer 1: kubectl dry-run (Syntax + Server-Side Validation)

```bash
# Client-side dry-run (no cluster needed): checks YAML syntax
kubectl apply -f manifests/ --dry-run=client

# Server-side dry-run (requires cluster): validates against live API schema
# (catches deprecated API versions, field validation, admission webhooks)
kubectl apply -f manifests/ --dry-run=server

# Useful for Kustomize and Helm in CI:
kustomize build overlays/production | kubectl apply --dry-run=server -f -
helm template my-app ./chart --values values-prod.yaml | kubectl apply --dry-run=server -f -
```

> **Limitation:** `--dry-run=server` requires cluster access. In CI, you'd connect to a staging or test cluster.

---

## Layer 2: kubeconform (Schema Validation, No Cluster Needed)

`kubeconform` validates manifests against the Kubernetes JSON schema — **no cluster required**. It catches deprecated API versions and unknown fields:

```bash
# Install
curl -L https://github.com/yannh/kubeconform/releases/latest/download/kubeconform-linux-amd64.tar.gz \
  | tar -xz && sudo mv kubeconform /usr/local/bin/

# Validate a directory of manifests
kubeconform -summary -output tap manifests/

# Validate against a specific Kubernetes version (important for upgrade planning)
kubeconform -kubernetes-version 1.29.0 manifests/

# Validate Kustomize output
kustomize build overlays/production | kubeconform -summary -

# Validate Helm output
helm template my-app ./chart --values values-prod.yaml | kubeconform -summary -

# Include CRD schemas (for ArgoCD Application, Prometheus Rules, etc.)
kubeconform \
  -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
  manifests/
```

**Example output:**
```
Summary: 12 resources found in 4 files - Valid: 11, Invalid: 1, Errors: 0, Skipped: 0
manifests/ingress.yaml - Ingress networking.k8s.io/v1beta1 my-ingress failed validation:
  For Kubernetes 1.29.0: could not find schema for networking.k8s.io/v1beta1/Ingress
  (API removed in 1.22, use networking.k8s.io/v1)
```

---

## Layer 3: Kyverno CLI (Policy Validation)

Kyverno can run in the CLI (without a cluster) to evaluate policies against manifests:

```bash
# Install Kyverno CLI
curl -LO https://github.com/kyverno/kyverno/releases/latest/download/kyverno-cli_linux_x86_64.tar.gz
tar -xvf kyverno-cli_linux_x86_64.tar.gz && sudo mv kyverno /usr/local/bin/

# Apply a policy file against manifests
kyverno apply policies/ --resource manifests/

# Apply built-in Pod Security policies
kyverno apply \
  https://github.com/kyverno/policies/raw/main/pod-security/restricted/require-run-as-non-root-user/require-run-as-non-root-user.yaml \
  --resource manifests/deployment.yaml
```

**Example custom policies for CI:**

```yaml
# policies/require-resource-limits.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resource-limits
spec:
  validationFailureAction: Enforce
  rules:
  - name: check-container-limits
    match:
      any:
      - resources:
          kinds: [Deployment, StatefulSet, DaemonSet]
    validate:
      message: "All containers must have CPU and memory limits defined"
      pattern:
        spec:
          template:
            spec:
              containers:
              - resources:
                  limits:
                    cpu: "?*"
                    memory: "?*"
---

# policies/no-latest-tag.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: no-latest-tag
spec:
  validationFailureAction: Enforce
  rules:
  - name: check-image-tag
    match:
      any:
      - resources:
          kinds: [Deployment, StatefulSet, DaemonSet, Pod]
    validate:
      message: "Images must not use 'latest' tag"
      pattern:
        spec:
          =(initContainers):
          - image: "!*:latest"
          containers:
          - image: "!*:latest"
---

# policies/require-labels.yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-labels
spec:
  validationFailureAction: Enforce
  rules:
  - name: check-labels
    match:
      any:
      - resources:
          kinds: [Deployment]
    validate:
      message: "Deployments must have 'app', 'version', and 'team' labels"
      pattern:
        metadata:
          labels:
            app: "?*"
            version: "?*"
            team: "?*"
```

---

## Layer 4: OPA Conftest (General Policy Engine)

Conftest uses Open Policy Agent (OPA) Rego for more complex, custom policies:

```bash
# Install conftest
curl -L https://github.com/open-policy-agent/conftest/releases/latest/download/conftest_Linux_x86_64.tar.gz \
  | tar -xz && sudo mv conftest /usr/local/bin/

# Run policies against manifests
conftest test manifests/ --policy policies/

# Example Rego policy (policies/deny-root.rego):
```

```rego
# policies/deny-root.rego
package main

deny[msg] {
  input.kind == "Deployment"
  container := input.spec.template.spec.containers[_]
  not container.securityContext.runAsNonRoot
  msg := sprintf("Container '%s' must set runAsNonRoot=true", [container.name])
}

deny[msg] {
  input.kind == "Deployment"
  not input.spec.template.spec.securityContext.runAsNonRoot
  msg := sprintf("Deployment '%s' must set pod-level runAsNonRoot=true", [input.metadata.name])
}

warn[msg] {
  input.kind == "Deployment"
  not input.metadata.labels.team
  msg := sprintf("Deployment '%s' is missing 'team' label", [input.metadata.name])
}
```

---

## Complete CI Validation Job (GitHub Actions)

<details>
<summary>⚙️ <b>Full CI Manifest Validation Pipeline (click to expand)</b></summary>

```yaml
# .github/workflows/validate-manifests.yaml
name: Validate Kubernetes Manifests

on:
  pull_request:
    paths:
    - 'k8s/**'
    - 'helm/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Install kubeconform
      run: |
        curl -L https://github.com/yannh/kubeconform/releases/latest/download/kubeconform-linux-amd64.tar.gz \
          | tar -xz && sudo mv kubeconform /usr/local/bin/

    - name: Install Kyverno CLI
      run: |
        curl -LO https://github.com/kyverno/kyverno/releases/latest/download/kyverno-cli_linux_x86_64.tar.gz
        tar -xvf kyverno-cli_linux_x86_64.tar.gz && sudo mv kyverno /usr/local/bin/

    - name: Install Kustomize
      run: |
        curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
        sudo mv kustomize /usr/local/bin/

    # Step 1: kubectl dry-run client (syntax only)
    - name: kubectl dry-run (client)
      run: kubectl apply -f k8s/base/ --dry-run=client

    # Step 2: Schema validation with kubeconform
    - name: kubeconform schema validation
      run: |
        kustomize build k8s/overlays/production | \
          kubeconform -summary -kubernetes-version 1.29.0 -strict -

    # Step 3: Policy validation with Kyverno
    - name: Kyverno policy check
      run: |
        kustomize build k8s/overlays/production > /tmp/manifests.yaml
        kyverno apply policies/ --resource /tmp/manifests.yaml

    # Step 4: Helm lint + schema check
    - name: Helm lint
      run: helm lint ./helm/my-app/ --values helm/my-app/values-prod.yaml

    - name: Helm kubeconform
      run: |
        helm template my-app ./helm/my-app/ --values helm/my-app/values-prod.yaml | \
          kubeconform -summary -kubernetes-version 1.29.0 -
```

</details>

---

## ✅ Quick Check

**Q1:** What's the difference between `kubectl apply --dry-run=client` and `--dry-run=server`?

<details>
<summary>Answer</summary>
`--dry-run=client` validates only YAML syntax and basic structure on the local machine — no cluster needed. `--dry-run=server` sends the request to the API server which validates against the live schema, checks field types, evaluates admission webhooks, and detects deprecated/removed API versions — but requires cluster access. For CI without cluster access, use `kubeconform` for schema validation instead of server-side dry-run.
</details>

**Q2:** Why is kubeconform preferred over `kubectl apply --dry-run=client` for schema validation in CI?

<details>
<summary>Answer</summary>
`kubectl --dry-run=client` performs minimal validation — it catches YAML parse errors but doesn't fully validate field names or types against the Kubernetes JSON schema. `kubeconform` validates every field against the Kubernetes OpenAPI schema, catches unknown/misspelled fields, detects removed API versions, and can be pinned to a specific Kubernetes version — all without needing cluster access. It's also much faster and can be run on raw YAML piped from Kustomize or Helm.
</details>

**Q3:** You have a Kyverno policy that blocks `latest` tags. A developer adds `image: nginx:latest` to a Deployment. At which point in the GitOps pipeline is this caught?

<details>
<summary>Answer</summary>
It's caught at **two points** with a well-configured pipeline:
1. **In CI** — the Kyverno CLI job on the PR fails, blocking the merge
2. **At the cluster** — if somehow it reaches the cluster (bypassing CI), the Kyverno admission webhook rejects the pod creation

The CI check is the fast, cheap gate (seconds, no cluster needed). The admission webhook is the defense-in-depth gate. Both are necessary — CI catches it before it's ever committed; the webhook catches anything that slips through (e.g., direct `kubectl apply` bypassing the GitOps flow).
</details>
