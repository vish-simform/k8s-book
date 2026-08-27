# Chapter 11: Resource Management — Requests, Limits, and Autoscaling

⏱️ **Total chapter time: ~55 min** (25 min reading + 30 min lab)

> **After this chapter, you will be able to:** Set CPU and memory requests/limits correctly, understand QoS classes, configure HPA to auto-scale on CPU/memory, and avoid the most common resource management mistakes that cause production outages.

## What's Inside

| Section | Topic | Time |
|---------|-------|------|
| 11.1 | Requests and Limits — The Fundamentals | ~6 min |
| 11.2 | QoS Classes and Pod Eviction | ~5 min |
| 11.3 | Horizontal Pod Autoscaler (HPA) | ~7 min |
| 11.4 | Vertical Pod Autoscaler (VPA) | ~4 min |
| 11.5 | Cluster Autoscaler | ~3 min |
| 11.6 | 🔬 Lab: Resource Limits and HPA in Action | ~30 min |

## Prerequisites

- Completed Chapter 4 (Deployments) and Chapter 9 (Namespaces/RBAC)
- `minikube status` shows `Running`
