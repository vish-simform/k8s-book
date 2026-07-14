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
  - [8.1 Volumes, PersistentVolumes, and PersistentVolumeClaims](./ch08-storage/01-pv-pvc.md)
  - [8.2 StorageClasses and Dynamic Provisioning](./ch08-storage/02-storageclasses.md)
  - [8.3 Access Modes and Reclaim Policies](./ch08-storage/03-access-reclaim.md)
  - [8.4 Lab: Stateful MySQL with Persistent Storage](./ch08-storage/04-lab-storage.md)

---

# Part III: The Microservice Project

- [Chapter 9: Project — KubeShop Microservices](./ch09-kubeshop-intro/README.md)
  - [9.1 Architecture Overview — What We're Building](./ch09-kubeshop-intro/01-architecture.md)
  - [9.2 Service Breakdown and Tech Stack](./ch09-kubeshop-intro/02-service-breakdown.md)
  - [9.3 Containerizing the Services](./ch09-kubeshop-intro/03-containerizing.md)
  - [9.4 Lab: Build and Push All Images](./ch09-kubeshop-intro/04-lab-containerize.md)

- [Chapter 10: Deploying KubeShop to Minikube](./ch10-kubeshop-deploy/README.md)
  - [10.1 Namespace Strategy and Resource Organization](./ch10-kubeshop-deploy/01-namespaces.md)
  - [10.2 Deploying Backend Services](./ch10-kubeshop-deploy/02-backend-deploy.md)
  - [10.3 Deploying Frontend and Ingress](./ch10-kubeshop-deploy/03-frontend-ingress.md)
  - [10.4 Deploying Stateful Services (Databases)](./ch10-kubeshop-deploy/04-stateful-deploy.md)
  - [10.5 Lab: End-to-End Deployment and Smoke Testing](./ch10-kubeshop-deploy/05-lab-full-deploy.md)

- [Chapter 11: Health Checks and Self-Healing](./ch11-health/README.md)
  - [11.1 Liveness, Readiness, and Startup Probes](./ch11-health/01-probes.md)
  - [11.2 Designing Effective Health Endpoints](./ch11-health/02-health-endpoints.md)
  - [11.3 Lab: Chaos Engineering — Kill, Corrupt, and Watch K8s Heal](./ch11-health/03-lab-chaos.md)

---

# Part IV: Production Readiness

- [Chapter 12: Helm — Package Management](./ch12-helm/README.md)
  - [12.1 Why Helm? The Problem with Raw YAML](./ch12-helm/01-why-helm.md)
  - [12.2 Charts, Values, Templates, and Releases](./ch12-helm/02-chart-anatomy.md)
  - [12.3 Creating a Helm Chart for KubeShop](./ch12-helm/03-creating-charts.md)
  - [12.4 Helm Hooks, Dependencies, and Subcharts](./ch12-helm/04-advanced-helm.md)
  - [12.5 Lab: Helm-ify KubeShop](./ch12-helm/05-lab-helm.md)

- [Chapter 13: Scheduling and Resource Management](./ch13-scheduling/README.md)
  - [13.1 The Kubernetes Scheduler](./ch13-scheduling/01-scheduler.md)
  - [13.2 Node Affinity, Taints, and Tolerations](./ch13-scheduling/02-affinity-taints.md)
  - [13.3 Pod Priority and Preemption](./ch13-scheduling/03-priority.md)
  - [13.4 Horizontal Pod Autoscaler (HPA)](./ch13-scheduling/04-hpa.md)
  - [13.5 Lab: Autoscaling Under Load](./ch13-scheduling/05-lab-autoscaling.md)

- [Chapter 14: Security Fundamentals](./ch14-security/README.md)
  - [14.1 RBAC — Role-Based Access Control](./ch14-security/01-rbac.md)
  - [14.2 Service Accounts and Token Management](./ch14-security/02-service-accounts.md)
  - [14.3 Network Policies — Microsegmentation](./ch14-security/03-network-policies.md)
  - [14.4 Pod Security Standards and Admission](./ch14-security/04-pod-security.md)
  - [14.5 Lab: Lock Down KubeShop](./ch14-security/05-lab-security.md)

- [Chapter 15: Observability](./ch15-observability/README.md)
  - [15.1 Logging — kubectl logs, Stern, and Log Aggregation](./ch15-observability/01-logging.md)
  - [15.2 Metrics — Metrics Server and Prometheus](./ch15-observability/02-metrics.md)
  - [15.3 Dashboards with Grafana](./ch15-observability/03-grafana.md)
  - [15.4 Lab: Full Observability Stack on Minikube](./ch15-observability/04-lab-observability.md)

---

# Part V: CI/CD & Cloud

- [Chapter 16: CI/CD with GitHub Actions](./ch16-cicd-github/README.md)
  - [16.1 Container Image CI Pipeline](./ch16-cicd-github/01-image-ci.md)
  - [16.2 Kubernetes Manifest Validation](./ch16-cicd-github/02-manifest-validation.md)
  - [16.3 GitOps Principles and ArgoCD Introduction](./ch16-cicd-github/03-gitops-argocd.md)
  - [16.4 Lab: Full CI/CD Pipeline](./ch16-cicd-github/04-lab-cicd.md)

- [Chapter 17: Azure Kubernetes Service (AKS)](./ch17-aks/README.md)
  - [17.1 AKS vs Minikube — What Changes](./ch17-aks/01-aks-vs-minikube.md)
  - [17.2 Provisioning AKS with Azure CLI](./ch17-aks/02-provisioning.md)
  - [17.3 Azure Container Registry (ACR)](./ch17-aks/03-acr.md)
  - [17.4 Azure DevOps Pipelines for K8s](./ch17-aks/04-azure-devops.md)
  - [17.5 Lab: Deploy KubeShop to AKS](./ch17-aks/05-lab-aks-deploy.md)

---

# Part VI: Bonus — Internals & Troubleshooting

- [Chapter 18: Kubernetes Internals](./ch18-internals/README.md)
  - [18.1 How a Pod Gets Created — The Full Journey](./ch18-internals/01-pod-creation-journey.md)
  - [18.2 etcd — The Cluster Brain](./ch18-internals/02-etcd.md)
  - [18.3 Container Runtimes and the CRI](./ch18-internals/03-container-runtimes.md)
  - [18.4 CNI — Container Network Interface](./ch18-internals/04-cni.md)
  - [18.5 CSI — Container Storage Interface](./ch18-internals/05-csi.md)

- [Chapter 19: Troubleshooting Playbook](./ch19-troubleshooting/README.md)
  - [19.1 The Debugging Mental Model](./ch19-troubleshooting/01-mental-model.md)
  - [19.2 Pod Failures — CrashLoopBackOff, ImagePullBackOff, OOMKilled](./ch19-troubleshooting/02-pod-failures.md)
  - [19.3 Networking Failures — DNS, Services, Connectivity](./ch19-troubleshooting/03-network-failures.md)
  - [19.4 Storage and Permission Issues](./ch19-troubleshooting/04-storage-issues.md)
  - [19.5 The Troubleshooting Cheat Sheet](./ch19-troubleshooting/05-cheat-sheet.md)

---

[Appendix A: YAML Crash Course](./appendix-a-yaml.md)
[Appendix B: kubectl Cheat Sheet](./appendix-b-kubectl-cheatsheet.md)
[Appendix C: Common K8s Error Reference](./appendix-c-error-reference.md)
[Appendix D: Resource Manifests Reference](./appendix-d-manifests.md)
