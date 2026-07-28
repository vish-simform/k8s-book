# 12.3 Chart Anatomy — Templates and Values

⏱️ **~7 min read**

> **TL;DR:** A chart is a directory with a `Chart.yaml` (metadata), `values.yaml` (defaults), and a `templates/` directory with Go-templated Kubernetes YAML files. The templates use `{{ .Values.xyz }}` to insert values at render time.

---

## Chart Directory Structure

```
my-app/                        # Chart directory (name = chart name)
├── Chart.yaml                 # Chart metadata (name, version, description)
├── values.yaml                # Default values (can be overridden)
├── charts/                    # Sub-charts (dependencies)
├── templates/                 # Go template YAML files
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── hpa.yaml
│   ├── serviceaccount.yaml
│   ├── _helpers.tpl           # Reusable template functions (partials)
│   └── NOTES.txt              # Post-install instructions shown to user
└── .helmignore                # Files to exclude from packaging
```

---

## `Chart.yaml` — The Metadata File

```yaml
# Chart.yaml
apiVersion: v2           # Helm 3 API version (always v2 for new charts)
name: my-app
description: A Helm chart for My Application
type: application        # application | library
version: 0.1.0           # Chart version — bump on every change
appVersion: "1.2.3"      # The app version being packaged (informational)

maintainers:
- name: Your Name
  email: you@example.com

dependencies:            # Sub-charts this chart requires
- name: postgresql
  version: "12.x.x"
  repository: "https://charts.bitnami.com/bitnami"
  condition: postgresql.enabled   # Only install if this value is true
```

---

## `values.yaml` — Default Configuration

```yaml
# values.yaml
replicaCount: 2

image:
  repository: myrepo/my-app
  tag: "1.2.3"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80

ingress:
  enabled: false
  className: nginx
  host: myapp.example.com

resources:
  requests:
    cpu: "100m"
    memory: "128Mi"
  limits:
    cpu: "500m"
    memory: "256Mi"

autoscaling:
  enabled: false
  minReplicas: 2
  maxReplicas: 10
  targetCPU: 50

postgresql:
  enabled: true          # Controls whether the PostgreSQL sub-chart is installed
  auth:
    password: "changeme"
```

---

## Template Syntax

Templates are Kubernetes YAML with Go template expressions:

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "my-app.fullname" . }}    # Uses helper function
  namespace: {{ .Release.Namespace }}
  labels:
    {{- include "my-app.labels" . | nindent 4 }}
    app.kubernetes.io/version: {{ .Chart.AppVersion }}
spec:
  replicas: {{ .Values.replicaCount }}        # From values.yaml
  selector:
    matchLabels:
      {{- include "my-app.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "my-app.selectorLabels" . | nindent 8 }}
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
        imagePullPolicy: {{ .Values.image.pullPolicy }}
        ports:
        - containerPort: {{ .Values.service.port }}
        resources:
          {{- toYaml .Values.resources | nindent 12 }}  # Dump YAML block

      {{- if .Values.autoscaling.enabled }}             # Conditional block
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "my-app.fullname" . }}
spec:
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
      {{- end }}
```

---

## Built-in Template Objects

```yaml
{{ .Release.Name }}       # The release name (e.g., "my-nginx")
{{ .Release.Namespace }}  # The namespace (e.g., "production")
{{ .Release.IsInstall }}  # True if this is a fresh install
{{ .Release.IsUpgrade }}  # True if this is an upgrade
{{ .Chart.Name }}         # Chart name (e.g., "my-app")
{{ .Chart.Version }}      # Chart version (e.g., "0.1.0")
{{ .Chart.AppVersion }}   # App version (e.g., "1.2.3")
{{ .Values.xyz }}         # Values from values.yaml (or overridden)
{{ .Files.Get "config/app.conf" }}  # Read a non-template file
```

---

## The `_helpers.tpl` Pattern

Helper functions are defined in `_helpers.tpl` and called throughout templates:

```yaml
# templates/_helpers.tpl
{{/*
Expand the name of the chart.
*/}}
{{- define "my-app.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "my-app.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels applied to all resources.
*/}}
{{- define "my-app.labels" -}}
helm.sh/chart: {{ include "my-app.chart" . }}
app.kubernetes.io/name: {{ include "my-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
```

---

## `NOTES.txt` — Post-Install Instructions

```
# templates/NOTES.txt
Thank you for installing {{ .Chart.Name }} {{ .Chart.AppVersion }}!

Your release {{ .Release.Name }} is deployed in namespace {{ .Release.Namespace }}.

{{- if .Values.ingress.enabled }}
Access your application at: http://{{ .Values.ingress.host }}
{{- else if eq .Values.service.type "NodePort" }}
Get the application URL:
  export NODE_PORT=$(kubectl get svc {{ include "my-app.fullname" . }} \
    -n {{ .Release.Namespace }} -o jsonpath="{.spec.ports[0].nodePort}")
  export NODE_IP=$(kubectl get nodes -o jsonpath="{.items[0].status.addresses[0].address}")
  echo http://$NODE_IP:$NODE_PORT
{{- else }}
kubectl port-forward svc/{{ include "my-app.fullname" . }} 8080:80 -n {{ .Release.Namespace }}
{{- end }}
```

---

## Key Takeaways

| # | Concept | One-liner |
|---|---------|-----------|
| 1 | `Chart.yaml` = metadata | Name, version, description, dependencies |
| 2 | `values.yaml` = defaults | All configuration with sensible defaults |
| 3 | `templates/` = Go template YAML | `{{ .Values.x }}` injects values into K8s manifests |
| 4 | `_helpers.tpl` = shared functions | DRY principle — define once, use everywhere |
| 5 | `NOTES.txt` = install instructions | Shown after `helm install` to guide the user |

---

## ✅ Quick Check

**Q1:** A template uses `{{ .Values.ingress.enabled | default false }}`. The user installs without setting this value. What does the template render?

<details>
<summary>Answer</summary>
`false` — the `default` function returns the specified value when the left-hand value is nil (not set). The template renders `false`, and any `{{- if .Values.ingress.enabled }}` block is skipped.
</details>

**Q2:** You want to change the Ingress hostname without modifying the chart. How?

<details>
<summary>Answer</summary>
Create a custom `values.yaml` with just the override: `ingress: { host: myapp.example.com }` and pass it with `helm install --values my-values.yaml`. Or use `helm install --set ingress.host=myapp.example.com`. Your override merges with (and takes precedence over) the chart's default `values.yaml`.
</details>

**Q3:** What's the difference between `chart.version` and `chart.appVersion`?

<details>
<summary>Answer</summary>
`version` is the chart's version — incremented every time you change the chart itself (templates, values, structure). `appVersion` is the version of the application being packaged (e.g., nginx 1.25.3) — informational only, doesn't affect Helm behavior. You can update `appVersion` to track a new app release without bumping `version` if the chart templates didn't change.
</details>
