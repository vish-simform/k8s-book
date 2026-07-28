# Chapter 14: Scheduling and Placement

⏱️ **Total chapter time: ~55 min** (25 min reading + 30 min lab)

> **After this chapter, you will be able to:** Explain how the Kubernetes scheduler selects nodes, pin pods to specific nodes with node selectors and affinity rules, repel pods from nodes using taints and tolerations, and co-locate or spread pods across failure domains with pod affinity and anti-affinity.

## What's Inside

| Section | Topic | Time |
|---------|-------|------|
| 14.1 | The Kubernetes Scheduler — How It Picks a Node | ~5 min |
| 14.2 | Node Affinity and Node Selectors | ~6 min |
| 14.3 | Taints and Tolerations | ~6 min |
| 14.4 | Pod Affinity and Anti-Affinity | ~6 min |
| 14.5 | 🔬 Lab: Control Where Pods Land | ~30 min |

## Prerequisites

- Completed Chapters 1–13
- `minikube status` shows `Running`
- Multi-node Minikube recommended: `minikube start --nodes=3` (single-node also works with labels)
