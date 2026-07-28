# Lab: Stateful App with Persistent Storage

⏱️ **~30 min hands-on**

| | |
|---|---|
| **Prerequisites** | Chapter 8 sections 8.1–8.4 read, Minikube running |
| **Difficulty** | 🟡 Intermediate |
| **What you'll do** | Deploy PostgreSQL with a PVC, prove data persists across pod restarts, use a StatefulSet with `volumeClaimTemplates`, and observe what happens when storage is deleted |

## Objectives

- [ ] Create a PVC using dynamic provisioning (Minikube default StorageClass)
- [ ] Deploy PostgreSQL using that PVC
- [ ] Write data to the database and restart the pod — prove data survives
- [ ] Deploy a StatefulSet with `volumeClaimTemplates` (one PVC per pod)
- [ ] Observe PVC lifecycle: what happens when the StatefulSet is deleted
- [ ] Debug a pod stuck due to a missing PVC

---

## Setup

```bash
kubectl create namespace storage-lab
kubectl config set-context --current --namespace=storage-lab
```

---

## Exercise 1: Dynamic PVC for PostgreSQL

**What we're doing:** Create storage dynamically and deploy PostgreSQL against it.

```bash
# Step 1: Create a PVC (StorageClass not specified → uses default)
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
  namespace: storage-lab
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 256Mi
EOF

# Check the PVC — starts Pending, then Bound
kubectl get pvc postgres-data -n storage-lab -w
```

**Expected progression:**
```
NAME            STATUS    VOLUME   CAPACITY   ACCESS MODES
postgres-data   Pending                                       ← before pod
postgres-data   Bound     pvc-xxx  256Mi      RWO             ← after pod scheduled
```

> 📝 **Note:** On Minikube with `Immediate` binding mode, the PVC may bind immediately. On cloud clusters with `WaitForFirstConsumer`, it stays `Pending` until a pod is scheduled.

```bash
# Step 2: Deploy PostgreSQL
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: storage-lab
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      volumes:
      - name: pgdata
        persistentVolumeClaim:
          claimName: postgres-data

      containers:
      - name: postgres
        image: postgres:16-alpine
        ports:
        - containerPort: 5432
        env:
        - name: POSTGRES_DB
          value: "appdb"
        - name: POSTGRES_USER
          value: "appuser"
        - name: POSTGRES_PASSWORD
          value: "labpassword"
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        volumeMounts:
        - name: pgdata
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: postgres-svc
  namespace: storage-lab
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
EOF

kubectl rollout status deployment/postgres -n storage-lab
```

---

## Exercise 2: Write Data, Restart Pod, Verify Persistence

**What we're doing:** Prove that data in a PVC-backed PostgreSQL survives pod restarts.

```bash
# Step 1: Write data to PostgreSQL
POD=$(kubectl get pods -n storage-lab -l app=postgres -o name | head -1)

kubectl exec -n storage-lab $POD -- \
  psql -U appuser -d appdb -c "
    CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
    INSERT INTO users (name) VALUES ('Alice'), ('Bob'), ('Carol');
    SELECT * FROM users;
  "
```

**Expected output:**
```
CREATE TABLE
INSERT 0 3
 id | name  |          created_at
----+-------+-------------------------------
  1 | Alice | 2026-07-15 05:45:00.123456+00
  2 | Bob   | 2026-07-15 05:45:00.123456+00
  3 | Carol | 2026-07-15 05:45:00.123456+00
(3 rows)
```

```bash
# Step 2: Delete the pod (Deployment will recreate it)
kubectl delete pod -n storage-lab -l app=postgres

# Wait for new pod
kubectl rollout status deployment/postgres -n storage-lab

# Step 3: Query the NEW pod — data must still be there
NEW_POD=$(kubectl get pods -n storage-lab -l app=postgres -o name | head -1)
kubectl exec -n storage-lab $NEW_POD -- \
  psql -U appuser -d appdb -c "SELECT * FROM users;"
```

**Expected (same data in new pod):**
```
 id | name  |          created_at
----+-------+-------------------------------
  1 | Alice | 2026-07-15 05:45:00.123456+00
  2 | Bob   | 2026-07-15 05:45:00.123456+00
  3 | Carol | 2026-07-15 05:45:00.123456+00
(3 rows)
```

> 💡 **What just happened?** The new pod mounted the same PVC, which points to the same PersistentVolume. PostgreSQL found its data files at `/var/lib/postgresql/data/pgdata` exactly where it left them. Pod identity is irrelevant — the data lives in the PV.

---

## Exercise 3: StatefulSet with volumeClaimTemplates

**What we're doing:** Deploy a StatefulSet where each pod gets its OWN PVC automatically.

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: data-store
  namespace: storage-lab
spec:
  serviceName: data-store
  replicas: 3
  selector:
    matchLabels:
      app: data-store
  template:
    metadata:
      labels:
        app: data-store
    spec:
      containers:
      - name: store
        image: busybox
        command: ["sh", "-c", "echo \"Pod: $HOSTNAME\" > /data/identity.txt && sleep 3600"]
        volumeMounts:
        - name: data
          mountPath: /data
        resources:
          limits:
            memory: "16Mi"
            cpu: "50m"
  volumeClaimTemplates:           # ← Creates one PVC per pod
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 64Mi
EOF

