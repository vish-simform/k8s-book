# Lab: kubectl Power User Drills

⏱️ **~25 min hands-on**

| | |
|---|---|
| **Prerequisites** | Minikube running, Chapter 2 sections 2.1–2.4 read |
| **Difficulty** | 🟢 Beginner |
| **What you'll do** | Run a gauntlet of kubectl drills covering every technique from this chapter |

## Objectives

- [ ] Use `kubectl explain` to look up API fields without Googling
- [ ] Generate YAML using `--dry-run=client` and edit it
- [ ] Filter pods by label, field, and namespace
- [ ] Extract specific data with JSONPath and custom columns
- [ ] Switch and manage namespaces confidently
- [ ] Debug a misconfigured deployment

---

## Setup

```bash
# Verify cluster is running
kubectl get nodes

# Create a dedicated namespace for this lab
kubectl create namespace drill-lab

# Switch to it
kubectl config set-context --current --namespace=drill-lab

# Verify
kubectl config view --minify | grep namespace
```

**Expected output:**
```
    namespace: drill-lab
```

---

## Exercise 1: Use `kubectl explain` as Your Dictionary

**What we're doing:** Look up API field definitions without leaving the terminal.

```bash
# What fields does a Pod spec have?
kubectl explain pod.spec

# What are the container resource fields?
kubectl explain pod.spec.containers.resources

# What does restartPolicy accept?
kubectl explain pod.spec.restartPolicy
```

**Challenge:** Find out what `pod.spec.containers.livenessProbe.httpGet` fields are available — using only `kubectl explain`.

```bash
kubectl explain pod.spec.containers.livenessProbe.httpGet
```

**Expected output (key fields):**
```
FIELDS:
  host     <string>
  httpHeaders  <[]Object>
  path     <string>     -required-
  port     <IntOrString> -required-
  scheme   <string>
```

> 💡 **What just happened?** You just looked up the Kubernetes API reference without opening a browser. Make this a habit.

---

## Exercise 2: Generate YAML Without Writing It From Scratch

**What we're doing:** Use imperative commands + `--dry-run=client -o yaml` to scaffold manifests.

```bash
# Generate a Deployment manifest
kubectl create deployment webserver \
  --image=nginx:1.25 \
  --replicas=3 \
  --port=80 \
  --dry-run=client -o yaml > /tmp/webserver-deployment.yaml

cat /tmp/webserver-deployment.yaml
```

Now edit it — add a label to the pod template:

```bash
# Open the file and add env=lab under the existing labels in spec.template.metadata.labels
# Use any editor: nano, vim, or:
sed -i '/app: webserver/a\        env: lab' /tmp/webserver-deployment.yaml
```

Verify your edit:
```bash
grep -A5 "labels:" /tmp/webserver-deployment.yaml | head -20
```

Apply it:
```bash
kubectl apply -f /tmp/webserver-deployment.yaml
kubectl get deployment webserver
kubectl get pods --show-labels
```

**Expected output:**
```
NAME              READY   STATUS    RESTARTS   AGE   LABELS
webserver-xxxxx   1/1     Running   0          10s   app=webserver,env=lab,pod-template-hash=xxxxx
webserver-xxxxx   1/1     Running   0          10s   app=webserver,env=lab,pod-template-hash=xxxxx
webserver-xxxxx   1/1     Running   0          10s   app=webserver,env=lab,pod-template-hash=xxxxx
```

---

## Exercise 3: Deploy Multiple Apps with Different Labels

**What we're doing:** Set up a multi-app environment to practice filtering.

```bash
# Deploy a second app (simulating an API service)
kubectl create deployment api-server \
  --image=node:20-slim \
  --replicas=2 \
  -n drill-lab

# Label the api-server pods differently
kubectl label deployment api-server tier=backend env=lab

# Create a third deployment
kubectl create deployment redis-cache \
  --image=redis:7 \
  --replicas=1 \
  -n drill-lab

kubectl label deployment redis-cache tier=cache env=lab
```

Now practice filtering:

```bash
# All pods
kubectl get pods

# Only webserver pods
kubectl get pods -l app=webserver

# All pods with env=lab
kubectl get pods -l env=lab

# All pods with env=lab AND tier=backend
kubectl get pods -l env=lab,tier=backend

# Show labels in output
kubectl get pods --show-labels

# Non-running pods
kubectl get pods --field-selector=status.phase!=Running
```

---

## Exercise 4: JSONPath Drills

**What we're doing:** Extract specific fields like a surgeon.

```bash
# Get all pod names, one per line
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}'

# Get pod name + image, tab-separated
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[0].image}{"\n"}{end}'

# Get the IP of the first webserver pod
kubectl get pods -l app=webserver -o jsonpath='{.items[0].status.podIP}'

# Get restart counts for all pods
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.containerStatuses[0].restartCount}{"\n"}{end}'
```

