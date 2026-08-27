# Chapter 10: Health Checks — Probes and Graceful Shutdown

⏱️ **Total chapter time: ~50 min** (22 min reading + 28 min lab)

> **After this chapter, you will be able to:** Configure liveness, readiness, and startup probes so Kubernetes knows when your app is healthy, and implement graceful shutdown so pods drain cleanly without dropping requests.

## What's Inside

| Section | Topic | Time |
|---------|-------|------|
| 10.1 | Why Probes Exist — The Problem They Solve | ~4 min |
| 10.2 | Liveness Probes — Restart the Stuck | ~6 min |
| 10.3 | Readiness Probes — Control Traffic | ~5 min |
| 10.4 | Startup Probes — Slow-Starting Apps | ~4 min |
| 10.5 | Graceful Shutdown and `preStop` Hooks | ~5 min |
| 10.6 | 🔬 Lab: Probes and Shutdown Drills | ~28 min |

## Prerequisites

- Completed Chapter 3 (Pods) and Chapter 4 (Deployments)
- `minikube status` shows `Running`
