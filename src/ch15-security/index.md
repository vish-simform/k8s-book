# Chapter 15: Security Hardening

⏱️ **Total chapter time: ~60 min** (30 min reading + 30 min lab)

> **After this chapter, you will be able to:** Enforce Pod Security Standards on namespaces, write Network Policies to microsegment traffic, handle Secrets securely with encryption-at-rest and external vault integration, scan container images for CVEs, and apply a defence-in-depth checklist to a production namespace.

## What's Inside

| Section | Topic | Time |
|---------|-------|------|
| 15.1 | Pod Security Standards and Admission | ~8 min |
| 15.2 | Network Policies — Microsegmentation | ~8 min |
| 15.3 | Secrets Management — Encryption and External Vaults | ~7 min |
| 15.4 | Image Security — Scanning and Supply Chain | ~6 min |
| 15.5 | 🔬 Lab: Harden a Namespace End-to-End | ~30 min |

## Prerequisites

- Completed Chapters 1–14
- `minikube status` shows `Running`
- Minikube started with the `--cni=calico` flag for Network Policy support:
  `minikube start --cni=calico` (or `minikube start --network-plugin=cni --cni=calico`)
