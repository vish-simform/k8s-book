# Chapter 17: Kubernetes Internals

⏱️ **Total chapter time: ~70 min** (45 min reading + 25 min lab)

> **After this chapter, you will be able to:** Explain exactly what happens inside Kubernetes when you run `kubectl apply`, understand how etcd, the CRI, CNI, and CSI fit together, and read cluster events with a mental model of the full control-plane lifecycle.

---

## What's Inside

| Section | Topic | Time |
|---|---|---|
| 17.1 | [How a Pod Gets Created — The Full Journey](./01-pod-creation-journey.md) | ~15 min |
| 17.2 | [etcd — The Cluster Brain](./02-etcd.md) | ~8 min |
| 17.3 | [Container Runtimes and the CRI](./03-container-runtimes.md) | ~8 min |
| 17.4 | [CNI — Container Network Interface](./04-cni.md) | ~8 min |
| 17.5 | [CSI — Container Storage Interface](./05-csi.md) | ~6 min |
| 17.6 | [Lab: Tracing a Pod's Journey Through the Cluster](./06-lab.md) | ~25 min |

## Prerequisites

- Completed Chapters 1–16
- Minikube cluster running (`minikube status`)
- Familiarity with the control-plane components from Chapter 1.3

---

## Why Internals Matter

You've been telling Kubernetes what to do for 16 chapters. Now we look at *how* it actually does it.

This isn't academic. Understanding internals helps you:
- **Debug faster** — you know which component to blame when something breaks
- **Trust the system** — you'll stop worrying "but what if K8s drops my request?"
- **Design better** — you know the costs and constraints of certain patterns

> 📝 **Note:** This chapter is observation-heavy. We won't deploy apps — we'll watch the machinery run.
