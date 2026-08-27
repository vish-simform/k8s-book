# Lab: Harden a Namespace End-to-End

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | Sections 15.1–15.4 read, Minikube running |
| **Difficulty** | 🟠 Intermediate–Advanced |
| **What you'll do** | Apply Pod Security Standards to block privileged pods, write Network Policies to microsegment a 3-tier app, verify secret RBAC, scan a container image with Trivy, and run a defence-in-depth checklist against a namespace |

## Objectives

- [ ] Apply PSS `baseline` enforcement to a namespace
- [ ] Observe pods blocked for security violations
- [ ] Fix a pod spec to comply with `restricted` PSS
- [ ] Deploy a 3-tier app and apply Network Policies (default-deny + allow-list)
- [ ] Verify network segmentation with connectivity tests
- [ ] Audit secret RBAC and fix overly broad permissions
- [ ] Scan a container image with Trivy
- [ ] Run the full namespace security checklist

---

## Setup

```bash
# Verify Minikube is running
minikube status

# Note: Full Network Policy enforcement requires Calico CNI.
# If your Minikube was started WITHOUT --cni=calico, Network Policy
# exercises will show policies being created but NOT enforced.
# Check your CNI:
kubectl get pods -n kube-system | grep -E "calico|cilium|weave|flannel"

# Create the lab namespace
kubectl create namespace sec-lab

# Label the monitoring namespace (needed for Network Policy exercises)
kubectl label namespace kube-system kubernetes.io/metadata.name=kube-system --overwrite
```

---

## Exercise 1: Pod Security Standards — Enforce Baseline

**What we're doing:** Apply PSS `baseline` enforcement and observe what it blocks.

```bash
# Apply baseline enforcement + restricted warnings to sec-lab
kubectl label namespace sec-lab \
  pod-security.kubernetes.io/enforce=baseline \
  pod-security.kubernetes.io/enforce-version=latest \
  pod-security.kubernetes.io/warn=restricted \
  pod-security.kubernetes.io/warn-version=latest

# Verify labels
kubectl get namespace sec-lab -o jsonpath='{.metadata.labels}' | jq .
```

**Try to create a privileged pod — it should be blocked:**

```bash
kubectl apply -f - <<'EOF' -n sec-lab
apiVersion: v1
kind: Pod
metadata:
  name: bad-pod
spec:
  containers:
  - name: app
    image: nginx:alpine
    securityContext:
      privileged: true      # ← Violates Baseline
EOF

# Expected: Error from server (Forbidden):
# pods "bad-pod" is forbidden: violates PodSecurity "baseline:latest":
# privileged (container "app" must not set securityContext.privileged=true)
```

**Try a pod without securityContext — it's allowed by baseline but triggers restricted warning:**

```bash
kubectl apply -f - <<'EOF' -n sec-lab
apiVersion: v1
kind: Pod
metadata:
  name: warn-pod
spec:
  containers:
  - name: app
    image: nginx:alpine
EOF

# Allowed (no baseline violation), but you'll see warnings like:
# Warning: would violate PodSecurity "restricted:latest":
#   allowPrivilegeEscalation != false (container "app" ...)
#   unrestricted capabilities (container "app" must set ...)
#   runAsNonRoot != true (pod or container "app" must set ...)
#   seccompProfile (pod or container "app" must set ...)
```

---

## Exercise 2: Fix a Pod to Pass Restricted

**What we're doing:** Update the pod spec to satisfy `restricted` PSS.

