# Appendix A: YAML Crash Course

> **For readers who need a quick YAML refresher before diving into Kubernetes manifests.**

---

## Why YAML?

Kubernetes uses YAML (YAML Ain't Markup Language) for all resource definitions. It's human-readable and supports complex nested structures. Every `kubectl apply -f` command reads a YAML file.

---

## Core Syntax Rules

### 1. Indentation is Meaning

YAML uses **spaces** (not tabs!) to indicate hierarchy. Two spaces per level is the convention in Kubernetes:

```yaml
spec:
  containers:       # 2 spaces
    - name: nginx   # 4 spaces (nested under containers)
      image: nginx  # 4 spaces (same level as name)
```

> ⚠️ **Warning:** NEVER use tabs in YAML. Use spaces only. Most text editors can be configured to convert tabs to spaces — do it.

### 2. Key-Value Pairs

```yaml
apiVersion: apps/v1      # string value
replicas: 3              # integer value
enabled: true            # boolean value
name: null               # null value
```

### 3. Strings

```yaml
simple: hello world          # no quotes needed for simple strings
quoted: "hello: world"       # quotes required if string contains special chars
multiline: |                 # literal block (preserves newlines)
  line one
  line two
folded: >                    # folded block (newlines become spaces)
  this is all
  one line
```

### 4. Lists (Sequences)

```yaml
# Block style (most common in K8s)
fruits:
  - apple
  - banana
  - cherry

# Inline style
fruits: [apple, banana, cherry]

# List of objects (the "-" starts each item)
containers:
  - name: nginx
    image: nginx:latest
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

| Mistake | Wrong | Right |
|---|---|---|
| Tab indentation | `\tname: nginx` | `  name: nginx` (spaces) |
| Missing quotes on special strings | `value: yes:no` | `value: "yes:no"` |
| Wrong list item indent | `containers:` / `- name: x` (same level) | `containers:` / `  - name: x` (indented) |
| Incorrect boolean | `enabled: True` | `enabled: true` (lowercase) |
| YAML interpreted as number | `version: 1.10` (becomes 1.1) | `version: "1.10"` |

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
          image: nginx:latest
```

---

## Multiple Resources in One File

Separate resources with `---`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
data:
  key: value
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-deployment
spec:
  # ...
```

---

## Useful YAML Validation Tools

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
