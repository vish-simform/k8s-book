# Lab: Multi-Service Ingress with TLS

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | NGINX Ingress enabled (`minikube addons enable ingress`), Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Deploy three services, wire them up with path and host routing, add TLS, and debug a misconfigured Ingress |

## Objectives

- [ ] Enable and verify the NGINX Ingress Controller
- [ ] Deploy three services with distinct responses
- [ ] Configure path-based routing for two services under one domain
- [ ] Add host-based routing for a third service on a different domain
- [ ] Add TLS with a self-signed certificate
- [ ] Debug a broken Ingress rule

---

## Setup

```bash
kubectl create namespace ingress-lab
kubectl config set-context --current --namespace=ingress-lab

# Ensure NGINX Ingress is enabled and ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo "Minikube IP: $(minikube ip)"
```

---

## Exercise 1: Deploy Three Services

**What we're doing:** Create three distinct services that we'll route to via Ingress.

```bash
# Service 1: Web frontend
kubectl create deployment web --image=nginx:1.25 -n ingress-lab
kubectl expose deployment web --port=80 --name=web-svc -n ingress-lab
kubectl exec -n ingress-lab deploy/web -- \
  sh -c "echo '<h1>Welcome to Web Frontend</h1>' > /usr/share/nginx/html/index.html"

# Service 2: API
kubectl create deployment api --image=nginx:1.25 -n ingress-lab
kubectl expose deployment api --port=80 --name=api-svc -n ingress-lab
kubectl exec -n ingress-lab deploy/api -- \
  sh -c 'echo '"'"'{"service":"api","status":"ok"}'"'"' > /usr/share/nginx/html/index.html'

# Service 3: Admin panel (different domain)
kubectl create deployment admin --image=nginx:1.25 -n ingress-lab
kubectl expose deployment admin --port=80 --name=admin-svc -n ingress-lab
kubectl exec -n ingress-lab deploy/admin -- \
  sh -c "echo '<h1>Admin Panel</h1>' > /usr/share/nginx/html/index.html"

# Verify all running
kubectl get deploy,svc -n ingress-lab
```

---

## Exercise 2: Path-Based Routing

**What we're doing:** Route `/` to the web frontend and `/api` to the API service — both under `myapp.local`.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: path-ingress
  namespace: ingress-lab
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-svc
            port:
              number: 80
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-svc
            port:
              number: 80
EOF

# Check Ingress status (ADDRESS should show Minikube IP)
kubectl get ingress path-ingress -n ingress-lab

# Test (using Host header to fake DNS)
MINIKUBE_IP=$(minikube ip)
echo "=== Testing / → web-svc ==="
curl -s -H "Host: myapp.local" http://$MINIKUBE_IP/

echo ""
echo "=== Testing /api → api-svc ==="
curl -s -H "Host: myapp.local" http://$MINIKUBE_IP/api
```

**Expected output:**
```
=== Testing / → web-svc ===
<h1>Welcome to Web Frontend</h1>

=== Testing /api → api-svc ===
{"service":"api","status":"ok"}
```

> 💡 **What just happened?** NGINX reads the `Host` header and the URL path, then selects the matching backend. The two services share a single IP but respond to different paths.

---

## Exercise 3: Add Host-Based Routing

**What we're doing:** Route traffic to the admin service using a separate hostname.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: host-ingress
  namespace: ingress-lab
spec:
  ingressClassName: nginx
  rules:
  - host: admin.local          # Separate hostname → admin service
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: admin-svc
            port:
              number: 80
EOF

# Test host-based routing
MINIKUBE_IP=$(minikube ip)
echo "=== myapp.local → web-svc ==="
curl -s -H "Host: myapp.local" http://$MINIKUBE_IP/

echo ""
echo "=== admin.local → admin-svc ==="
curl -s -H "Host: admin.local" http://$MINIKUBE_IP/

# Optional: Add to /etc/hosts for browser testing
echo "# Add these for browser access:"
echo "echo '$(minikube ip) myapp.local admin.local' | sudo tee -a /etc/hosts"
```

**Expected:**
```
=== myapp.local → web-svc ===
<h1>Welcome to Web Frontend</h1>

=== admin.local → admin-svc ===
<h1>Admin Panel</h1>
```

---

## Exercise 4: Add TLS

**What we're doing:** Secure `myapp.local` with a self-signed certificate.

```bash
# Generate certificate covering both hosts
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout /tmp/lab.key \
  -out /tmp/lab.crt \
  -subj "/CN=myapp.local/O=ingress-lab" \
  -addext "subjectAltName=DNS:myapp.local,DNS:admin.local" \
  2>/dev/null

echo "Certificate generated."

# Create TLS Secret in ingress-lab namespace
kubectl create secret tls lab-tls \
  --cert=/tmp/lab.crt \
  --key=/tmp/lab.key \
  -n ingress-lab

kubectl get secret lab-tls -n ingress-lab
```

