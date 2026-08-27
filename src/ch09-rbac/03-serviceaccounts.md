# 9.3 ServiceAccounts — Pod Identities

⏱️ **5 min read · 6 min hands-on** · 🟡 Intermediate

> **TL;DR:** A ServiceAccount is a non-human identity for pods. When a pod needs to call the Kubernetes API (e.g., a CI runner listing pods, or an operator watching CRDs), it authenticates using its ServiceAccount's token. By default, every pod gets the `default` ServiceAccount, which has almost no permissions.

> **After this section you will be able to:**
> - Provision dedicated ServiceAccount identities for in-cluster applications and automation agents
> - Manage projected ServiceAccount tokens and API authentication securely
> - Enforce least-privilege RBAC policies on workload service accounts

---

## Why Pods Need Identities

Some workloads need to interact with the Kubernetes API:

| Workload | API Operations |
|----------|---------------|
| CI/CD runner (e.g., ArgoCD) | List/update Deployments |
| Autoscaler (HPA controller) | Read metrics, scale Deployments |
| Secrets manager (External Secrets) | Read/write Secrets |
| Monitoring (Prometheus) | List pods, read metrics endpoints |
| Custom operator | Watch/create/update custom resources |

Without a ServiceAccount with the right Role, these tools fail with `403 Forbidden` from the API server.

---

## The Default ServiceAccount

Every namespace has a `default` ServiceAccount. All pods use it automatically unless you specify otherwise:

```bash
# See the default ServiceAccount
kubectl get serviceaccount default -n default

# Every pod has a token mounted automatically
kubectl run tmp --image=nginx --rm -it --restart=Never -- \
  cat /var/run/secrets/kubernetes.io/serviceaccount/token
```

The default SA has minimal permissions — by design. Don't add permissions to it (every pod in the namespace inherits them).

---

## Creating and Using a ServiceAccount

```yaml
# serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-lister
  namespace: monitoring
```

```yaml
# role.yaml — what the SA is allowed to do
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-list-role
  namespace: default
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
```

```yaml
# rolebinding.yaml — connect SA to Role
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-lister-binding
  namespace: default
subjects:
- kind: ServiceAccount
  name: pod-lister
  namespace: monitoring          # SA is in 'monitoring' namespace
roleRef:
  kind: Role
  name: pod-list-role
  apiGroup: rbac.authorization.k8s.io
```

```yaml
# pod using the ServiceAccount
spec:
  serviceAccountName: pod-lister  # Must be in same namespace as pod
  automountServiceAccountToken: true  # Default is true
```

---

## The Mounted Token

When a pod uses a ServiceAccount, Kubernetes mounts a short-lived JWT token as a projected volume:

```
/var/run/secrets/kubernetes.io/serviceaccount/
├── token      ← JWT token to authenticate with the API server
├── ca.crt     ← CA cert to verify the API server's TLS
└── namespace  ← Current namespace name
```

```bash
# Inside a pod — call the K8s API using the mounted token
TOKEN=$(cat /var/run/secrets/kubernetes.io/serviceaccount/token)
NAMESPACE=$(cat /var/run/secrets/kubernetes.io/serviceaccount/namespace)

curl -s \
  --cacert /var/run/secrets/kubernetes.io/serviceaccount/ca.crt \
  -H "Authorization: Bearer $TOKEN" \
  https://kubernetes.default.svc/api/v1/namespaces/$NAMESPACE/pods | \
  python3 -m json.tool | grep '"name"'
```

---

## Disabling Token Auto-Mount

For pods that don't need API access, disable the token mount to reduce attack surface:

```yaml
spec:
  automountServiceAccountToken: false  # No token mounted
  containers:
  - name: app
    image: nginx:1.25
```

Or disable it on the ServiceAccount itself (applies to all pods using it):

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: no-api-access
automountServiceAccountToken: false
```

---

## Cross-Namespace Access

A pod can only use ServiceAccounts in its own namespace. For cross-namespace API access, bind the SA to Roles in other namespaces:

```yaml
# Pod in 'monitoring' namespace has SA 'prometheus'
# Bind it to the 'view' ClusterRole in EVERY namespace:
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus-cluster-view
subjects:
- kind: ServiceAccount
  name: prometheus
  namespace: monitoring          # SA lives in monitoring
roleRef:
  kind: ClusterRole
  name: view                     # Can view resources cluster-wide
  apiGroup: rbac.authorization.k8s.io
```

---

### Try It

```bash
kubectl create namespace sa-demo

# Create ServiceAccount, Role, and RoleBinding
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ServiceAccount
metadata:
  name: api-reader
  namespace: sa-demo
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: sa-demo
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: api-reader-binding
  namespace: sa-demo
subjects:
- kind: ServiceAccount
  name: api-reader
  namespace: sa-demo
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
EOF

# Test: can the SA get pods?
kubectl auth can-i get pods \
  --namespace=sa-demo \
  --as=system:serviceaccount:sa-demo:api-reader      # yes

kubectl auth can-i delete pods \
  --namespace=sa-demo \
  --as=system:serviceaccount:sa-demo:api-reader      # no

kubectl auth can-i get secrets \
  --namespace=sa-demo \
  --as=system:serviceaccount:sa-demo:api-reader      # no

# Cleanup
kubectl delete namespace sa-demo
```

---

## Key Takeaways

| # | Concept | One-liner |
|---|---------|-----------|
| 1 | ServiceAccount = pod identity | Allows pods to authenticate with the K8s API |
| 2 | Default SA has minimal permissions | Don't add permissions to it |
| 3 | Token auto-mounted at `/var/run/...` | Short-lived JWT used for API calls |
| 4 | `automountServiceAccountToken: false` | Disable for pods that don't need API access |
| 5 | SA subject format | `system:serviceaccount:NAMESPACE:NAME` |

---

## ✅ Quick Check

**Q1:** An operator pod needs to watch and update Deployments across all namespaces. What RBAC objects do you create?

<details>
<summary>Answer</summary>
Create a `ServiceAccount`, a `ClusterRole` with `deployments` get/list/watch/update verbs (using `apiGroups: ["apps"]`), and a `ClusterRoleBinding` that binds the ClusterRole to the ServiceAccount. Then set `serviceAccountName` in the operator pod spec.
</details>

**Q2:** A pod uses the `default` ServiceAccount. An attacker compromises the pod. What can they do with the mounted token?

<details>
<summary>Answer</summary>
With the default SA (no extra permissions), they can call the K8s API but most operations return 403. They can read their own namespace name and verify the cluster CA. In a well-hardened cluster, the blast radius is minimal. This is why `automountServiceAccountToken: false` is recommended for pods that don't need API access — the token isn't there to steal.
</details>

**Q3:** You create a ServiceAccount named `deployer` in namespace `staging`. Can a pod in namespace `production` use it?

<details>
<summary>Answer</summary>
No. `serviceAccountName` in a pod spec must refer to a ServiceAccount in the same namespace as the pod. A pod in `production` cannot use a ServiceAccount from `staging`. If you need similar permissions in both namespaces, create identically-configured ServiceAccounts in each.
</details>
