# Appendix B: kubectl Cheat Sheet

> **The most useful kubectl commands, organized by task.**

---

## Setup and Context

```bash
# View your current context
kubectl config current-context

# List all contexts
kubectl config get-contexts

# Switch context
kubectl config use-context <context-name>

# Set default namespace for current context
kubectl config set-context --current --namespace=my-namespace

# View kubeconfig
kubectl config view --minify
```

---

## Getting Resources

```bash
# List resources
kubectl get pods
kubectl get pods -n kube-system          # specific namespace
kubectl get pods --all-namespaces        # all namespaces (alias: -A)
kubectl get pods -o wide                 # extra columns (node, IP)

# Get a specific resource
kubectl get pod my-pod
kubectl get pod my-pod -o yaml           # full YAML output
kubectl get pod my-pod -o json           # full JSON output

# Watch for changes
kubectl get pods -w

# Get all resource types at once
kubectl get all -n <namespace>

# Filter by label
kubectl get pods -l app=my-app
kubectl get pods -l 'env in (prod, staging)'

# Sort output
kubectl get pods --sort-by='.metadata.creationTimestamp'
kubectl get pods --sort-by='.status.containerStatuses[0].restartCount'
```

---

## Inspecting Resources

```bash
# Full details + Events
kubectl describe pod <name>
kubectl describe node <name>
kubectl describe service <name>
kubectl describe deployment <name>

# View logs
kubectl logs <pod>
kubectl logs <pod> -c <container>        # specific container in multi-container pod
kubectl logs <pod> --previous            # logs from crashed container
kubectl logs <pod> -f                    # follow (stream) logs
kubectl logs -l app=my-app -f            # logs from all pods with label

# Explain resource fields
kubectl explain pod.spec.containers
kubectl explain deployment.spec.strategy
```

---

## Creating and Applying Resources

```bash
# Apply (create or update) from file
kubectl apply -f manifest.yaml
kubectl apply -f directory/               # apply all YAMLs in a directory
kubectl apply -f https://example.com/manifest.yaml

# Dry run (validate without creating)
kubectl apply -f manifest.yaml --dry-run=client
kubectl apply -f manifest.yaml --dry-run=server

# Imperative creation
kubectl create deployment nginx --image=nginx:1.25 --replicas=3
kubectl create service clusterip my-svc --tcp=80:8080
kubectl create namespace my-ns
kubectl create configmap my-config --from-literal=key=value
kubectl create secret generic my-secret --from-literal=password=mysecret
```

---

## Editing Resources

```bash
# Open in editor
kubectl edit deployment my-deployment

# Patch (JSON merge patch)
kubectl patch deployment my-deployment -p '{"spec":{"replicas":5}}'

# Scale directly
kubectl scale deployment my-deployment --replicas=5

# Set image
kubectl set image deployment/my-deployment container=new-image:v2
```

---

## Deleting Resources

```bash
# Delete from file
kubectl delete -f manifest.yaml

# Delete by name
kubectl delete pod my-pod
kubectl delete deployment my-deployment

# Delete all pods with a label
kubectl delete pods -l app=my-app

# Force-delete a stuck terminating pod
kubectl delete pod my-pod --grace-period=0 --force

# Delete everything in a namespace
kubectl delete all --all -n my-namespace
```

---

## Executing Commands

```bash
# Interactive shell
kubectl exec -it my-pod -- /bin/bash
kubectl exec -it my-pod -- /bin/sh       # if bash not available

# Run a one-off command
kubectl exec my-pod -- ls /app
kubectl exec my-pod -- env

# Copy files to/from pod
kubectl cp my-pod:/app/logs/app.log ./app.log
kubectl cp ./config.yaml my-pod:/app/config.yaml
```

---

## Deployments and Rollouts

```bash
# Check rollout status
kubectl rollout status deployment/my-deployment

# View rollout history
kubectl rollout history deployment/my-deployment

# View a specific revision
kubectl rollout history deployment/my-deployment --revision=3

# Rollback to previous version
kubectl rollout undo deployment/my-deployment

# Rollback to specific revision
kubectl rollout undo deployment/my-deployment --to-revision=2

# Pause / resume rollout
kubectl rollout pause deployment/my-deployment
kubectl rollout resume deployment/my-deployment

# Restart all pods (triggers rolling restart)
kubectl rollout restart deployment/my-deployment
```

---

## Port Forwarding

```bash
# Forward local port to pod
kubectl port-forward pod/my-pod 8080:80

# Forward to a service
kubectl port-forward service/my-service 8080:80

# Forward in background
kubectl port-forward service/my-service 8080:80 &
```

---

## Resource Usage

```bash
# Pod CPU/memory usage (requires metrics-server)
kubectl top pods
kubectl top pods -n kube-system
kubectl top pods --sort-by=memory

# Node CPU/memory usage
kubectl top nodes
```

---

## Scripting & Waiting

| Command | Description |
|---|---|
| `kubectl wait --for=condition=ready pod -l app=myapp --timeout=120s` | Wait for pods to be ready (critical for CI/CD scripts) |
| `kubectl wait --for=delete pod/mypod --timeout=60s` | Wait for a resource to be completely deleted |
| `kubectl wait --for=condition=available --timeout=60s deployment/my-app` | Wait for deployment rollout to complete |

---

## RBAC & Auth

| Command | Description |
|---|---|
| `kubectl auth can-i create pods` | Check if current user can create pods |
| `kubectl auth can-i get secrets --as=system:serviceaccount:default:mysa` | Check permissions for a service account |
| `kubectl auth can-i --list` | List all permissions granted to current context |

---

## Discovery

| Command | Description |
|---|---|
| `kubectl api-resources` | List all available resource types and shortcuts in the cluster |
| `kubectl api-resources --verbs=list --namespaced=true` | List namespaced resources that support list operations |
| `kubectl explain pod.spec.containers` | Get official schema documentation for any resource field |

---

## Debugging

```bash
# Inject ephemeral debug container (K8s 1.23+)
kubectl debug -it my-pod --image=nicolaka/netshoot:v0.13 --target=my-container

# Copy pod and add debug container
kubectl debug my-pod -it --copy-to=debug-pod --image=busybox:1.36

# Get events for a specific object
kubectl get events --field-selector involvedObject.name=my-pod

# All events, newest last
kubectl get events --sort-by='.lastTimestamp'

# Warning events only
kubectl get events --field-selector type=Warning
```

---

## Output Formatting

```bash
# JSONPath examples
kubectl get pod my-pod -o jsonpath='{.status.podIP}'
kubectl get pods -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.podIP}{"\n"}{end}'

# Custom columns
kubectl get pods -o custom-columns='NAME:.metadata.name,STATUS:.status.phase,IP:.status.podIP'

# Table output (default)
kubectl get pods

# No headers
kubectl get pods --no-headers
```

---

## Common Flags

| Flag | Meaning |
|---|---|
| `-n <namespace>` | Target namespace |
| `-A` / `--all-namespaces` | All namespaces |
| `-l <label>` | Filter by label |
| `-o yaml/json/wide` | Output format |
| `-w` / `--watch` | Watch for changes |
| `--dry-run=client` | Preview without applying |
| `-f <file>` | Read from file |
| `--force` | Skip confirmation |
| `--grace-period=0` | Immediate termination |
