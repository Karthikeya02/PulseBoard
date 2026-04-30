import fs from "fs/promises";
import path from "path";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const sqlitePath = process.env.SQLITE_PATH || "./data/pulseboard.db";

let db = null;

export async function initDb() {
  const dir = path.dirname(sqlitePath);
  await fs.mkdir(dir, { recursive: true });

  db = await open({
    filename: sqlitePath,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS log_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_log_events_service_ts
      ON log_events(service_name, timestamp);

    CREATE INDEX IF NOT EXISTS idx_log_events_level
      ON log_events(level);

    CREATE TABLE IF NOT EXISTS anomalies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      z_score REAL NOT NULL,
      cpu REAL NOT NULL,
      memory REAL NOT NULL,
      summary TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_anomalies_service_ts
      ON anomalies(service_name, timestamp);
  `);
}

export async function insertLogEvents(serviceName, events) {
  if (!db || events.length === 0) {
    return;
  }

  const stmt = await db.prepare(
    "INSERT INTO log_events (service_name, level, message, timestamp) VALUES (?, ?, ?, ?)"
  );

  try {
    for (const event of events) {
      await stmt.run(serviceName, event.level, event.message, event.timestamp);
    }
  } finally {
    await stmt.finalize();
  }
}

export async function getLogs(serviceName, level, limit) {
  if (!db) {
    return [];
  }

  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 1000)) : 200;

  if (level) {
    return db.all(
      "SELECT service_name, level, message, timestamp FROM log_events WHERE service_name = ? AND level = ? ORDER BY timestamp DESC LIMIT ?",
      serviceName,
      level,
      normalizedLimit
    );
  }

  return db.all(
    "SELECT service_name, level, message, timestamp FROM log_events WHERE service_name = ? ORDER BY timestamp DESC LIMIT ?",
    serviceName,
    normalizedLimit
  );
}

export async function getRecentLogLines(serviceName, limit) {
  if (!db) {
    return [];
  }

  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : 10;
  const rows = await db.all(
    "SELECT level, message FROM log_events WHERE service_name = ? ORDER BY timestamp DESC LIMIT ?",
    serviceName,
    normalizedLimit
  );

  return rows.reverse().map((row) => `${row.level} ${row.message}`);
}

export async function insertAnomaly(anomaly) {
  if (!db) {
    return;
  }

  await db.run(
    "INSERT INTO anomalies (service_name, z_score, cpu, memory, summary, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
    anomaly.service_name,
    anomaly.z_score,
    anomaly.cpu,
    anomaly.memory,
    anomaly.summary,
    anomaly.timestamp
  );
}

export async function getAnomalies(serviceName, limit) {
  if (!db) {
    return [];
  }

  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 1000)) : 100;

  if (serviceName) {
    return db.all(
      "SELECT service_name, z_score, cpu, memory, summary, timestamp FROM anomalies WHERE service_name = ? ORDER BY timestamp DESC LIMIT ?",
      serviceName,
      normalizedLimit
    );
  }

  return db.all(
    "SELECT service_name, z_score, cpu, memory, summary, timestamp FROM anomalies ORDER BY timestamp DESC LIMIT ?",
    normalizedLimit
  );
}
