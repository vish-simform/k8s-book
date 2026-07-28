# Lab: Full GitOps Pipeline

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | Sections 16.1–16.4 read, Minikube running, `helm` installed |
| **Difficulty** | 🟠 Intermediate–Advanced |
| **What you'll do** | Install ArgoCD on Minikube, create a Kustomize-based config structure, deploy an Application, observe sync and health, simulate a code deploy by updating an image tag, simulate drift and watch ArgoCD self-heal, and trigger a rollback |

## Objectives

- [ ] Install ArgoCD on Minikube and access the UI
- [ ] Build a Kustomize config structure with base + overlays
- [ ] Create an ArgoCD Application pointing at a local Git repo
- [ ] Deploy the application and verify sync + health
- [ ] Simulate a new release by updating the image tag
- [ ] Manually edit a Deployment and watch ArgoCD self-heal
- [ ] Roll back to a previous revision via CLI
- [ ] Validate manifests with kubeconform

---

## Setup

```bash
# Ensure Minikube is running with enough resources
minikube status
kubectl get nodes

# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f \
  https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for all ArgoCD pods to be running (takes ~2 min)
kubectl rollout status deployment/argocd-server -n argocd
kubectl rollout status deployment/argocd-repo-server -n argocd
kubectl rollout status deployment/argocd-application-controller -n argocd

kubectl get pods -n argocd
```

**Expected pods (all Running):**
```
argocd-application-controller-0        1/1   Running
argocd-dex-server-xxx                  1/1   Running
argocd-notifications-controller-xxx    1/1   Running
argocd-redis-xxx                       1/1   Running
argocd-repo-server-xxx                 1/1   Running
argocd-server-xxx                      1/1   Running
```

```bash
# Get the ArgoCD initial admin password
ARGOCD_PASSWORD=$(kubectl get secret argocd-initial-admin-secret -n argocd \
  -o jsonpath="{.data.password}" | base64 -d)
echo "ArgoCD password: $ARGOCD_PASSWORD"

# Port-forward the ArgoCD UI (run in background)
kubectl port-forward svc/argocd-server -n argocd 8443:443 &
echo "ArgoCD UI: https://localhost:8443  (login: admin / $ARGOCD_PASSWORD)"

# Install ArgoCD CLI
curl -sSL -o /tmp/argocd \
  https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
chmod +x /tmp/argocd && sudo mv /tmp/argocd /usr/local/bin/argocd

# Login
argocd login localhost:8443 \
  --username admin \
  --password "$ARGOCD_PASSWORD" \
  --insecure
```

---

## Exercise 1: Build a Kustomize Config Structure

**What we're doing:** Create a local Git repo with Kustomize base + overlays that ArgoCD will track.

```bash
# Create the config repo directory
mkdir -p ~/gitops-lab && cd ~/gitops-lab
git init

# Base manifests (shared across all environments)
mkdir -p base

cat > base/deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  labels:
    app: web-app
    version: v1.0.0
    team: platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
        version: v1.0.0
    spec:
      containers:
      - name: web
        image: nginxdemo/hello:plain-text
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: "50m"
            memory: "32Mi"
          limits:
            cpu: "100m"
            memory: "64Mi"
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 5
EOF

cat > base/service.yaml << 'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web-app
  labels:
    app: web-app
spec:
  selector:
    app: web-app
  ports:
  - port: 80
    targetPort: 80
  type: ClusterIP
EOF

cat > base/kustomization.yaml << 'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
- service.yaml
commonLabels:
  managed-by: argocd
EOF

# Dev overlay (lighter resources)
mkdir -p overlays/dev

cat > overlays/dev/kustomization.yaml << 'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namePrefix: dev-
namespace: gitops-dev
resources:
- ../../base
patches:
- patch: |-
    - op: replace
      path: /spec/replicas
      value: 1
  target:
    kind: Deployment
    name: web-app
EOF

# Create the dev namespace
kubectl create namespace gitops-dev 2>/dev/null || true

# Commit initial state
git add -A
git commit -m "Initial GitOps config: base + dev overlay"

echo "Local git repo initialized at ~/gitops-lab"
echo "HEAD: $(git rev-parse --short HEAD)"
```

**Validate with kubeconform:**

```bash
# Install kubeconform
curl -L https://github.com/yannh/kubeconform/releases/latest/download/kubeconform-linux-amd64.tar.gz \
  | tar -xz && sudo mv kubeconform /usr/local/bin/ 2>/dev/null || true

# Validate the kustomize output
kustomize build ~/gitops-lab/overlays/dev | kubeconform -summary -
# Expected: Valid: 2, Invalid: 0, Errors: 0
```

