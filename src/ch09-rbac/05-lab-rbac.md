# Lab: Lock Down a Namespace

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | Chapter 9 sections 9.1–9.4 read, Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Create a namespace with ResourceQuota and LimitRange, set up RBAC for a developer persona, create a ServiceAccount for an app, and verify all access controls work as expected |

## Objectives

- [ ] Create a team namespace with ResourceQuota and LimitRange
- [ ] Create a `dev-user` Role that allows read-write but not delete
- [ ] Verify the user can't access other namespaces
- [ ] Create a ServiceAccount for an app pod to call the K8s API
- [ ] Test that ResourceQuota blocks over-limit pod creation
- [ ] Observe the LimitRange injecting default resources

---

## Setup

```bash
# Create the team namespace
kubectl create namespace team-alpha

# Verify it exists
kubectl get namespace team-alpha
```

---

## Exercise 1: Apply ResourceQuota and LimitRange

**What we're doing:** Set namespace-level resource boundaries.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ResourceQuota
metadata:
  name: alpha-quota
  namespace: team-alpha
spec:
  hard:
    requests.cpu: "2"
    requests.memory: 2Gi
    limits.cpu: "4"
    limits.memory: 4Gi
    pods: "5"
    services: "3"
    persistentvolumeclaims: "2"
---
apiVersion: v1
kind: LimitRange
metadata:
  name: alpha-limits
  namespace: team-alpha
spec:
  limits:
  - type: Container
    default:
      cpu: "200m"
      memory: "128Mi"
    defaultRequest:
      cpu: "100m"
      memory: "64Mi"
    max:
      cpu: "1"
      memory: "512Mi"
EOF

# See the quota
kubectl describe resourcequota alpha-quota -n team-alpha
kubectl describe limitrange alpha-limits -n team-alpha
```

**Expected quota output:**
```
Name:              alpha-quota
Namespace:         team-alpha
Resource           Used   Hard
--------           ----   ----
limits.cpu         0      4
limits.memory      0      4Gi
pods               0      5
requests.cpu       0      2
requests.memory    0      2Gi
...
```

---

## Exercise 2: RBAC for a Developer

**What we're doing:** Create a Role that lets a developer manage deployments and view pods/logs, but NOT delete anything or touch secrets.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: developer
  namespace: team-alpha
rules:
# Pods: read and exec, but not delete
- apiGroups: [""]
  resources: ["pods", "pods/log", "pods/exec"]
  verbs: ["get", "list", "watch"]

# Deployments: full management (but not delete)
- apiGroups: ["apps"]
  resources: ["deployments", "replicasets"]
  verbs: ["get", "list", "watch", "create", "update", "patch"]

# Services: create and view
- apiGroups: [""]
  resources: ["services"]
  verbs: ["get", "list", "watch", "create", "update", "patch"]

# ConfigMaps: full access (not Secrets)
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]

# Events: view for debugging
- apiGroups: [""]
  resources: ["events"]
  verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: dev-alice
  namespace: team-alpha
subjects:
- kind: User
  name: alice
  apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: Role
  name: developer
  apiGroup: rbac.authorization.k8s.io
EOF

echo "RBAC applied. Testing permissions..."
```

Test the permissions systematically:

```bash
# What alice CAN do
echo "=== Alice's allowed operations ==="
kubectl auth can-i get pods -n team-alpha --as=alice                      # yes
kubectl auth can-i list deployments -n team-alpha --as=alice              # yes
kubectl auth can-i create deployments -n team-alpha --as=alice            # yes
kubectl auth can-i update deployments -n team-alpha --as=alice            # yes
kubectl auth can-i get configmaps -n team-alpha --as=alice                # yes

echo ""
echo "=== What alice CANNOT do ==="
kubectl auth can-i delete pods -n team-alpha --as=alice                   # no
kubectl auth can-i delete deployments -n team-alpha --as=alice            # no
kubectl auth can-i get secrets -n team-alpha --as=alice                   # no
kubectl auth can-i get pods -n default --as=alice                         # no (wrong namespace)
kubectl auth can-i get pods -n kube-system --as=alice                     # no
```

**Expected output:**
```
=== Alice's allowed operations ===
yes
yes
yes
yes
yes

=== What alice CANNOT do ===
no
no
no
no
no
```

---

## Exercise 3: Namespace Isolation Verification

```bash
# Create resources in other namespaces
kubectl run nginx-default --image=nginx:1.25 -n default

# Alice cannot see pods in other namespaces
kubectl auth can-i list pods -n default --as=alice          # no
kubectl auth can-i list pods -n kube-system --as=alice      # no
kubectl auth can-i list pods --all-namespaces --as=alice    # no

# But cluster-level admin can
kubectl auth can-i list pods -n default                     # yes (you're admin)
kubectl auth can-i list pods -n team-alpha --as=alice       # yes (alice's namespace)

# Cleanup
kubectl delete pod nginx-default -n default
```

---

## Exercise 4: ServiceAccount for App API Access

**What we're doing:** Create an app that reads ConfigMaps from its own namespace via the K8s API.

