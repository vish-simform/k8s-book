# Appendix A: YAML Crash Course for Kubernetes

> **TL;DR:** YAML is the language of Kubernetes manifests. This appendix covers just enough YAML to write, read, and debug manifests without getting burned by whitespace, types, or syntax gotchas.

---

## The Basics

### 1. Key-Value Pairs

```yaml
name: my-app
port: 8080
enabled: true
```

- Keys and values are separated by `: ` (colon followed by a space).
- Values don't need quotes unless they contain special characters (`:`, `{`, `}`, `[`, `]`, `,`, `&`, `*`, `#`, `?`, `|`, `-`, `<`, `>`, `=`, `!`, `%`, `@`, `\`).

### 2. Indentation Matters

- Use **2 spaces** per indentation level.
- **NEVER use tabs.** (YAML parsers will reject tabs with syntax errors.)
- Children must be indented further than their parents.

```yaml
parent:
  child:
    grandchild: value
```

### 3. Strings and Quotes

```yaml
# Plain string (no quotes needed)
message: Hello World

# String with special characters (quotes required)
url: "https://example.com:8080"
selector: "app=web,tier=frontend"

# Multi-line string (preserves newlines: |)
script: |
  #!/bin/bash
  echo "Starting..."
  python app.py

# Multi-line string (folds newlines into spaces: >)
description: >
  This is a long description
  that will be joined into
  a single line.
```

### 4. Lists (Arrays)

```yaml
# Block style (preferred in K8s)
fruits:
  - apple
  - banana
  - cherry

# Inline style
fruits: [apple, banana, cherry]

# List of objects (the "-" starts each item)
containers:
  - name: nginx
    image: nginx:1.25
  - name: sidecar
    image: busybox:1.36
```

### 5. Nested Objects

```yaml
resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "256Mi"
```

---

## Common YAML Mistakes

| Mistake | Avoid | Preferred / Right |
|---|---|---|
| Tab indentation | `\tname: nginx` | `  name: nginx` (2 spaces) |
| Missing quotes on special strings | `value: yes:no` | `value: "yes:no"` |
| Wrong list item indent | `containers:` / `- name: x` (same level) | `containers:` / `  - name: x` (indented) |
| Non-standard boolean | `enabled: True` | `enabled: true` (lowercase) |
| YAML interpreted as number | `version: 1.10` (becomes 1.1) | `version: "1.10"` |

> 💡 **Note:** YAML 1.1 (used by Kubernetes) technically accepts `True`, `TRUE`, `yes`, `on` as truthy values. However, the **strong convention** in Kubernetes manifests is lowercase `true`/`false`. Using non-standard variants may confuse teammates and linters.

---

## Anatomy of a Kubernetes YAML File

Every K8s YAML has these four top-level fields:

```yaml
apiVersion: apps/v1       # which API group and version
kind: Deployment          # what type of resource
metadata:                 # name, namespace, labels, annotations
  name: my-deployment
  namespace: default
  labels:
    app: my-app
spec:                     # the desired state (varies by resource type)
  replicas: 3
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: my-container
          image: nginx:1.25
```

---

## Multiple Resources in One File

Separate resources with `---`:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  ports:
    - port: 80
  selector:
    app: my-app
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deployment
spec:
  replicas: 2
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: web
          image: nginx:1.25
```

---

## Validating YAML

```bash
# Validate YAML syntax (not K8s schema)
python3 -c "import yaml; yaml.safe_load(open('manifest.yaml'))"

# Validate against K8s schema
kubectl apply --dry-run=client -f manifest.yaml

# Server-side validation (requires cluster connection)
kubectl apply --dry-run=server -f manifest.yaml

# kubeconform (fast, offline validation)
kubeconform manifest.yaml
```

---

## Quick Reference: Common K8s YAML Patterns

### Environment Variables

```yaml
env:
  - name: DB_HOST
    value: "postgres-service"
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: db-secret
        key: password
  - name: POD_NAME
    valueFrom:
      fieldRef:
        fieldPath: metadata.name
```

### Resource Requests/Limits

```yaml
resources:
  requests:
    cpu: "100m"      # 100 millicores = 0.1 CPU
    memory: "128Mi"  # 128 mebibytes
  limits:
    cpu: "500m"
    memory: "256Mi"
```

### Volume Mounts

```yaml
# In the container spec:
volumeMounts:
  - name: data-volume
    mountPath: /data
  - name: config-volume
    mountPath: /etc/config
    readOnly: true

# In the pod spec (same level as containers:):
volumes:
  - name: data-volume
    persistentVolumeClaim:
      claimName: my-pvc
  - name: config-volume
    configMap:
      name: my-configmap
```

---

## ✅ Quick Check

**Q1:** Why must port numbers or versions like `version: 1.10` be wrapped in quotes?

<details>
<summary>Answer</summary>
Without quotes, the YAML parser interprets <code>1.10</code> as a floating-point number <code>1.1</code> (dropping trailing zeros), or evaluates unquoted values like <code>PORT: 80</code> as integers when a string was expected by the API schema.
</details>

**Q2:** What happens if you accidentally use tabs instead of spaces in a manifest?

<details>
<summary>Answer</summary>
The YAML parser will reject the manifest with a syntax error such as <code>mapping values are not allowed here</code> or <code>found character '\t' that cannot start any token</code>. Kubernetes manifests require 2 spaces per indentation level.
</details>
