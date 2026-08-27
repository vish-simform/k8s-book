# Chapter 13: Observability — Logging, Metrics, and Tracing

⏱️ **Total chapter time: ~60 min** (30 min reading + 30 min lab)

> **After this chapter, you will be able to:** Use `kubectl logs` and Stern to stream multi-pod logs, deploy the Prometheus + Grafana stack via Helm, query metrics with PromQL, build dashboards, and instrument your own app for observability.

## What's Inside

| Section | Topic | Time |
|---------|-------|------|
| 13.1 | The Three Pillars of Observability | ~5 min |
| 13.2 | Logging — kubectl logs, Stern, and Aggregation | ~7 min |
| 13.3 | Metrics — Prometheus and metrics-server | ~8 min |
| 13.4 | Dashboards with Grafana | ~6 min |
| 13.5 | 🔬 Lab: Full Observability Stack on Minikube | ~30 min |

## Prerequisites

- Completed Chapters 1–12 (all core concepts + Helm)
- `helm` CLI installed (`helm version` to verify)
- `minikube status` shows `Running`
- Minikube with at least **4 GB RAM** allocated (`minikube config set memory 4096`)