kubectl rollout status statefulset/data-store -n storage-lab
```

Watch three separate PVCs get created:

```bash
kubectl get pvc -n storage-lab
```

**Expected:**
```
NAME                  STATUS   VOLUME       CAPACITY   ACCESS MODES
data-data-store-0     Bound    pvc-aaa      64Mi       RWO    ← for data-store-0
data-data-store-1     Bound    pvc-bbb      64Mi       RWO    ← for data-store-1
data-data-store-2     Bound    pvc-ccc      64Mi       RWO    ← for data-store-2
postgres-data         Bound    pvc-ddd      256Mi      RWO
```

Verify each pod has its own isolated storage:

```bash
for i in 0 1 2; do
  echo "=== data-store-$i ==="
  kubectl exec -n storage-lab data-store-$i -- cat /data/identity.txt
done
```

**Expected:**
```
=== data-store-0 ===
Pod: data-store-0

=== data-store-1 ===
Pod: data-store-1

=== data-store-2 ===
Pod: data-store-2
```

Now delete and re-create `data-store-1`:

```bash
kubectl delete pod data-store-1 -n storage-lab
kubectl wait pod data-store-1 -n storage-lab --for=condition=Ready --timeout=60s

# It came back with the same PVC — identity preserved
kubectl exec -n storage-lab data-store-1 -- cat /data/identity.txt
# Pod: data-store-1  ← same content from the persistent volume
```

---

## Exercise 4: StatefulSet Deletion and PVC Lifecycle

**What we're doing:** Observe what happens to PVCs when a StatefulSet is deleted.

```bash
# Delete the StatefulSet (NOT the PVCs)
kubectl delete statefulset data-store -n storage-lab

# Check PVCs — they still exist!
kubectl get pvc -n storage-lab | grep data-store
```

**Expected:**
```
data-data-store-0   Bound   ...   ← Still there!
data-data-store-1   Bound   ...   ← Still there!
data-data-store-2   Bound   ...   ← Still there!
```

> 💡 **Key insight:** Deleting a StatefulSet does NOT delete its PVCs. This is intentional — it prevents accidental data loss. You must manually delete PVCs with `kubectl delete pvc`. This is a common source of surprise (and saved data) in production.

```bash
# Clean up PVCs explicitly
kubectl delete pvc -n storage-lab data-data-store-0 data-data-store-1 data-data-store-2
```

---

## Exercise 5: Inspect Storage Details

```bash
# See all PVs in the cluster
kubectl get pv

# Which PVC is bound to which PV?
kubectl get pv -o custom-columns=\
'NAME:.metadata.name,CAPACITY:.spec.capacity.storage,STATUS:.status.phase,CLAIM:.spec.claimRef.name,POLICY:.spec.persistentVolumeReclaimPolicy'

# See StorageClass details
kubectl describe storageclass standard  # Minikube's default

# See full PVC details
kubectl describe pvc postgres-data -n storage-lab
```

---

## 🔥 Break It! Challenge

> What happens when a pod references a PVC that doesn't exist?

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: missing-pvc-pod
  namespace: storage-lab
spec:
  volumes:
  - name: data
    persistentVolumeClaim:
      claimName: this-pvc-does-not-exist
  containers:
  - name: app
    image: nginx:1.25
    volumeMounts:
    - name: data
      mountPath: /data
    resources:
      limits:
        memory: "32Mi"
        cpu: "50m"
EOF

# Pod stays in Pending
kubectl get pod missing-pvc-pod -n storage-lab

# See the exact error
kubectl describe pod missing-pvc-pod -n storage-lab | tail -10
```

**Expected Events:**
```
Warning  FailedMount   Unable to attach or mount volumes: ... persistentvolumeclaim "this-pvc-does-not-exist" not found
```

Fix it by creating the PVC:

```bash
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: this-pvc-does-not-exist
  namespace: storage-lab
spec:
  accessModes:
  - ReadWriteOnce
  resources:
    requests:
      storage: 64Mi
EOF

# Pod should start now
kubectl get pod missing-pvc-pod -n storage-lab -w
```

---

## Cleanup

```bash
# Delete everything in the lab namespace
kubectl delete deployment postgres -n storage-lab
kubectl delete pvc postgres-data -n storage-lab
kubectl delete pvc this-pvc-does-not-exist -n storage-lab
kubectl delete pod missing-pvc-pod -n storage-lab
kubectl delete svc postgres-svc -n storage-lab

kubectl config set-context --current --namespace=default
kubectl delete namespace storage-lab
```

---

## What We Learned

| # | Skill | Verified By |
|---|-------|-------------|
| 1 | Dynamic PVC provisioning | PVC created without a pre-existing PV |
| 2 | PostgreSQL with PVC | Data written, pod deleted, data survived in new pod |
| 3 | StatefulSet PVC-per-pod | Three pods, three separate PVCs, isolated data |
| 4 | Pod identity preserved | data-store-1 got same PVC after deletion |
| 5 | PVCs outlive StatefulSet | PVCs remain after `kubectl delete statefulset` |
| 6 | Missing PVC debugging | Found error via describe, fixed by creating PVC |