```bash
# First, upgrade the namespace to enforce restricted
kubectl label namespace sec-lab \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/enforce-version=latest \
  --overwrite

# Now try the same pod — it will be blocked
kubectl delete pod warn-pod -n sec-lab 2>/dev/null || true

kubectl apply -f - <<'EOF' -n sec-lab
apiVersion: v1
kind: Pod
metadata:
  name: warn-pod
spec:
  containers:
  - name: app
    image: nginx:alpine
EOF
# Expected: Forbidden — multiple restricted violations

# Deploy the COMPLIANT version
kubectl apply -f - <<'EOF' -n sec-lab
apiVersion: v1
kind: Pod
metadata:
  name: hardened-pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 101          # nginx user in alpine image
    runAsGroup: 101
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: nginx:alpine
    ports:
    - containerPort: 8080
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
    # nginx needs writable dirs even with readOnlyRootFilesystem
    volumeMounts:
    - name: tmp
      mountPath: /tmp
    - name: nginx-run
      mountPath: /var/run
    - name: nginx-cache
      mountPath: /var/cache/nginx
    resources:
      requests:
        cpu: "50m"
        memory: "32Mi"
      limits:
        cpu: "100m"
        memory: "64Mi"
  volumes:
  - name: tmp
    emptyDir: {}
  - name: nginx-run
    emptyDir: {}
  - name: nginx-cache
    emptyDir: {}
EOF

kubectl get pod hardened-pod -n sec-lab
# STATUS: Running — passes restricted!
```

---

## Exercise 3: Network Policies — 3-Tier App

**What we're doing:** Deploy frontend, backend, and database pods, then microsegment them with Network Policies.

```bash
# Downgrade namespace back to baseline for this exercise
# (the backend image runs as non-root but baseline is sufficient for the demo)
kubectl label namespace sec-lab \
  pod-security.kubernetes.io/enforce=baseline \
  pod-security.kubernetes.io/enforce-version=latest \
  --overwrite

# Deploy the 3-tier app
kubectl apply -n sec-lab -f - <<'EOF'
# Frontend
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
      tier: web
  template:
    metadata:
      labels:
        app: frontend
        tier: web
    spec:
      containers:
      - name: frontend
        image: nginx:alpine
        ports:
        - containerPort: 80
        resources:
          requests: {cpu: "50m", memory: "32Mi"}
---

# Backend
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
      tier: api
  template:
    metadata:
      labels:
        app: backend
        tier: api
    spec:
      containers:
      - name: backend
        image: nginx:alpine
        ports:
        - containerPort: 80
        resources:
          requests: {cpu: "50m", memory: "32Mi"}
---

# Database (simulated with redis)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: database
spec:
  replicas: 1
  selector:
    matchLabels:
      app: database
      tier: db
  template:
    metadata:
      labels:
        app: database
        tier: db
    spec:
      containers:
      - name: db
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        resources:
          requests: {cpu: "50m", memory: "32Mi"}
---

# Services
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  selector:
    app: frontend
  ports:
  - port: 80
---
apiVersion: v1
kind: Service
metadata:
  name: backend
spec:
  selector:
    app: backend
  ports:
  - port: 80
---
apiVersion: v1
kind: Service
metadata:
  name: database
spec:
  selector:
    app: database
  ports:
  - port: 6379
EOF

kubectl rollout status deployment/frontend deployment/backend deployment/database -n sec-lab
```

**Test connectivity BEFORE Network Policies (everything works):**

```bash
# Get the pod names
FRONTEND_POD=$(kubectl get pod -n sec-lab -l app=frontend -o jsonpath='{.items[0].metadata.name}')
BACKEND_POD=$(kubectl get pod -n sec-lab -l app=backend -o jsonpath='{.items[0].metadata.name}')

# Frontend → backend (should succeed)
kubectl exec -n sec-lab $FRONTEND_POD -- wget -q -O- http://backend --timeout=3 && echo "OK"

# Frontend → database (should succeed — NO policies yet)
kubectl exec -n sec-lab $FRONTEND_POD -- wget -q -O- http://database:6379 --timeout=3 2>&1 | head -3
```

**Apply Network Policies:**

```bash
kubectl apply -n sec-lab -f - <<'EOF'
# 1. Default deny all
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
---

# 2. Allow DNS for all pods
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
---

# 3. Allow frontend → backend
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 80
---

# 4. Allow backend → database only
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-to-db
spec:
  podSelector:
    matchLabels:
      app: database
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: backend
    ports:
    - protocol: TCP
      port: 6379
---

# 5. Allow backend egress to database
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-backend-egress-db
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: database
    ports:
    - protocol: TCP
      port: 6379
---

# 6. Allow frontend egress to backend
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-egress-backend
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: backend
    ports:
    - protocol: TCP
      port: 80
EOF

kubectl get networkpolicies -n sec-lab
```