**Custom columns version — same info, prettier output:**
```bash
kubectl get pods \
  -o custom-columns='NAME:.metadata.name,IMAGE:.spec.containers[0].image,IP:.status.podIP,RESTARTS:.status.containerStatuses[0].restartCount'
```

**Expected output:**
```
NAME                    IMAGE        IP            RESTARTS
webserver-abc-xxx       nginx:1.25   10.244.0.5    0
webserver-abc-yyy       nginx:1.25   10.244.0.6    0
api-server-def-xxx      node:20-slim 10.244.0.7    0
redis-cache-ghi-xxx     redis:7      10.244.0.8    0
```

---

## Exercise 5: Namespace Operations

**What we're doing:** Work across namespaces.

```bash
# Create another namespace with a pod
kubectl create namespace other-lab
kubectl run isolated-pod --image=nginx -n other-lab

# Prove the namespaces are isolated
kubectl get pods                    # drill-lab pods only
kubectl get pods -n other-lab       # other-lab pods only
kubectl get pods -A                 # ALL pods, all namespaces

# Cross-namespace view with labels
kubectl get pods -A --show-labels

# Clean up other-lab
kubectl delete namespace other-lab
```

---

## Exercise 6: Watch Mode + Sorting

```bash
# In one terminal, watch pods:
kubectl get pods -w &

# In the same terminal, scale up/down and watch the changes:
kubectl scale deployment webserver --replicas=5
sleep 3
kubectl scale deployment webserver --replicas=2

# Stop the watch
kill %1

# Sort all pods by restart count
kubectl get pods --sort-by='.status.containerStatuses[0].restartCount'

# Sort by creation time
kubectl get pods --sort-by=.metadata.creationTimestamp
```

---

## Exercise 7: Debug a Broken Deployment

**What we're doing:** Apply a broken deployment and diagnose it using only kubectl.

```bash
# Apply this broken deployment (bad image name)
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: broken-app
  namespace: drill-lab
spec:
  replicas: 2
  selector:
    matchLabels:
      app: broken-app
  template:
    metadata:
      labels:
        app: broken-app
    spec:
      containers:
      - name: app
        image: nginx:doesnotexist999
        ports:
        - containerPort: 80
EOF
```

Now diagnose:

```bash
# 1. See the deployment status
kubectl get deployment broken-app

# 2. See the pods
kubectl get pods -l app=broken-app

# 3. Describe a failing pod — look at Events at the bottom
kubectl describe pod -l app=broken-app

# 4. Check the specific error
kubectl get pods -l app=broken-app -o jsonpath='{range .items[*]}{.status.containerStatuses[0].state.waiting.reason}{"\n"}{end}'
```

**Expected output from describe (Events section):**
```
Events:
  Type     Reason     Message
  ----     ------     -------
  Warning  Failed     Failed to pull image "nginx:doesnotexist999": ... not found
  Warning  Failed     Error: ErrImagePull
  Warning  BackOff    Back-off pulling image "nginx:doesnotexist999"
```

Fix it:
```bash
kubectl set image deployment/broken-app app=nginx:1.25
kubectl rollout status deployment/broken-app
```

> 💡 **What just happened?** `kubectl set image` is an imperative way to update a container image. The deployment controller immediately starts a rolling update. In production, you'd update the YAML and `kubectl apply`.

---

## 🔥 Break It! Challenge

> What happens if you delete a namespace that has running workloads?

```bash
# Watch what happens to all resources in drill-lab if we delete it
# (Don't do this yet — just understand the outcome)

# First: list everything in the namespace
kubectl get all -n drill-lab

# The answer: deleting a namespace cascades to ALL resources in it
# kubectl delete namespace drill-lab  ← this would kill everything

# Instead, try deleting just the api-server deployment and watch
# the pods disappear but the other deployments stay:
kubectl delete deployment api-server
kubectl get pods -w   # watch pods go away, then Ctrl+C
```

**The lesson:** Namespace deletion is nuclear — it kills everything inside it with no confirmation. Never delete namespaces in production without knowing exactly what's inside.

---

## Cleanup

```bash
# Switch back to default namespace first
kubectl config set-context --current --namespace=default

# Delete the lab namespace and everything in it
kubectl delete namespace drill-lab

# Verify cleanup
kubectl get all -n drill-lab 2>&1  # Should say "No resources found"
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | Use `kubectl explain` as API reference | Found `livenessProbe.httpGet` fields without Googling |
| 2 | Generate YAML with `--dry-run` | Created an editable deployment manifest |
| 3 | Filter by labels and fields | Used `-l`, `--field-selector`, `--show-labels` |
| 4 | Extract data with JSONPath | Got pod names, images, IPs in custom format |
| 5 | Work across namespaces | Used `-n` and `-A` to scope commands |
| 6 | Debug a failing deployment | Used `describe` to find `ImagePullBackOff` root cause |
