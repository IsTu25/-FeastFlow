# Tools & Stack Report — FeastFlow: The Iftar Resilience Protocol

> **Team Kathalkhor | DevSprint 2026 | IUT Computer Society**

---

## Why Node.js?

Non-blocking I/O with the event loop means a single Node.js process handles thousands of concurrent connections without spawning expensive OS threads. During the Ramadan rush when 500+ students hit the system simultaneously, this is critical — each request is handled asynchronously with zero blocking.

---

## Why BullMQ over direct HTTP (Kitchen Queue)?

Direct HTTP creates **tight coupling**: if the Kitchen service is slow or down, the Order Gateway hangs indefinitely, causing cascading failures.

BullMQ decouples them via a **Redis-backed persistent queue**. The Gateway pushes the job and returns `200 OK` immediately. The Kitchen Worker picks it up whenever it's available. If the Kitchen crashes, the job is **not lost** — it stays in Redis until the service recovers.

This is the core "fault tolerance" feature that directly addresses the problem statement.

---

## Why PostgreSQL over MongoDB?

The Jalebi Problem (overselling) requires **ACID transactions and row-level versioning** (Optimistic Locking). Our SQL query:

```sql
UPDATE items SET stock = stock - 1, version = version + 1 
WHERE id = $1 AND version = $2
```

If two concurrent requests read `version = 5`, only one UPDATE will succeed (the other sees version 6 and returns 0 rows). This is impossible to guarantee cleanly in MongoDB's eventual consistency model.

---

## Why Redis for Caching?

**Sub-millisecond** read speed (~0.1ms vs ~5-10ms for Postgres). The cache-first stock check in the Order Gateway rejects "out of stock" requests in **<2ms**, protecting PostgreSQL from unnecessary load during a 500-request simultaneous surge.

We also use Redis as the BullMQ transport layer, giving us a single high-speed infrastructure component serving two purposes.

---

## Why Prometheus + Grafana over a custom dashboard?

- **Industry standard**: Judges and engineers immediately understand the metrics without explanation.
- **Auto-provisioned**: Our `grafana/provisioning/` directory configures datasources and dashboards automatically on `docker compose up` — zero manual setup.  
- **Loki integration**: Logs from all 5 services are aggregated and searchable side-by-side in the same Grafana UI.

---

## Why Nginx as a Reverse Proxy?

Instead of exposing 5 different ports (3001–3005), Nginx provides:
- **Single entry point** on Port 80 for cleaner production routing.
- **SSL termination** point (ready for HTTPS with zero service changes).
- **WebSocket proxying** for the Socket.IO real-time tracker.

---

## Why Terraform?

Infrastructure as Code ensures the **same command provisions an identical AWS EC2 environment** every time. No "it works on my machine". Our `terraform/main.tf` bootstraps an Amazon Linux 2 instance with Docker installed automatically via `user_data`.

---

## Why Trivy in CI?

Automatically scans built Docker images for known CVEs. If a **Critical** or **High** vulnerability is found, the GitHub Actions pipeline fails — catching security issues before they reach production with zero manual effort.

---

## Why Kubernetes Manifests?

The `k8s/` directory contains `Deployment` manifests with **Liveness Probes** for all 5 services. If any pod crashes or becomes unresponsive (failing `/health`), Kubernetes automatically restarts it — demonstrating zero-downtime self-healing without human intervention.