---

## Exercise 2: Create an ArgoCD Application

**What we're doing:** Point ArgoCD at the local git repo and deploy the app.

```bash
# Get the absolute path of the local repo
REPO_PATH=$(realpath ~/gitops-lab)

# Create ArgoCD Application pointing to local filesystem
# (In production this would be a HTTPS/SSH git URL)
argocd app create web-app \
  --repo "file://${REPO_PATH}" \
  --path overlays/dev \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace gitops-dev \
  --sync-policy automated \
  --auto-prune \
  --self-heal \
  --sync-option CreateNamespace=true

# Check status
argocd app get web-app
argocd app list
```

**Expected output:**
```
Name:               argocd/web-app
Project:            default
Server:             https://kubernetes.default.svc
Namespace:          gitops-dev
URL:                https://localhost:8443/applications/web-app
Source:             file:///home/.../gitops-lab  (Path: overlays/dev)
SyncStatus:         Synced
HealthStatus:       Healthy
```

```bash
# Verify the app is deployed
kubectl get pods,svc -n gitops-dev

# Should see:
# pod/dev-web-app-xxx   Running
# svc/dev-web-app       ClusterIP
```

**Open ArgoCD UI:**
Navigate to `https://localhost:8443` — you should see the `web-app` application as a green box with `Synced` and `Healthy`.

---

## Exercise 3: Simulate a New Release

**What we're doing:** Update the image tag in Git (simulating a CI pipeline bump) and watch ArgoCD deploy it.

```bash
cd ~/gitops-lab

# Simulate CI bumping the image (new "version" of the app)
# We'll switch from nginxdemo/hello:plain-text to nginxdemo/hello:latest
# In a real pipeline, CI would update to a new SHA tag

cat > base/deployment.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  labels:
    app: web-app
    version: v1.1.0
    team: platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
        version: v1.1.0
    spec:
      containers:
      - name: web
        image: nginxdemo/hello:latest    # "new version"
        ports:
        - containerPort: 80
        resources:
          requests:
            cpu: "50m"
            memory: "32Mi"
          limits:
            cpu: "100m"
            memory: "64Mi"
        readinessProbe:
          httpGet:
            path: /
            port: 80
          initialDelaySeconds: 5
          periodSeconds: 5
EOF

git add -A
git commit -m "ci: update web-app to v1.1.0"

echo "Committed. Waiting for ArgoCD to detect the change..."
sleep 5  # ArgoCD polls local repos more frequently than remote

# Check if ArgoCD detected the change
argocd app get web-app
```

```bash
# Watch the sync happen
argocd app sync web-app --watch 2>/dev/null || true

# Or just wait and check
sleep 30
kubectl get pods -n gitops-dev
argocd app get web-app

# Verify the new image is deployed
kubectl get deploy dev-web-app -n gitops-dev \
  -o jsonpath='{.spec.template.spec.containers[0].image}' && echo
# Expected: nginxdemo/hello:latest
```

---

## Exercise 4: Observe Self-Healing

**What we're doing:** Make a manual change to the cluster and watch ArgoCD revert it.

```bash
# Check ArgoCD app sync policy (should have selfHeal=true)
argocd app get web-app | grep "Auto-Sync"

# Manually change the replica count directly in the cluster
kubectl scale deployment dev-web-app --replicas=5 -n gitops-dev

# Immediately check
kubectl get deploy dev-web-app -n gitops-dev
# Shows 5 replicas (our manual change)

# Wait for ArgoCD to reconcile (up to 3 minutes for local repos)
echo "Waiting for ArgoCD self-heal (up to 3 min)..."
sleep 30

# Check again - ArgoCD should have corrected it back to 1 (dev overlay value)
kubectl get deploy dev-web-app -n gitops-dev
# Expected: 1 replica (Git state wins)

# You can also force immediate sync
argocd app sync web-app
kubectl get deploy dev-web-app -n gitops-dev
# Should be back to 1 replica
```

---

## Exercise 5: Rollback

**What we're doing:** Roll back to the previous deployment using ArgoCD revision history.