**Verify segmentation AFTER Network Policies (requires Calico CNI):**

```bash
# Frontend → backend: ALLOWED
kubectl exec -n sec-lab $FRONTEND_POD -- \
  wget -q -O- http://backend --timeout=5 && echo "✓ frontend→backend: ALLOWED"

# Frontend → database: BLOCKED
kubectl exec -n sec-lab $FRONTEND_POD -- \
  wget -q -O- http://database:6379 --timeout=5 2>&1 | grep -q "timed out" && \
  echo "✓ frontend→database: BLOCKED" || echo "⚠ frontend→database: REACHED (CNI may not enforce policies)"

# Backend → database: ALLOWED (via redis-cli or nc)
kubectl exec -n sec-lab $BACKEND_POD -- \
  nc -zv database 6379 --wait=3 2>&1 | grep -q "succeeded" && \
  echo "✓ backend→database: ALLOWED"
```

---

## Exercise 4: Secret RBAC Audit

**What we're doing:** Create a secret, check who can access it, and tighten permissions.

```bash
# Create a sensitive secret
kubectl create secret generic app-db-creds \
  --from-literal=username=admin \
  --from-literal=password=s3cr3t-passw0rd \
  -n sec-lab

# Check if the default service account can read secrets (often it can!)
kubectl auth can-i get secrets -n sec-lab \
  --as system:serviceaccount:sec-lab:default
# If "yes" — this is a security gap!

# Create a restricted role that ONLY allows access to the named secret
kubectl apply -n sec-lab -f - <<'EOF'
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: app-secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  resourceNames: ["app-db-creds"]   # Only this specific secret
  verbs: ["get"]
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-sa
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: app-sa-reads-secret
subjects:
- kind: ServiceAccount
  name: app-sa
roleRef:
  kind: Role
  name: app-secret-reader
  apiGroup: rbac.authorization.k8s.io
EOF

# Verify the service account can read only the named secret
kubectl auth can-i get secret/app-db-creds -n sec-lab \
  --as system:serviceaccount:sec-lab:app-sa
# Expected: yes

kubectl auth can-i list secrets -n sec-lab \
  --as system:serviceaccount:sec-lab:app-sa
# Expected: no

kubectl auth can-i get secret/other-secret -n sec-lab \
  --as system:serviceaccount:sec-lab:app-sa
# Expected: no
```

---

## Exercise 5: Image Scanning with Trivy

**What we're doing:** Scan images used in the lab and understand CVE output.

```bash
# Install Trivy if not already installed
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

# Scan the images we're using
trivy image --severity HIGH,CRITICAL nginx:alpine 2>&1 | tail -30
trivy image --severity HIGH,CRITICAL redis:7-alpine 2>&1 | tail -30

# Scan a notoriously vulnerable image (for comparison)
trivy image --severity CRITICAL python:3.8 2>&1 | tail -20

# Scan and get exit code (0=no vulns, 1=vulns found) for CI/CD
trivy image --exit-code 1 --severity CRITICAL nginx:alpine
echo "Exit code: $?"

# Show a full SBOM (software bill of materials)
trivy image --format table nginx:alpine 2>&1 | head -50
```

---

## Exercise 6: Namespace Security Checklist

**What we're doing:** Run a comprehensive check against the sec-lab namespace.

