# Summary

[Introduction](./introduction.md)

---

# Part I: Foundations

- [Chapter 1: The Container Orchestration Problem](./ch01-why-kubernetes/README.md)
  - [1.1 From Docker to Orchestration — Why Compose Isn't Enough](./ch01-why-kubernetes/01-docker-to-orchestration.md)
  - [1.2 Kubernetes Architecture — The 10,000ft View](./ch01-why-kubernetes/02-architecture-overview.md)
  - [1.3 Control Plane Deep Dive](./ch01-why-kubernetes/03-control-plane.md)
  - [1.4 Worker Nodes and the Kubelet](./ch01-why-kubernetes/04-worker-nodes.md)
  - [1.5 Lab: Your First Cluster — Minikube Setup & Exploration](./ch01-why-kubernetes/05-lab-first-cluster.md)

- [Chapter 2: kubectl — Your Swiss Army Knife](./ch02-kubectl/README.md)
  - [2.1 Anatomy of a kubectl Command](./ch02-kubectl/01-anatomy.md)
  - [2.2 Imperative vs Declarative — Two Ways to Talk to K8s](./ch02-kubectl/02-imperative-vs-declarative.md)
  - [2.3 Context, Namespaces, and kubeconfig](./ch02-kubectl/03-context-namespaces.md)
  - [2.4 Output Formatting, Filtering, and JSONPath](./ch02-kubectl/04-output-filtering.md)
  - [2.5 Lab: kubectl Power User Drills](./ch02-kubectl/05-lab-kubectl-drills.md)

- [Chapter 3: Pods — The Atomic Unit](./ch03-pods/README.md)
  - [3.1 What Is a Pod, Really?](./ch03-pods/01-what-is-a-pod.md)
  - [3.2 Pod Lifecycle and Phases](./ch03-pods/02-lifecycle.md)
  - [3.3 Multi-Container Pods: Sidecars, Init, and Ambassadors](./ch03-pods/03-multi-container.md)
  - [3.4 Resource Requests and Limits](./ch03-pods/04-resources.md)
  - [3.5 Lab: Run, Inspect, Break, and Debug Pods](./ch03-pods/05-lab-pods.md)

- [Chapter 4: Workload Controllers](./ch04-workloads/README.md)
  - [4.1 ReplicaSets — Desired State and Self-Healing](./ch04-workloads/01-replicasets.md)
  - [4.2 Deployments — Rolling Updates, Rollbacks, and Strategy](./ch04-workloads/02-deployments.md)
  - [4.3 DaemonSets — One Per Node](./ch04-workloads/03-daemonsets.md)
  - [4.4 StatefulSets — When Identity Matters](./ch04-workloads/04-statefulsets.md)
  - [4.5 Jobs and CronJobs — Run-to-Completion Workloads](./ch04-workloads/05-jobs-cronjobs.md)
  - [4.6 Lab: Deploy, Scale, Update, and Rollback](./ch04-workloads/06-lab-workloads.md)

---

# Part II: Networking & Configuration

- [Chapter 5: Services — Exposing Your Applications](./ch05-services/README.md)
  - [5.1 ClusterIP — Internal Communication](./ch05-services/01-clusterip.md)
  - [5.2 NodePort — Exposing to the Outside](./ch05-services/02-nodeport.md)
  - [5.3 LoadBalancer — Cloud-Native Exposure](./ch05-services/03-loadbalancer.md)
  - [5.4 Headless Services and DNS](./ch05-services/04-headless-dns.md)
  - [5.5 Lab: Service Discovery and Connectivity Debugging](./ch05-services/05-lab-services.md)

- [Chapter 6: Ingress — HTTP Routing](./ch06-ingress/README.md)
  - [6.1 Ingress Controllers and Resources](./ch06-ingress/01-ingress-basics.md)
  - [6.2 Setting Up NGINX Ingress on Minikube](./ch06-ingress/02-nginx-ingress-setup.md)
  - [6.3 Path-Based and Host-Based Routing](./ch06-ingress/03-routing-rules.md)
  - [6.4 TLS Termination](./ch06-ingress/04-tls.md)
  - [6.5 Lab: Multi-Service Ingress with TLS](./ch06-ingress/05-lab-ingress.md)

- [Chapter 7: ConfigMaps and Secrets](./ch07-configuration/README.md)
  - [7.1 ConfigMaps — Externalizing Configuration](./ch07-configuration/01-configmaps.md)
  - [7.2 Secrets — Handling Sensitive Data](./ch07-configuration/02-secrets.md)
  - [7.3 Environment Variables vs Volume Mounts](./ch07-configuration/03-env-vs-volumes.md)
  - [7.4 Immutable ConfigMaps and Secret Rotation](./ch07-configuration/04-immutable-rotation.md)
  - [7.5 Lab: Configure a 12-Factor App](./ch07-configuration/05-lab-configuration.md)

- [Chapter 8: Storage — Persistent Data in K8s](./ch08-storage/README.md)
  - [8.1 Volume Types — Ephemeral to Persistent](./ch08-storage/01-volume-types.md)
  - [8.2 PersistentVolumes and PersistentVolumeClaims](./ch08-storage/02-pv-pvc.md)
  - [8.3 StorageClasses and Dynamic Provisioning](./ch08-storage/03-storageclasses.md)
  - [8.4 Access Modes and Reclaim Policies](./ch08-storage/04-access-modes-reclaim.md)
  - [8.5 Lab: Stateful App with Persistent Storage](./ch08-storage/05-lab-storage.md)

---

# Part III: Production Concerns

- [Chapter 9: Namespaces, RBAC, and Multi-Tenancy](./ch09-rbac/README.md)
  - [9.1 Namespaces — Cluster Partitioning](./ch09-rbac/01-namespaces.md)
  - [9.2 RBAC — Roles, ClusterRoles, and Bindings](./ch09-rbac/02-rbac.md)
  - [9.3 ServiceAccounts — Pod Identities](./ch09-rbac/03-serviceaccounts.md)
  - [9.4 Multi-Tenancy Patterns](./ch09-rbac/04-multi-tenancy.md)
  - [9.5 Lab: Lock Down a Namespace](./ch09-rbac/05-lab-rbac.md)

- [Chapter 10: Health Checks and Graceful Shutdown](./ch10-health/README.md)
  - [10.1 Why Probes Exist — The Problem They Solve](./ch10-health/01-why-probes.md)
  - [10.2 Liveness Probes — Restart the Stuck](./ch10-health/02-liveness.md)
  - [10.3 Readiness Probes — Control Traffic](./ch10-health/03-readiness.md)
  - [10.4 Startup Probes — Slow-Starting Apps](./ch10-health/04-startup.md)
  - [10.5 Graceful Shutdown and preStop Hooks](./ch10-health/05-graceful-shutdown.md)
  - [10.6 Lab: Probes and Shutdown Drills](./ch10-health/06-lab-health.md)

- [Chapter 11: Resource Management and Autoscaling](./ch11-resources/README.md)
  - [11.1 Requests and Limits — The Fundamentals](./ch11-resources/01-requests-limits.md)
  - [11.2 QoS Classes and Pod Eviction](./ch11-resources/02-qos-eviction.md)
  - [11.3 Horizontal Pod Autoscaler (HPA)](./ch11-resources/03-hpa.md)
  - [11.4 Vertical Pod Autoscaler (VPA)](./ch11-resources/04-vpa.md)
  - [11.5 Cluster Autoscaler](./ch11-resources/05-cluster-autoscaler.md)
  - [11.6 Lab: Resource Limits and HPA in Action](./ch11-resources/06-lab-resources.md)

---

# Part IV: Advanced Operations

- [Chapter 12: Helm — Package Management](./ch12-helm/README.md)
  - [12.1 What Helm Is and Why It Exists](./ch12-helm/01-what-is-helm.md)
  - [12.2 Installing Charts — helm install and Repositories](./ch12-helm/02-installing-charts.md)
  - [12.3 Chart Anatomy — Templates and Values](./ch12-helm/03-chart-anatomy.md)
  - [12.4 Creating Your Own Chart](./ch12-helm/04-creating-charts.md)
  - [12.5 Upgrades, Rollbacks, and Release Management](./ch12-helm/05-upgrades-rollbacks.md)
  - [12.6 Lab: Package and Deploy a Multi-Tier App](./ch12-helm/06-lab-helm.md)

- [Chapter 13: Observability — Logging, Metrics, and Tracing](./ch13-observability/README.md)
  - [13.1 The Three Pillars of Observability](./ch13-observability/01-three-pillars.md)
  - [13.2 Logging — kubectl logs, Stern, and Aggregation](./ch13-observability/02-logging.md)
  - [13.3 Metrics — Prometheus and metrics-server](./ch13-observability/03-metrics.md)
  - [13.4 Dashboards with Grafana](./ch13-observability/04-grafana.md)
  - [13.5 Lab: Full Observability Stack on Minikube](./ch13-observability/05-lab-observability.md)

- [Chapter 14: Scheduling and Placement](./ch14-scheduling/README.md)
  - [14.1 The Kubernetes Scheduler](./ch14-scheduling/01-scheduler.md)
  - [14.2 Node Affinity and Node Selectors](./ch14-scheduling/02-node-affinity.md)
  - [14.3 Taints and Tolerations](./ch14-scheduling/03-taints-tolerations.md)
  - [14.4 Pod Affinity and Anti-Affinity](./ch14-scheduling/04-pod-affinity.md)
  - [14.5 Lab: Control Where Pods Land](./ch14-scheduling/05-lab-scheduling.md)

- [Chapter 15: Security Hardening](./ch15-security/README.md)
  - [15.1 Pod Security Standards and Admission](./ch15-security/01-pod-security-standards.md)
  - [15.2 Network Policies — Microsegmentation](./ch15-security/02-network-policies.md)
  - [15.3 Secrets Management — Encryption and External Vaults](./ch15-security/03-secrets-management.md)
  - [15.4 Image Security — Scanning and Supply Chain](./ch15-security/04-image-security.md)
  - [15.5 Lab: Harden a Namespace End-to-End](./ch15-security/05-lab-security.md)

---

# Part V: CI/CD & GitOps

- [Chapter 16: CI/CD and GitOps](./ch16-cicd/README.md)
  - [16.1 GitOps Principles](./ch16-cicd/01-gitops-principles.md)
  - [16.2 Container Image CI Pipeline](./ch16-cicd/02-image-ci.md)
  - [16.3 Kubernetes Manifest Validation in CI](./ch16-cicd/03-manifest-validation.md)
  - [16.4 ArgoCD — Declarative CD for Kubernetes](./ch16-cicd/04-argocd.md)
  - [16.5 Lab: Full GitOps Pipeline](./ch16-cicd/05-lab-gitops.md)

---

# Part VI: Internals & Troubleshooting

- [Chapter 17: Kubernetes Internals](./ch17-internals/README.md)
  - [17.1 How a Pod Gets Created — The Full Journey](./ch17-internals/01-pod-creation-journey.md)
  - [17.2 etcd — The Cluster Brain](./ch17-internals/02-etcd.md)
  - [17.3 Container Runtimes and the CRI](./ch17-internals/03-container-runtimes.md)
  - [17.4 CNI — Container Network Interface](./ch17-internals/04-cni.md)
  - [17.5 CSI — Container Storage Interface](./ch17-internals/05-csi.md)

- [Chapter 18: Troubleshooting Playbook](./ch18-troubleshooting/README.md)
  - [18.1 The Debugging Mental Model](./ch18-troubleshooting/01-mental-model.md)
  - [18.2 Pod Failures — CrashLoopBackOff, ImagePullBackOff, OOMKilled](./ch18-troubleshooting/02-pod-failures.md)
  - [18.3 Networking Failures — DNS, Services, Connectivity](./ch18-troubleshooting/03-network-failures.md)
  - [18.4 Storage and Permission Issues](./ch18-troubleshooting/04-storage-issues.md)
  - [18.5 The Troubleshooting Cheat Sheet](./ch18-troubleshooting/05-cheat-sheet.md)

---

[Appendix A: YAML Crash Course](./appendix-a-yaml.md)
[Appendix B: kubectl Cheat Sheet](./appendix-b-kubectl-cheatsheet.md)
[Appendix C: Common K8s Error Reference](./appendix-c-error-reference.md)
[Appendix D: Resource Manifests Reference](./appendix-d-manifests.md)
