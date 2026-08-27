# 15.4 Image Security — Scanning and Supply Chain

⏱️ **5 min read · 6 min hands-on** · 🔴 Advanced

> **TL;DR:** Your application is only as secure as the container image it runs in. Image security has three layers: **scanning** (find known CVEs in image layers), **supply chain hardening** (build minimal images, sign them, verify provenance), and **runtime admission** (only allow images from trusted registries with no critical CVEs). A compromised image is the most common entry point for container-level attacks.

> **After this section you will be able to:**
> - Scan container images for CVE vulnerabilities using Trivy
> - Implement image provenance verification and signature validation with Cosign/Sigstore
> - Enforce strict digest pinning and immutable tag policies across production clusters

---

## The Attack Surface of a Container Image

```
Your App Container Image contains:
  ├── Base OS layer       ← 200+ packages, many with CVEs
  ├── Language runtime    ← python3.9, node18, java17 (often outdated)
  ├── Your dependencies   ← npm/pip/maven packages (supply chain risk)
  └── Your application    ← your code (your responsibility)

A typical ubuntu:22.04 base image ships with 20-30 medium/high CVEs out of the box.
A distroless image ships with 0-3.
```

---

## Image Scanning

Scanning analyses each layer of an image against CVE databases (NVD, OSV, GitHub Advisories):

```bash
# Trivy — the most popular open-source scanner
# Install
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh

# Scan an image
trivy image nginx:latest
trivy image python:3.11

# Scan with severity filter (only HIGH and CRITICAL)
trivy image --severity HIGH,CRITICAL nginx:latest

# Scan and fail CI/CD if critical CVEs found
trivy image --exit-code 1 --severity CRITICAL nginx:latest

# Scan a local Dockerfile before building
trivy config ./Dockerfile

# Scan a running Kubernetes cluster's images
trivy k8s --report summary cluster

# Output as JSON for automation
trivy image --format json --output results.json nginx:latest
```

**Example output:**
```
nginx:latest (debian 12.5)
Total: 143 (UNKNOWN: 0, LOW: 89, MEDIUM: 44, HIGH: 10, CRITICAL: 0)

┌─────────────────┬────────────────┬──────────┬──────────────────┐
│    Library      │ Vulnerability  │ Severity │  Fixed Version   │
├─────────────────┼────────────────┼──────────┼──────────────────┤
│ libssl3         │ CVE-2024-xxxx  │ HIGH     │ 3.0.14-1~deb12u1 │
│ zlib1g          │ CVE-2023-xxxx  │ MEDIUM   │ 1:1.2.13.dfsg-1  │
└─────────────────┴────────────────┴──────────┴──────────────────┘
```

---

## Building Minimal Images

Fewer packages = fewer CVEs = smaller attack surface:

```dockerfile
# ❌ Bad: full OS base with a package manager left in
FROM ubuntu:22.04
RUN apt-get install -y python3 python3-pip
COPY app.py .
CMD ["python3", "app.py"]
# Result: ~150MB, 50+ CVEs, bash/curl available for attacker

# ✅ Better: language-specific slim image
FROM python:3.12-slim
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
USER 1001                  # Non-root user
CMD ["python", "app.py"]
# Result: ~70MB, 10-15 CVEs

# ✅ Best: distroless (no shell, no package manager, no OS utilities)
# Multi-stage build: build in full image, run in distroless
FROM python:3.12-slim AS builder
COPY requirements.txt .
RUN pip install --prefix=/install --no-cache-dir -r requirements.txt

FROM gcr.io/distroless/python3-debian12
COPY --from=builder /install /usr/local
COPY app.py .
USER 65532                 # nonroot user in distroless
CMD ["app.py"]
# Result: ~40MB, 0-3 CVEs, no shell available for attacker
```

### Multi-Stage Build Benefits

```dockerfile
# Common pattern for compiled languages (Go, Rust, Java)
FROM golang:1.22 AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app ./cmd/server

# Run stage: scratch (literally empty) or distroless
FROM gcr.io/distroless/static-debian12
COPY --from=builder /app /app
USER 65532:65532
ENTRYPOINT ["/app"]
# Result: ~8MB, 0 CVEs, no OS whatsoever
```

---

## Image Supply Chain — Signing and Verification

### Cosign — Sign and Verify Images

