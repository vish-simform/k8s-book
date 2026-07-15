# 7.4 Immutable ConfigMaps and Secret Rotation

⏱️ **~4 min read**

> **TL;DR:** Mark ConfigMaps and Secrets as `immutable: true` for performance gains and accidental-change protection. For Secret rotation, update the Secret object and trigger a pod restart — or use volume mounts for zero-restart rotation.

---

## Immutable ConfigMaps and Secrets

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: stable-config
immutable: true          # Cannot be edited after creation
data:
  APP_VERSION: "2.1.0"
  FEATURE_FLAGS: "dark-mode,beta-dashboard"
```

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: stable-creds
immutable: true
stringData:
  API_KEY: "key-never-changes"
```

**Benefits of `immutable: true`:**
1. **Performance** — kubelet stops watching the ConfigMap/Secret for changes. At scale (thousands of ConfigMaps), this reduces API server load significantly
2. **Safety** — protects against accidental `kubectl edit` changes that would silently affect running pods
3. **Auditability** — forces you to create a new version, making changes explicit

**Limitation:** You cannot update an immutable ConfigMap or Secret. To change values:

```bash
# Must delete and recreate
kubectl delete configmap stable-config
kubectl apply -f new-stable-config.yaml

# Or create a new versioned name:
# stable-config-v2, then update pod specs to reference it
```

---

## Secret Rotation

Rotating a secret (e.g., after a password change) without downtime:

### With Volume Mounts (Zero-Downtime)

```bash
# 1. Update the Secret with the new value
kubectl patch secret db-credentials \
  --type='json' \
  -p='[{"op":"replace","path":"/data/password","value":"'$(echo -n "newpassword" | base64)'"}]'

# Or with stringData:
kubectl create secret generic db-credentials \
  --from-literal=password=newpassword \
  --dry-run=client -o yaml | kubectl apply -f -

# 2. Wait for kubelet to propagate the update to volume-mounted files (~60s)
# Your app must re-read the file on each use (not cache it at startup!)
```

If your app re-reads the mounted file on each request (or periodically), rotation is zero-downtime.

### With Env Vars (Requires Rolling Restart)

```bash
# 1. Update the Secret
kubectl create secret generic db-credentials \
  --from-literal=password=newpassword \
  --dry-run=client -o yaml | kubectl apply -f -

# 2. Trigger a rolling restart so pods pick up new env vars
kubectl rollout restart deployment/my-app
kubectl rollout status deployment/my-app
```

---

## Versioned ConfigMaps Pattern

A practical pattern for config changes that need explicit pod rollouts:

```bash
# Create a new versioned ConfigMap
kubectl create configmap app-config-v2 \
  --from-literal=LOG_LEVEL=debug \
  --from-literal=MAX_CONNECTIONS=200

# Update the Deployment to reference the new ConfigMap
# (edit deployment.yaml and change configMapKeyRef.name to app-config-v2)
kubectl apply -f deployment.yaml

# The rolling update ensures pods only use one config version at a time
# Old pods: app-config-v1 | New pods: app-config-v2

# After confirming the rollout is healthy, delete the old ConfigMap
kubectl delete configmap app-config-v1
```

This pattern ensures:
- Rollback is possible (old ConfigMap still exists during rollout)
- Exact config state is versioned and auditable
- No ambiguity about which pods use which config

---

### Try It

```bash
# Create an immutable ConfigMap
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: fixed-config
immutable: true
data:
  REGION: "us-east-1"
  CLUSTER_NAME: "prod-cluster"
EOF

# Try to edit it — should fail
kubectl patch configmap fixed-config \
  --type='json' \
  -p='[{"op":"replace","path":"/data/REGION","value":"eu-west-1"}]'
# Error: configmap "fixed-config" is immutable

# Must delete and recreate to change
kubectl delete configmap fixed-config

# Cleanup
```

---

## Key Takeaways

| # | Concept | One-liner |
|---|---------|-----------|
| 1 | `immutable: true` | Prevents accidental changes; improves kubelet performance |
| 2 | Volume mount rotation | Update Secret → kubelet propagates within ~60s (zero restart) |
| 3 | Env var rotation | Requires pod restart to pick up new values |
| 4 | Versioned ConfigMaps | Explicit rotation pattern with rollback capability |

---

## ✅ Quick Check

**Q1:** You have 10,000 ConfigMaps in a large cluster. How does `immutable: true` help?

<details>
<summary>Answer</summary>
Kubelet stops watching immutable ConfigMaps for changes. Normally, kubelet subscribes to change events for every ConfigMap used by pods it manages. At 10,000 ConfigMaps, this creates significant API server and network overhead. Marking them immutable eliminates this watch overhead entirely.
</details>

**Q2:** Your app caches the database password in memory at startup (reads env var once). You rotate the Secret and restart pods. Is there a window where old password is used?

<details>
<summary>Answer</summary>
Yes, but minimally — only during the rolling restart. With `maxUnavailable: 0`, old pods (using old password) stay running until new pods (using new password) are Ready. Since the database accepts both passwords during a rotation window (typically possible), the transition is seamless. Always coordinate with your DB rotation window.
</details>

**Q3:** Can you make a Secret immutable after it was created as mutable?

<details>
<summary>Answer</summary>
Yes — you can patch an existing Secret to add `immutable: true`. But once set, you cannot remove or change `immutable: true` — you'd need to delete and recreate the Secret. It's a one-way door.
</details>