Update the path-based Ingress to use TLS:

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: path-ingress
  namespace: ingress-lab
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - myapp.local
    secretName: lab-tls
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-svc
            port:
              number: 80
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-svc
            port:
              number: 80
EOF

MINIKUBE_IP=$(minikube ip)

# Test HTTP → HTTPS redirect (expect 308)
echo "=== HTTP redirect check ==="
curl -v -H "Host: myapp.local" http://$MINIKUBE_IP/ 2>&1 | grep -E "< HTTP|Location"

# Test HTTPS directly (-k skips cert verification)
echo ""
echo "=== HTTPS response ==="
curl -k -s -H "Host: myapp.local" https://$MINIKUBE_IP/

# Inspect the certificate being served
echo ""
echo "=== Certificate info ==="
echo | openssl s_client -connect $MINIKUBE_IP:443 \
  -servername myapp.local 2>/dev/null | openssl x509 -noout -subject -dates
```

**Expected:**
```
=== HTTP redirect check ===
< HTTP/1.1 308 Permanent Redirect
Location: https://myapp.local/

=== HTTPS response ===
<h1>Welcome to Web Frontend</h1>

=== Certificate info ===
subject=CN=myapp.local, O=ingress-lab
notBefore=Jul 15 05:00:00 2026 GMT
notAfter=Jul 15 05:00:00 2027 GMT
```

---

## Exercise 5: Debug a Broken Ingress

**What we're doing:** Introduce a common Ingress mistake and diagnose it.

```bash
# Create a broken Ingress (references a Service that doesn't exist)
cat <<'EOF' | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: broken-ingress
  namespace: ingress-lab
spec:
  ingressClassName: nginx
  rules:
  - host: broken.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: nonexistent-svc    # ← This service doesn't exist
            port:
              number: 80
EOF

# Test — gets 503 Service Unavailable
MINIKUBE_IP=$(minikube ip)
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" \
  -H "Host: broken.local" http://$MINIKUBE_IP/
```

**Expected:**
```
HTTP Status: 503
```

Now diagnose:

```bash
# Step 1: Check Ingress resource
kubectl describe ingress broken-ingress -n ingress-lab

# Step 2: Verify the backend Service exists
kubectl get svc -n ingress-lab | grep nonexistent  # Nothing found

# Step 3: Check NGINX Ingress controller logs
kubectl logs -n ingress-nginx \
  -l app.kubernetes.io/component=controller \
  --tail=20 | grep -i "error\|broken"

# Step 4: Fix it by pointing to a real service
kubectl patch ingress broken-ingress -n ingress-lab \
  --type='json' \
  -p='[{"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/name","value":"web-svc"}]'

# Verify the fix
curl -s -H "Host: broken.local" http://$MINIKUBE_IP/
```

---

## 🔥 Break It! Challenge

> What happens when two Ingress resources claim the same host/path?

```bash
# Create a second Ingress that claims myapp.local/
cat <<'EOF' | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: duplicate-ingress
  namespace: ingress-lab
spec:
  ingressClassName: nginx
  rules:
  - host: myapp.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: admin-svc
            port:
              number: 80
EOF

# Which one wins?
for i in {1..5}; do
  curl -s -H "Host: myapp.local" http://$MINIKUBE_IP/ 2>/dev/null
  echo ""
done
```

**Observation:** NGINX uses the Ingress that was created **first** (by creation timestamp). The second one for the same host/path is effectively ignored (or causes inconsistent behavior). Check NGINX controller logs to see the conflict warning.

**The lesson:** Conflicting Ingress rules are a common production gotcha. Use namespaced Ingress resources carefully, and always check for conflicts after applying new Ingress rules.

```bash
kubectl delete ingress duplicate-ingress -n ingress-lab
```

---

## Cleanup

```bash
kubectl config set-context --current --namespace=default
kubectl delete namespace ingress-lab
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | NGINX Ingress setup | Controller pod Running in ingress-nginx namespace |
| 2 | Path-based routing | `/` → web-svc, `/api` → api-svc with correct responses |
| 3 | Host-based routing | `admin.local` → admin-svc independently |
| 4 | TLS termination | HTTPS working with self-signed cert, HTTP redirects to HTTPS |
| 5 | Debug 503 errors | Traced to missing backend service via describe + controller logs |
| 6 | Duplicate rules | Observed first-wins behavior for conflicting Ingress rules |