```bash
# Install cosign
curl -O -L https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64
chmod +x cosign-linux-amd64 && sudo mv cosign-linux-amd64 /usr/local/bin/cosign

# Generate a key pair
cosign generate-key-pair

# Sign an image (after pushing to registry)
cosign sign --key cosign.key registry.example.com/my-app:v1.2.3

# Verify a signature before deploying
cosign verify --key cosign.pub registry.example.com/my-app:v1.2.3

# Keyless signing (uses OIDC identity — great for CI/CD)
# In GitHub Actions:
cosign sign --yes registry.example.com/my-app:v1.2.3
```

### Admission Enforcement — Kyverno Policy Example

Block unsigned images at the cluster level:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-image-signature
spec:
  validationFailureAction: Enforce    # Block violating pods
  rules:
  - name: verify-signature
    match:
      any:
      - resources:
          kinds: [Pod]
          namespaces: [production]
    verifyImages:
    - imageReferences:
      - "registry.example.com/my-app:*"
      attestors:
      - entries:
        - keys:
            publicKeys: |-
              -----BEGIN PUBLIC KEY-----
              <your-cosign-public-key>
              -----END PUBLIC KEY-----
```

---

## Registry Admission Control

Restrict pods to only pull from your trusted registry:

```yaml
# Kyverno: block images from Docker Hub in production
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: allowed-registries
spec:
  validationFailureAction: Enforce
  rules:
  - name: check-registry
    match:
      any:
      - resources:
          kinds: [Pod]
          namespaces: [production, staging]
    validate:
      message: "Only images from registry.example.com are allowed"
      pattern:
        spec:
          containers:
          - image: "registry.example.com/*"
```

---

## Image Security Checklist

| Check | Tool | What to Enforce |
|-------|------|-----------------|
| No CRITICAL CVEs | Trivy in CI | `trivy image --exit-code 1 --severity CRITICAL` |
| Minimal base image | Dockerfile review | Use distroless or `-slim` variants |
| Non-root user | Dockerfile / PSS | `USER 1001` in Dockerfile; `runAsNonRoot: true` in Pod spec |
| No latest tag | Kyverno policy | Require `image: name:SHA256@...` or specific semver |
| Signed images | Cosign + Kyverno | Verify signature before admission |
| Allowed registry | Kyverno policy | Allowlist your internal registry |
| SBOM attached | Syft / Cosign | `cosign attach sbom` for audit trail |

---

## ✅ Quick Check

**Q1:** What's the difference between a `slim` image and a `distroless` image?

<details>
<summary>Answer</summary>
A `-slim` image (e.g., `python:3.12-slim`) is a trimmed version of the full OS image — it removes many unnecessary packages but still has a shell (`bash`/`sh`), `apt`, and other OS utilities. An attacker who gets code execution can still explore the system. A **distroless** image contains *only* the application runtime and its dependencies — no shell, no package manager, no `/bin/ls`. If an attacker gets code execution, they have almost nothing to work with. Distroless images also have dramatically fewer CVEs since there are fewer packages.
</details>

**Q2:** You pin all images to a specific digest (`image@sha256:abc123...`). Why is this more secure than using a version tag like `:v1.2.3`?

<details>
<summary>Answer</summary>
Version tags are **mutable** — a registry can have the tag `v1.2.3` repointed to a different (potentially malicious) image without you knowing. A **content-addressable digest** (`sha256:abc123...`) is the cryptographic hash of the image content — it uniquely identifies exactly one image layer set and cannot be spoofed. Even if the registry is compromised and the tag is overwritten, the digest still points to the exact image you tested and signed.
</details>

**Q3:** At what stages in the software delivery lifecycle should image scanning happen?

<details>
<summary>Answer</summary>
**All three stages** for defence in depth:
1. **Developer workstation** — scan before committing (pre-commit hooks with `trivy image`)
2. **CI/CD pipeline** — block merge/deploy if CRITICAL CVEs found (`trivy --exit-code 1`)
3. **Runtime admission** — scan images at pod creation time (Trivy Operator, Anchore) and continuously rescan deployed images as new CVEs are published

Scanning only in CI is insufficient because new CVEs are discovered daily. An image that was clean yesterday can have a CRITICAL CVE today, so continuous runtime scanning of deployed images is essential for production security.
</details>
