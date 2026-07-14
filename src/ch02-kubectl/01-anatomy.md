# 2.1 Anatomy of a kubectl Command

⏱️ **~5 min read**

> **TL;DR:** Every kubectl command follows one pattern: `kubectl [verb] [resource] [name] [flags]`. Master this pattern and you can figure out any command on the fly.

---

## The Command Structure

```
kubectl  <verb>    <resource>  <name>      <flags>
kubectl  get       pods        my-nginx    --namespace=default
kubectl  describe  node        minikube
kubectl  delete    deployment  my-app      --grace-period=0
kubectl  logs      pod/my-pod  -c sidecar  -f
```

That's it. Once this pattern is in muscle memory, you don't need to memorize hundreds of commands.

---

## The Verbs

The verbs you'll use 90% of the time:

| Verb | What it does | Example |
|------|-------------|---------|
| `get` | List one or more resources | `kubectl get pods` |
| `describe` | Detailed info + events for a resource | `kubectl describe pod my-pod` |
| `create` | Create a resource from a file | `kubectl create -f pod.yaml` |
| `apply` | Create or update a resource from a file | `kubectl apply -f deployment.yaml` |
| `delete` | Delete a resource | `kubectl delete pod my-pod` |
| `edit` | Open a resource in your editor live | `kubectl edit deployment my-app` |
| `logs` | Stream container logs | `kubectl logs my-pod` |
| `exec` | Run a command inside a container | `kubectl exec -it my-pod -- bash` |
| `port-forward` | Forward a local port to a pod | `kubectl port-forward pod/my-pod 8080:80` |
| `scale` | Change replica count | `kubectl scale deployment my-app --replicas=5` |
| `rollout` | Manage deployment rollouts | `kubectl rollout status deployment/my-app` |

---

## The Resources

Resources are what K8s manages. You refer to them by their kind name (or shorthand):

| Full Name | Shorthand | What it is |
|-----------|-----------|------------|
| `pods` | `po` | The atomic unit |
| `deployments` | `deploy` | Manages ReplicaSets |
| `services` | `svc` | Network endpoint |
| `namespaces` | `ns` | Isolation boundary |
| `nodes` | `no` | Cluster machines |
| `configmaps` | `cm` | Configuration data |
| `secrets` | — | Sensitive data |
| `persistentvolumeclaims` | `pvc` | Storage requests |
| `ingresses` | `ing` | HTTP routing |

```bash
# These are all equivalent
kubectl get deployments
kubectl get deployment
kubectl get deploy
```

```bash
# See ALL resource types in your cluster
kubectl api-resources
```

---

## Essential Flags

| Flag | Short | What it does |
|------|-------|-------------|
| `--namespace` | `-n` | Target a specific namespace |
| `--all-namespaces` | `-A` | Target all namespaces |
| `--output` | `-o` | Change output format (yaml, json, wide) |
| `--filename` | `-f` | Specify a file |
| `--watch` | `-w` | Stream changes live |
| `--selector` | `-l` | Filter by label |
| `--dry-run=client` | — | Preview changes without applying |
| `--force` | — | Force delete (skip graceful termination) |

---

## Getting Help — Built In

You never need to Google basic syntax. kubectl has it all:

```bash
# Get help on any verb
kubectl get --help

# Get help on any resource type
kubectl explain pod
kubectl explain pod.spec
kubectl explain pod.spec.containers
kubectl explain pod.spec.containers.resources.limits
```

`kubectl explain` is like having the K8s API reference built into your terminal. Use it constantly.

**Expected output for `kubectl explain pod.spec.containers.resources.limits`:**
```
KIND:     Pod
VERSION:  v1

FIELD:    limits <map[string]Quantity>

DESCRIPTION:
     Limits describes the maximum amount of compute resources allowed. More info:
     https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
```

### Try It

```bash
# Confirm your cluster is running
kubectl get nodes

# List all pods across all namespaces
kubectl get pods -A

# Get help for the 'exec' verb
kubectl exec --help
```

---

## Key Takeaways

| # | Concept | One-liner |
|---|---------|-----------|
| 1 | `kubectl [verb] [resource] [name]` | The universal pattern for all commands |
| 2 | Shorthand aliases | `po`, `deploy`, `svc`, `cm`, `ns` save keystrokes |
| 3 | `kubectl explain` | Built-in API reference — use it instead of Googling |
| 4 | `-n` / `-A` flags | Scope commands to a namespace or all namespaces |

---

## ✅ Quick Check

**Q1:** What does `kubectl get deploy -A` do?

<details>
<summary>Answer</summary>
Lists all Deployments across every namespace in the cluster. `-A` is short for `--all-namespaces`, and `deploy` is the shorthand for `deployments`.
</details>

**Q2:** You want to see the detailed spec of a ConfigMap named `app-config` in the `staging` namespace. Which command?

<details>
<summary>Answer</summary>
`kubectl describe configmap app-config -n staging` (or `kubectl describe cm app-config -n staging`). For the raw YAML: `kubectl get cm app-config -n staging -o yaml`.
</details>

**Q3:** You run `kubectl delete pod my-pod` but the pod comes back immediately. Why?

<details>
<summary>Answer</summary>
The pod is managed by a controller — most likely a Deployment or ReplicaSet. Deleting the pod triggers the controller to immediately create a replacement to maintain the desired count. To permanently remove it, delete the Deployment: `kubectl delete deployment my-app`.
</details>
