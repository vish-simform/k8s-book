# 2.2 Imperative vs Declarative — Two Ways to Talk to K8s

⏱️ **~5 min read**

> **TL;DR:** Imperative = "do this now." Declarative = "this is what I want." Use imperative for quick experiments; always use declarative (`kubectl apply -f`) in real workflows.

---

## Imperative: Give Orders

Imperative commands tell Kubernetes exactly what action to take. Fast and convenient for one-off tasks.

```bash
# Imperative: "Create an nginx pod, right now"
kubectl run my-nginx --image=nginx --port=80

# Imperative: "Scale this deployment to 5"
kubectl scale deployment my-app --replicas=5

# Imperative: "Create a ConfigMap with this value"
kubectl create configmap app-config --from-literal=DB_HOST=localhost
```

> 🔗 **Docker Parallel:** This is like `docker run` — you issue a command, something happens.

**The problem:** How do you track what was created? How do teammates reproduce it? How do you put it in Git?

---

## Declarative: Describe Desired State

Declarative means writing a YAML file that describes *what you want to exist*, then applying it.

```yaml
# nginx-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-nginx
  labels:
    app: nginx
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.25
        ports:
        - containerPort: 80
```

```bash
kubectl apply -f nginx-deployment.yaml
```

> 🔗 **Docker Parallel:** This is like `docker-compose.yml` — you describe the desired state, and the tool figures out what actions to take.

**`apply` is idempotent.** Run it 10 times — it only makes changes when the file differs from the live state. This is safe to automate.

---

## The Key Difference: `create` vs `apply`

| | `kubectl create -f` | `kubectl apply -f` |
|---|---|---|
| Resource doesn't exist | ✅ Creates it | ✅ Creates it |
| Resource already exists | ❌ Error | ✅ Updates it |
| Safe to run repeatedly | No | Yes |
| Tracks changes | No | Yes (via annotation) |
| Use in CI/CD | Never | Always |

```bash
# This will fail on second run:
kubectl create -f nginx-deployment.yaml
kubectl create -f nginx-deployment.yaml  # ❌ Error: already exists

# This is always safe:
kubectl apply -f nginx-deployment.yaml
kubectl apply -f nginx-deployment.yaml  # ✅ "unchanged"
```

---

## Generating YAML from Imperative Commands

Here's a power move: use imperative commands to *generate* YAML files, then commit those.

```bash
# Generate a Pod YAML without creating it
kubectl run my-pod --image=nginx --dry-run=client -o yaml

# Generate a Deployment YAML
kubectl create deployment my-app --image=nginx --replicas=3 \
  --dry-run=client -o yaml > my-deployment.yaml

# Generate a Service YAML
kubectl expose deployment my-app --port=80 --type=ClusterIP \
  --dry-run=client -o yaml > my-service.yaml
```

**Expected output for the pod command:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: null
  labels:
    run: my-pod
  name: my-pod
spec:
  containers:
  - image: nginx
    name: my-pod
    resources: {}
  dnsPolicy: ClusterFirst
  restartPolicy: Always
status: {}
```

> 💡 **Tip:** `--dry-run=client -o yaml` is one of the most useful kubectl tricks. It generates a valid YAML scaffold that you edit and commit — way faster than writing YAML from scratch.

---

## When to Use Which

| Situation | Use |
|-----------|-----|
| Quick debugging — "just run this pod" | Imperative (`kubectl run`) |
| Generating a starter YAML | Imperative + `--dry-run=client -o yaml` |
| Any real deployment | Declarative (`kubectl apply -f`) |
| CI/CD pipeline | Declarative only |
| Sharing with the team | Declarative (YAML in Git) |
| One-off admin tasks | Imperative OK |

> 🏭 **In Production:** Imperative commands have no audit trail. In production, every change should go through `kubectl apply` backed by a Git commit. This is the foundation of GitOps.

---

### Try It

```bash
# Create a deployment imperatively
kubectl create deployment demo --image=nginx --replicas=2

# Now export it as YAML to see what K8s actually stored
kubectl get deployment demo -o yaml

# Delete it
kubectl delete deployment demo

# Now do the same thing declaratively
kubectl create deployment demo --image=nginx --replicas=2 \
  --dry-run=client -o yaml | kubectl apply -f -

# Verify
kubectl get deploy demo
kubectl delete deployment demo
```

---

## Key Takeaways

| # | Concept | One-liner |
|---|---------|-----------|
| 1 | Imperative | Fast, not reproducible — use for experiments only |
| 2 | Declarative | `apply -f` is idempotent and Git-friendly |
| 3 | `create` vs `apply` | `apply` is always safer — use it by default |
| 4 | `--dry-run=client -o yaml` | Generate YAML scaffolds from imperative commands |

---

## ✅ Quick Check

**Q1:** You run `kubectl apply -f app.yaml` in your CI pipeline. The resource already exists with different settings. What happens?

<details>
<summary>Answer</summary>
Kubernetes computes the diff between the current state and the desired state in the YAML file, then applies only the necessary changes. The resource is updated in-place. This is why `apply` is idempotent and CI-safe.
</details>

**Q2:** What does `kubectl run test --image=busybox --dry-run=client -o yaml` actually do?

<details>
<summary>Answer</summary>
It generates the YAML that *would* be sent to the API Server — but doesn't actually create anything. The `--dry-run=client` flag means the request is processed locally without contacting the cluster. It's perfect for generating YAML templates.
</details>

**Q3:** A colleague used imperative commands to configure the production cluster. Why is this a problem?

<details>
<summary>Answer</summary>
There's no audit trail — you can't see what was changed, when, or by whom. It can't be peer-reviewed (no Git PR). It's not reproducible — if the cluster is destroyed, you can't rebuild it. And it's easy to make typos with no review gate. All production changes should go through declarative YAML in version control.
</details>
