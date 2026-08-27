# Chapter 16: CI/CD and GitOps

⏱️ **Total chapter time: ~60 min** (30 min reading + 30 min lab)

> **After this chapter, you will be able to:** Explain the GitOps model and why it outperforms push-based CD for Kubernetes, build a CI pipeline that builds, scans, and pushes images, validate manifests with kubeval/kyverno in CI, and deploy ArgoCD to manage continuous delivery declaratively.

## What's Inside

| Section | Topic | Time |
|---------|-------|------|
| 16.1 | GitOps Principles — Git as the Source of Truth | ~6 min |
| 16.2 | Container Image CI Pipeline | ~8 min |
| 16.3 | Kubernetes Manifest Validation in CI | ~6 min |
| 16.4 | ArgoCD — Declarative CD for Kubernetes | ~8 min |
| 16.5 | 🔬 Lab: Full GitOps Pipeline | ~30 min |

## Prerequisites

- Completed Chapters 1–15
- `minikube status` shows `Running`
- `helm version` works
- A GitHub account (for the CI pipeline examples)
