# 7.2 Secrets — Handling Sensitive Data

⏱️ **~6 min read**

> **TL;DR:** Secrets store sensitive data (passwords, tokens, keys). They look like ConfigMaps but are base64-encoded and have stricter access controls. **Important:** base64 is NOT encryption. Secrets are only as secure as your RBAC and etcd encryption configuration.

---

## Creating Secrets

```bash
# From literals (most common)
kubectl create secret generic db-credentials \
  --from-literal=username=admin \
  --from-literal=password=s3cr3t!

# From files (e.g., SSH keys, TLS certs)
kubectl create secret generic ssh-key \
  --from-file=id_rsa=/path/to/private.key \
  --from-file=id_rsa.pub=/path/to/public.key

# TLS Secret (special type for Ingress)
kubectl create secret tls myapp-tls \
  --cert=tls.crt \
  --key=tls.key

# Docker registry credentials (for pulling private images)
kubectl create secret docker-registry regcred \
  --docker-server=registry.example.com \
  --docker-username=myuser \
  --docker-password=mypassword
```

**Declarative YAML:**

```yaml
# secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque            # Generic secret type
data:
  username: YWRtaW4=   # base64("admin")
  password: czNjcjN0IQ==  # base64("s3cr3t!")
```

```bash
# Encode values yourself:
echo -n "admin" | base64      # YWRtaW4=
echo -n "s3cr3t!" | base64    # czNjcjN0IQ==

# Decode to verify:
echo "YWRtaW4=" | base64 --decode   # admin
```

> ⚠️ **Warning:** If you store Secrets in Git as YAML, the base64-encoded values are trivially decodable by anyone with repo access. Use tools like **Sealed Secrets**, **External Secrets Operator**, or **HashiCorp Vault** to store secrets safely in Git.

---

## Secret Types

| Type | Use Case | Created By |
|------|----------|-----------|
| `Opaque` | Generic key-value pairs | You |
| `kubernetes.io/tls` | TLS certificates | `kubectl create secret tls` |
| `kubernetes.io/dockerconfigjson` | Docker registry auth | `kubectl create secret docker-registry` |
| `kubernetes.io/service-account-token` | Service account tokens | Kubernetes automatically |
| `kubernetes.io/basic-auth` | HTTP basic auth | You |
| `kubernetes.io/ssh-auth` | SSH private keys | You |

---

## The base64 Reality Check

```bash
# Look at a Secret — the data appears base64-encoded
kubectl get secret db-credentials -o yaml
```

```yaml
data:
  password: czNjcjN0IQ==   # "encrypted"? No. Just base64.
  username: YWRtaW4=
```

```bash
# Anyone with kubectl access can decode it in one command:
kubectl get secret db-credentials -o jsonpath='{.data.password}' | base64 --decode
# Output: s3cr3t!
```

Base64 is an **encoding**, not **encryption**. It's there to handle binary data safely in YAML, not to protect the value.

**What actually protects Secrets:**
1. **RBAC** — restricts who can `get` or `list` Secrets
2. **etcd encryption at rest** — encrypts Secrets in the etcd database (must be enabled)
3. **Namespace isolation** — Secrets in namespace A can't be read by pods in namespace B
4. **Audit logging** — who accessed which Secret and when

> 🏭 **In Production:** Enable etcd encryption at rest, restrict Secret access with RBAC, and never log Secret values. Consider an external secrets manager (AWS Secrets Manager, HashiCorp Vault) for critical secrets.

---

## Using `stringData` (Easier YAML Authoring)

Instead of base64-encoding values yourself, use `stringData`:

```yaml
# Kubernetes auto-encodes these to base64 on apply
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
stringData:              # Plain text — K8s encodes automatically
  username: admin
  password: s3cr3t!
  connection-string: "postgresql://admin:s3cr3t!@postgres-svc:5432/mydb"
```

```bash
kubectl apply -f secret.yaml

# Kubernetes stores it base64-encoded internally
kubectl get secret db-credentials -o yaml | grep -A3 "^data:"
```

> 💡 **Tip:** Use `stringData` in YAML files — it's easier to read and less error-prone than manually base64-encoding values. Kubernetes handles the encoding internally.

---

### Try It

```bash
# Create a Secret with stringData
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Secret
metadata:
  name: app-secrets
type: Opaque
stringData:
  DB_PASSWORD: "mySuperSecretPassword123"
  API_KEY: "sk-abcdef1234567890"
  JWT_SECRET: "my-jwt-signing-key-never-share-this"
EOF

# See it stored as base64
kubectl get secret app-secrets -o yaml

# Decode individual values
kubectl get secret app-secrets \
  -o jsonpath='{.data.DB_PASSWORD}' | base64 --decode
echo ""

# Cleanup
kubectl delete secret app-secrets
```

---

## Key Takeaways

| # | Concept | One-liner |
|---|---------|-----------|
| 1 | Secrets = base64-encoded ConfigMaps | Same structure; different intent and access controls |
| 2 | base64 ≠ encryption | Anyone with `kubectl get secret` can decode it |
| 3 | RBAC protects Secrets | Restrict `get/list` on Secrets to only pods that need them |
| 4 | `stringData` for authoring | K8s auto-encodes; use for readable YAML |
| 5 | etcd encryption at rest | The real protection — encrypt the database, not just encode |

---

## ✅ Quick Check

**Q1:** A developer can `kubectl get pods` but you want to prevent them from reading Secrets. How?

<details>
<summary>Answer</summary>
Use RBAC. Create a Role that grants `get,list,watch` on `pods` but NOT on `secrets`. Bind this Role to the developer's ServiceAccount or user. Without explicit permission on the `secrets` resource, they cannot read Secret values.
</details>

**Q2:** You store a database password in a Secret. A bug in your app logs all environment variables to stdout. Is the password exposed?

<details>
<summary>Answer</summary>
Yes — if the Secret was mounted as an environment variable and the app logs all env vars, the plaintext password appears in the container logs. This is a real vulnerability. Best practices: (1) mount Secrets as files instead of env vars, (2) never log env vars, (3) use a secrets manager with runtime injection instead of env vars.
</details>

**Q3:** What happens to a pod that references a Secret that doesn't exist yet?

<details>
<summary>Answer</summary>
The pod stays in `Pending` state with the reason `CreateContainerConfigError`. It can't start because Kubernetes tries to inject the Secret before running the container and fails when the Secret is not found. Once you create the Secret, the pod starts automatically.
</details>
