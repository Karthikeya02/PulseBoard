import "dotenv/config";
import express from "express";
import cors from "cors";
import { initDb, insertLogEvents, getLogs, getRecentLogLines, insertAnomaly, getAnomalies } from "./db.js";
import { writeMetrics, queryMetrics } from "./influx.js";
import { updateCpuBuffer, computeZScore } from "./anomaly.js";
import { summarizeRootCause } from "./llm.js";
import { createWebSocketServer, broadcast } from "./ws.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = Number.parseInt(process.env.PORT || "4000", 10);

await initDb();

const server = app.listen(PORT, () => {
  console.log(`Ingestion API listening on :${PORT}`);
});
createWebSocketServer(server);

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/ingest", async (req, res) => {
  try {
    const validation = validateIngest(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }

    const { serviceName, timestampMs, logLines, metrics } = validation.data;

    const logEvents = normalizeLogLines(logLines, timestampMs);
    await insertLogEvents(serviceName, logEvents);

    await writeMetrics(serviceName, metrics.cpu, metrics.memory, timestampMs);

    const buffer = updateCpuBuffer(serviceName, metrics.cpu, timestampMs);
    const { z } = computeZScore(buffer);

    broadcast({
      type: "metrics",
      data: {
        service_name: serviceName,
        cpu: metrics.cpu,
        memory: metrics.memory,
        timestamp: timestampMs
      }
    });

    if (logEvents.length > 0) {
      broadcast({
        type: "log_batch",
        data: logEvents.map((event) => ({
          service_name: serviceName,
          ...event
        }))
      });
    }

    let anomaly = null;
    if (Number.isFinite(z) && Math.abs(z) > 2.5) {
      const recentLogLines = await getRecentLogLines(serviceName, 10);
      const summary = await summarizeRootCause({
        service: serviceName,
        cpu: metrics.cpu,
        memory: metrics.memory,
        zScore: z,
        logLines: recentLogLines
      });

      anomaly = {
        service_name: serviceName,
        z_score: z,
        cpu: metrics.cpu,
        memory: metrics.memory,
        summary,
        timestamp: timestampMs
      };

      await insertAnomaly(anomaly);
      broadcast({ type: "anomaly", data: anomaly });
    }

    return res.json({ ok: true, anomaly });
  } catch (error) {
    console.error("/ingest failed", error);
    return res.status(500).json({ error: "ingest_failed" });
  }
});

app.get("/metrics/:service", async (req, res) => {
  try {
    const service = String(req.params.service || "").trim();
    const minutes = Number.parseInt(req.query.minutes || "10", 10);
    const points = await queryMetrics(service, minutes);
    return res.json({ service, points });
  } catch (error) {
    console.error("/metrics failed", error);
    return res.status(500).json({ error: "metrics_failed" });
  }
});

app.get("/logs/:service", async (req, res) => {
  try {
    const service = String(req.params.service || "").trim();
    const level = req.query.level ? String(req.query.level).toUpperCase() : null;
    const limit = Number.parseInt(req.query.limit || "200", 10);
    const logs = await getLogs(service, level, limit);
    return res.json({ service, logs });
  } catch (error) {
    console.error("/logs failed", error);
    return res.status(500).json({ error: "logs_failed" });
  }
});

app.get("/anomalies", async (req, res) => {
  try {
    const service = req.query.service ? String(req.query.service).trim() : null;
    const limit = Number.parseInt(req.query.limit || "100", 10);
    const anomalies = await getAnomalies(service, limit);
    return res.json({ anomalies });
  } catch (error) {
    console.error("/anomalies failed", error);
    return res.status(500).json({ error: "anomalies_failed" });
  }
});

function validateIngest(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "invalid_body" };
  }

  const serviceName = String(body.service_name || "").trim();
  if (!serviceName) {
    return { ok: false, error: "missing_service_name" };
  }

  const metrics = body.metrics || {};
  const cpu = Number(metrics.cpu);
  const memory = Number(metrics.memory);
  if (!Number.isFinite(cpu) || !Number.isFinite(memory)) {
    return { ok: false, error: "invalid_metrics" };
  }

  const logLines = Array.isArray(body.log_lines) ? body.log_lines.map((line) => String(line)) : [];
  const timestampMs = parseTimestamp(body.timestamp);

  return {
    ok: true,
    data: {
      serviceName,
      timestampMs,
      logLines: logLines.slice(0, 500),
      metrics: { cpu, memory }
    }
  };
}

function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }

    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }
  }

  return Date.now();
}

function normalizeLogLines(logLines, timestampMs) {
  const events = [];

  for (const line of logLines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      continue;
    }

    const match = trimmed.match(/^(ERROR|WARN|INFO)\b[:\-\s]*(.*)$/i);
    const level = match ? match[1].toUpperCase() : "INFO";
    const message = match ? match[2].trim() : trimmed;

    events.push({
      level,
      message,
      timestamp: timestampMs
    });
  }

  return events;
}
