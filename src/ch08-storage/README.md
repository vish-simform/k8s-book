# Chapter 8: Persistent Storage — Volumes, PVs, and PVCs

⏱️ **Total chapter time: ~55 min** (25 min reading + 30 min lab)

> **After this chapter, you will be able to:** Mount persistent storage to pods, understand the PV/PVC/StorageClass model, use dynamic provisioning on Minikube, and design stateful workloads that survive pod restarts.

## What's Inside

| Section | Topic | Time |
|---------|-------|------|
| 8.1 | The Storage Problem and Volume Types | ~5 min |
| 8.2 | PersistentVolumes and PersistentVolumeClaims | ~7 min |
| 8.3 | StorageClasses and Dynamic Provisioning | ~6 min |
| 8.4 | Access Modes and Reclaim Policies | ~5 min |
| 8.5 | 🔬 Lab: Stateful App with Persistent Storage | ~30 min |

## Prerequisites

- Completed Chapters 3 and 4 (Pods and Workloads)
- `minikube status` shows `Running`
