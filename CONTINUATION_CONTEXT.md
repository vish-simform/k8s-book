# Kubernetes Book — Project State & Context Checkpoint

**Date:** 2026-07-28 (Ch13 completed)  
**Project Path:** `/home/vishvam.moliya@simform.dom/tasks/k8s/k8s-book`  
**Target Output:** mdBook build (`book/`)

---

## 📌 Executive Summary

The book **"Kubernetes: From Zero to Production"** is being written as an mdBook.  
Chapters **1 through 16** are **100% written, verified, and cleanly building** with `mdbook build`.

The repository structure and `SUMMARY.md` have been fully reconciled and cleaned up. All orphan files, duplicate stubs, and legacy drift have been resolved.

---

## 📊 Complete Book Progress Tracker

| Chapter | Topic | Status | Path |
|---|---|---|---|
| **Intro** | Introduction | ✅ Complete | `src/introduction.md` |
| **Ch 1** | The Container Orchestration Problem | ✅ Complete | `src/ch01-why-kubernetes/` |
| **Ch 2** | `kubectl` — Your Swiss Army Knife | ✅ Complete | `src/ch02-kubectl/` |
| **Ch 3** | Pods — The Atomic Unit | ✅ Complete | `src/ch03-pods/` |
| **Ch 4** | Workload Controllers (Deployments, StatefulSets, Jobs) | ✅ Complete | `src/ch04-workloads/` |
| **Ch 5** | Services — Exposing Your Applications | ✅ Complete | `src/ch05-services/` |
| **Ch 6** | Ingress — HTTP Routing | ✅ Complete | `src/ch06-ingress/` |
| **Ch 7** | ConfigMaps and Secrets | ✅ Complete | `src/ch07-configuration/` |
| **Ch 8** | Storage — Persistent Data in K8s | ✅ Complete | `src/ch08-storage/` |
| **Ch 9** | Namespaces, RBAC, and Multi-Tenancy | ✅ Complete | `src/ch09-rbac/` |
| **Ch 10** | Health Checks and Graceful Shutdown | ✅ Complete | `src/ch10-health/` |
| **Ch 11** | Resource Management and Autoscaling | ✅ Complete | `src/ch11-resources/` |
| **Ch 12** | Helm — Package Management | ✅ Complete | `src/ch12-helm/` |
| **Ch 13** | Observability — Logging, Metrics, and Tracing | ✅ Complete | `src/ch13-observability/` |
| **Ch 14** | Scheduling and Placement | ✅ Complete | `src/ch14-scheduling/` |
| **Ch 15** | Security Hardening | ✅ Complete | `src/ch15-security/` |
| **Ch 16** | CI/CD and GitOps | ✅ Complete | `src/ch16-cicd/` |
| **Ch 17** | Kubernetes Internals | ⏳ **NEXT STEP** | `src/ch17-internals/` (stubs ready) |
| **Ch 18** | Troubleshooting Playbook | 🔜 Queued | `src/ch18-troubleshooting/` (stubs ready) |
| **Apps A-D**| Appendices (YAML, kubectl, Error ref, Manifests) | 🔜 Queued | `src/appendix-*.md` |

---

## 🛠️ Chapter Content Structure Guidelines

When generating new chapters (e.g., Chapter 13 onwards), strictly follow these rules:

1. **Chapter Structure:**
   - `README.md`: Chapter introduction, timing, prerequisites, section table.
   - `01-*.md` through `05-*.md`: Concept sections with clear focus.
   - Final `0X-lab-*.md`: Hands-on lab with copy-pasteable commands, clear expected output, and a "Break It!" challenge.

2. **Pedagogical Principles:**
   - **Fast-paced, visual, scannable:** TL;DR at top, comparison tables, Mermaid diagrams.
   - **Real commands:** Use runnable bash/kubectl commands suitable for Minikube.
   - **Interactive Quick Checks:** End conceptual sections with a `✅ Quick Check` containing 2-3 collapsible questions (`<details><summary>...`).
   - **No Tag Conflicts:** Do NOT place unescaped HTML tags (like `<pending>` or `<none>`) inside text without escaping or placing in code blocks, to avoid mdBook parser warnings.

3. **Build Command:**
   - Always verify build using: `cd /home/vishvam.moliya@simform.dom/tasks/k8s/k8s-book && ~/.cargo/bin/mdbook build`

---

## 🚀 Immediate Next Action for the New Chat

Prompt to use in the new chat:

> "I am continuing work on the Kubernetes mdBook project. Read `CONTINUATION_CONTEXT.md` in `/home/vishvam.moliya@simform.dom/tasks/k8s/k8s-book` and continue with **Chapter 17: Kubernetes Internals**."