```bash
# View revision history
argocd app history web-app

# Expected output (your revision numbers may vary):
# ID   DATE                REVISION
# 0    2024-XX-XX XX:XX:XX  ...commit-sha-1  (initial deploy with plain-text)
# 1    2024-XX-XX XX:XX:XX  ...commit-sha-2  (v1.1.0 with latest tag)

# Roll back to revision 0 (the previous state)
argocd app rollback web-app 0

# Check the image after rollback
kubectl get deploy dev-web-app -n gitops-dev \
  -o jsonpath='{.spec.template.spec.containers[0].image}' && echo
# Expected: nginxdemo/hello:plain-text  (back to original)

argocd app get web-app
# Note: After rollback, app shows OutOfSync (cluster differs from latest Git)
# This is expected — rollback pins to an old revision, not Git HEAD

# To restore auto-sync to HEAD:
argocd app sync web-app
```

---

## Exercise 6: Manifest Drift Detection

**What we're doing:** Observe the ArgoCD diff when Git and cluster are out of sync.

```bash
# Make a deliberate change to the git repo WITHOUT syncing
cd ~/gitops-lab

# Add a ConfigMap to the base
cat > base/configmap.yaml << 'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-app-config
data:
  APP_ENV: "development"
  MAX_CONNECTIONS: "100"
EOF

# Update the kustomization to include it
cat > base/kustomization.yaml << 'EOF'
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
- service.yaml
- configmap.yaml
commonLabels:
  managed-by: argocd
EOF

git add -A
git commit -m "feat: add web-app ConfigMap"

# Disable auto-sync temporarily to observe OutOfSync state
argocd app set web-app --sync-policy none

# Now check the diff (Git has ConfigMap, cluster doesn't yet)
argocd app diff web-app

# Expected: shows + lines for the new ConfigMap that doesn't exist in cluster

# Manually trigger the sync to apply it
argocd app sync web-app

# Verify the ConfigMap was created
kubectl get configmap dev-web-app-config -n gitops-dev

# Re-enable auto-sync
argocd app set web-app \
  --sync-policy automated \
  --auto-prune \
  --self-heal
```

---

## 🔥 Break It! Challenge

> What happens when you delete an ArgoCD Application object? Does it delete the cluster resources it manages?

```bash
# Check the finalizer on the Application
kubectl get application web-app -n argocd -o yaml | grep finalizer

# The finalizer: resources-finalizer.argocd.argoproj.io
# This controls cascade deletion behavior.

# Option 1: Delete WITH cascade (deletes all managed resources)
argocd app delete web-app --cascade

# Option 2: Delete WITHOUT cascade (orphans the resources)
# argocd app delete web-app --cascade=false

# Try option 2 first to see the resources remain:
argocd app delete web-app --cascade=false --yes 2>/dev/null || \
  kubectl delete application web-app -n argocd

# Check: namespace and resources should STILL EXIST
kubectl get pods,svc,configmap -n gitops-dev

# Re-create the application to demonstrate idempotency
REPO_PATH=$(realpath ~/gitops-lab)
argocd app create web-app \
  --repo "file://${REPO_PATH}" \
  --path overlays/dev \
  --dest-server https://kubernetes.default.svc \
  --dest-namespace gitops-dev \
  --sync-policy automated \
  --auto-prune \
  --self-heal \
  --sync-option CreateNamespace=true

argocd app get web-app
```

The cascade behavior is critical to understand in production — accidentally deleting an ArgoCD Application with the finalizer present wipes the namespace's resources. Many teams set `--cascade=false` for production applications and control deletion through Git (removing manifests and syncing).

---

## Cleanup

```bash
# Stop port-forward
kill %1 2>/dev/null || true

# Delete ArgoCD and all it manages
argocd app delete web-app --cascade --yes 2>/dev/null || true

kubectl delete namespace argocd
kubectl delete namespace gitops-dev

# Remove local lab directory
rm -rf ~/gitops-lab
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | ArgoCD install | All ArgoCD pods running in `argocd` namespace |
| 2 | Kustomize base + overlay | Base YAML + dev overlay with namespace prefix |
| 3 | kubeconform validation | 2 resources validated against K8s schema |
| 4 | ArgoCD Application | `web-app` app created, Synced + Healthy in UI |
| 5 | GitOps deploy | Image tag updated in Git → ArgoCD rolled out new pods |
| 6 | Self-healing | Manual `kubectl scale` reverted by ArgoCD |
| 7 | Rollback | `argocd app rollback` restored previous image |
| 8 | Diff detection | `argocd app diff` showed new ConfigMap before sync |
| 9 | Cascade delete | Understood Application finalizer behavior |