```bash
# Create the ServiceAccount
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: config-reader
  namespace: team-alpha
automountServiceAccountToken: true
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: configmap-reader
  namespace: team-alpha
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: config-reader-binding
  namespace: team-alpha
subjects:
- kind: ServiceAccount
  name: config-reader
  namespace: team-alpha
roleRef:
  kind: Role
  name: configmap-reader
  apiGroup: rbac.authorization.k8s.io
EOF

# Verify the SA can list configmaps
kubectl auth can-i list configmaps -n team-alpha \
  --as=system:serviceaccount:team-alpha:config-reader          # yes

kubectl auth can-i list secrets -n team-alpha \
  --as=system:serviceaccount:team-alpha:config-reader          # no

# Deploy a pod using this ServiceAccount
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-settings
  namespace: team-alpha
data:
  REGION: "us-east-1"
  TIER: "premium"
---
apiVersion: v1
kind: Pod
metadata:
  name: api-caller
  namespace: team-alpha
spec:
  serviceAccountName: config-reader
  containers:
  - name: app
    image: curlimages/curl:latest
    command: ["sh", "-c", "sleep 3600"]
    resources:
      limits:
        memory: "32Mi"
        cpu: "100m"
EOF

kubectl wait pod api-caller -n team-alpha --for=condition=Ready --timeout=60s

# Call the K8s API from inside the pod using the mounted SA token
kubectl exec -n team-alpha api-caller -- sh -c '
  TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
  NAMESPACE=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)
  
  echo "=== Listing ConfigMaps (allowed) ==="
  curl -s \
    --cacert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
    -H "Authorization: Bearer $TOKEN" \
    "https://kubernetes.default.svc/api/v1/namespaces/$NAMESPACE/configmaps" \
    | grep -o "\"name\":\"[^\"]*\"" | head -5
  
  echo ""
  echo "=== Listing Secrets (forbidden) ==="
  curl -s \
    --cacert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
    -H "Authorization: Bearer $TOKEN" \
    "https://kubernetes.default.svc/api/v1/namespaces/$NAMESPACE/secrets" \
    | grep -o "\"reason\":\"[^\"]*\""
'
```

**Expected output:**
```
=== Listing ConfigMaps (allowed) ===
"name":"app-settings"
"name":"kube-root-ca.crt"

=== Listing Secrets (forbidden) ===
"reason":"Forbidden"
```

---

## Exercise 5: ResourceQuota in Action

**What we're doing:** Prove the quota blocks pod creation over the limit.

```bash
# Create pods up to the limit (quota allows 5 pods)
for i in 1 2 3 4; do
  kubectl run pod-$i --image=nginx:1.25 -n team-alpha
done

# Check quota usage
kubectl describe resourcequota alpha-quota -n team-alpha | grep -E "pods|cpu|memory"
```

**Expected (partial):**
```
pods    4    5   ← 4 used, limit 5
```

```bash
# Create one more (up to the limit)
kubectl run pod-5 --image=nginx:1.25 -n team-alpha

# Try to exceed — this should fail
kubectl run pod-6 --image=nginx:1.25 -n team-alpha
```

**Expected error:**
```
Error from server (Forbidden): pods "pod-6" is forbidden: exceeded quota: alpha-quota,
requested: pods=1, used: pods=5, limited: pods=5
```

---

## Exercise 6: LimitRange Injects Defaults

**What we're doing:** Create a pod without resource specs — watch LimitRange inject them.

```bash
# Pod with NO resource requests or limits
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: no-resources-pod
  namespace: team-alpha
spec:
  containers:
  - name: app
    image: busybox
    command: ["sleep", "60"]
EOF

# Check what resources it actually got
kubectl get pod no-resources-pod -n team-alpha \
  -o jsonpath='{.spec.containers[0].resources}' | python3 -m json.tool
```

**Expected (LimitRange injected these):**
```json
{
    "limits": {
        "cpu": "200m",
        "memory": "128Mi"
    },
    "requests": {
        "cpu": "100m",
        "memory": "64Mi"
    }
}
```

The pod was created without specifying any resources, but LimitRange automatically injected the namespace defaults.

---

## 🔥 Break It! Challenge

> What happens when you try to create a pod that EXCEEDS the LimitRange's max?

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: too-many-resources
  namespace: team-alpha
spec:
  containers:
  - name: app
    image: nginx:1.25
    resources:
      requests:
        memory: "1Gi"    # LimitRange max is 512Mi
        cpu: "2"         # LimitRange max is 1 CPU
      limits:
        memory: "2Gi"    # Way over max
        cpu: "4"         # Way over max
EOF
```

**Expected error:**
```
Error from server (Forbidden): error when creating "STDIN": pods "too-many-resources" is forbidden:
[maximum memory usage per Container is 512Mi, but limit is 2Gi.,
 maximum cpu usage per Container is 1, but limit is 4.]
```

The admission controller rejects the pod at creation time — it never reaches the scheduler.

---

## Cleanup

```bash
kubectl delete namespace team-alpha
kubectl config set-context --current --namespace=default
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | ResourceQuota per namespace | Created with CPU/memory/pod limits |
| 2 | LimitRange defaults | Pod without resources got 100m/64Mi automatically |
| 3 | Role for developer persona | alice has create/update but not delete/secrets |
| 4 | Namespace isolation | alice can't see other namespaces |
| 5 | ServiceAccount API access | Pod called K8s API, got ConfigMaps, denied Secrets |
| 6 | Quota enforcement | 6th pod rejected with `exceeded quota` error |
| 7 | LimitRange max enforcement | Pod with 2Gi memory rejected at admission |