```bash
#!/usr/bin/env bash
# Namespace Security Audit Script
NS="sec-lab"
echo "========================================"
echo " Security Audit for namespace: $NS"
echo "========================================"

# 1. PSS labels
echo ""
echo "--- Pod Security Standards ---"
kubectl get namespace $NS -o jsonpath='{.metadata.labels}' | \
  jq 'with_entries(select(.key | startswith("pod-security")))'

# 2. Network Policies
echo ""
echo "--- Network Policies ---"
NP_COUNT=$(kubectl get networkpolicies -n $NS --no-headers 2>/dev/null | wc -l)
echo "Network policies in namespace: $NP_COUNT"
kubectl get networkpolicies -n $NS 2>/dev/null

# 3. Pods running as root
echo ""
echo "--- Pods running as root (runAsUser=0 or not set) ---"
kubectl get pods -n $NS -o json | jq -r '
  .items[] |
  select(
    (.spec.securityContext.runAsUser == null or .spec.securityContext.runAsUser == 0) and
    (.spec.containers[].securityContext.runAsUser == null or .spec.containers[].securityContext.runAsUser == 0)
  ) |
  .metadata.name'

# 4. Pods with privileged containers
echo ""
echo "--- Privileged containers ---"
kubectl get pods -n $NS -o json | jq -r '
  .items[] |
  select(.spec.containers[].securityContext.privileged == true) |
  .metadata.name'

# 5. Secrets in namespace
echo ""
echo "--- Secrets ---"
kubectl get secrets -n $NS --no-headers | grep -v "default-token\|service-account"

# 6. ServiceAccounts with secret access
echo ""
echo "--- RBAC: who can 'list secrets'? ---"
kubectl auth can-i list secrets -n $NS --as system:serviceaccount:$NS:default
EOF
echo "========================================"
```

```bash
# Run the audit
bash << 'EOF'
NS="sec-lab"
echo "=== Pod Security Standards ==="
kubectl get namespace $NS -o jsonpath='{.metadata.labels}' | tr ',' '\n' | grep pod-security

echo ""
echo "=== Network Policies ==="
kubectl get networkpolicies -n $NS

echo ""
echo "=== Pods with no runAsNonRoot ==="
kubectl get pods -n $NS -o json | jq -r '.items[] | .metadata.name + " | runAsNonRoot: " + ((.spec.securityContext.runAsNonRoot // false) | tostring)'

echo ""
echo "=== Default SA can list secrets? ==="
kubectl auth can-i list secrets -n $NS --as system:serviceaccount:$NS:default

echo ""
echo "=== app-sa can list secrets? ==="
kubectl auth can-i list secrets -n $NS --as system:serviceaccount:$NS:app-sa
EOF
```

---

## 🔥 Break It! Challenge

> What happens when you label the namespace with `enforce=restricted` AFTER pods are already running that violate the policy?

```bash
# Relabel to restricted
kubectl label namespace sec-lab \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/enforce-version=latest \
  --overwrite

# Existing pods are NOT evicted — PSS only applies at admission time
kubectl get pods -n sec-lab
# All pods still Running

# But try to restart one:
kubectl rollout restart deployment/frontend -n sec-lab

# The new pod will be BLOCKED because it doesn't meet restricted requirements
kubectl get pods -n sec-lab -l app=frontend
# New pod stays Pending/Error; old pod still Running

# Check the events
kubectl describe replicaset -n sec-lab -l app=frontend | grep -A 5 "Events:"
# Error creating: pods "frontend-xxx" is forbidden: violates PodSecurity "restricted:latest": ...
```

This is the critical insight: **PSS doesn't evict existing pods** — it only blocks new ones. A misconfigured production namespace can appear healthy while blocking all future rollouts. Always test PSS with `warn` first.

---

## Cleanup

```bash
kubectl delete namespace sec-lab
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | PSS baseline enforcement | `privileged: true` pod rejected with Forbidden error |
| 2 | PSS restricted compliance | Fixed pod spec with all required security fields |
| 3 | Default-deny Network Policy | Applied 6 Network Policies to 3-tier app |
| 4 | Network segmentation | frontend→database blocked; frontend→backend allowed |
| 5 | Secret RBAC | `app-sa` can get named secret only; cannot list secrets |
| 6 | Trivy scanning | Scanned real images, compared CVE counts |
| 7 | PSS rollout trap | Labeling namespace restricted doesn't evict running pods |

## Defence-in-Depth Summary

```
Layer 1: Image Security      → Minimal images, scan for CVEs, sign with Cosign
Layer 2: Pod Security        → PSS restricted, non-root, drop capabilities, seccomp
Layer 3: Network Policies    → Default deny + explicit allow-list per tier
Layer 4: RBAC                → Least-privilege service accounts, named secret access
Layer 5: Secret Management   → Encryption at rest, External Secrets Operator
Layer 6: Admission Control   → Kyverno/Gatekeeper for org policies, registry allowlist
Layer 7: Runtime Detection   → Falco for anomaly detection (exec in container, etc.)
```
