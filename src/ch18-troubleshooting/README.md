# Chapter 18: Troubleshooting Playbook

⏱️ **Total chapter time: ~60 min** (35 min reading + 25 min exercises)

> **After this chapter, you will be able to:** Systematically debug any broken pod, service, or storage issue in Kubernetes using a repeatable mental model and a concrete set of `kubectl` commands.

---

## What's Inside

| Section | Topic | Time |
|---|---|---|
| 18.1 | The Debugging Mental Model | ~8 min |
| 18.2 | Pod Failures — CrashLoopBackOff, ImagePullBackOff, OOMKilled | ~10 min |
| 18.3 | Networking Failures — DNS, Services, Connectivity | ~10 min |
| 18.4 | Storage and Permission Issues | ~7 min |
| 18.5 | The Troubleshooting Cheat Sheet | ~5 min |

## Prerequisites

- Completed Chapters 1–17 (especially Chapter 5 — Services and Chapter 8 — Storage)
- Minikube cluster running (`minikube status`)

---

## Why a "Playbook" and Not Just a List of Fixes

Kubernetes errors have patterns. The same `CrashLoopBackOff` might be caused by a bad environment variable, a missing Secret, a wrong command, or an OOM kill. 

A playbook gives you a **decision tree**, not a lookup table. You learn to narrow down the cause systematically rather than guessing and applying random fixes.

> 💡 **Tip:** The most important debugging skill in Kubernetes is reading `kubectl describe`. Most problems announce themselves in the Events section — you just have to know to look there.
