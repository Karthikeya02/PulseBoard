import fs from "fs/promises";
import os from "os";
import path from "path";

const args = parseArgs(process.argv.slice(2));
const config = await loadConfig(args.config);

const serviceName = args.service || config.service_name || process.env.SERVICE_NAME || "service";
const logPath = args.log || config.log_path || process.env.LOG_PATH || "./logs/service.log";
const ingestBase = args.ingest || config.ingest_url || process.env.INGEST_URL || "http://localhost:4000";
const chaosMode = parseBoolean(args.chaos ?? config.chaos_mode ?? process.env.CHAOS_MODE);

const ingestUrl = ingestBase.replace(/\/$/, "") + "/ingest";

let lastCpuSnapshot = snapshotCpu();
let latestMetrics = { cpu: 0, memory: 0 };
let lastReadPos = 0;
let partialLine = "";
let logBuffer = [];
let chaosInject = false;

console.log("PulseBoard agent starting", {
  serviceName,
  logPath,
  ingestUrl,
  chaosMode
});

setInterval(async () => {
  lastCpuSnapshot = updateMetrics(lastCpuSnapshot);
  const newLines = await readNewLines(logPath);
  if (newLines.length > 0) {
    logBuffer.push(...newLines);
  }
}, 5000);

setInterval(async () => {
  const payload = buildPayload();
  await sendPayload(payload);
}, 10000);

if (chaosMode) {
  setInterval(() => {
    if (Math.random() < 0.7) {
      chaosInject = true;
    }
  }, 30000);
}

function updateMetrics(previousSnapshot) {
  const nextSnapshot = snapshotCpu();
  const cpu = computeCpuPercent(previousSnapshot, nextSnapshot);
  const memory = computeMemoryPercent();
  latestMetrics = { cpu, memory };
  return nextSnapshot;
}

function buildPayload() {
  const logLines = logBuffer.splice(0, logBuffer.length);
  let cpu = latestMetrics.cpu;
  const memory = latestMetrics.memory;

  if (chaosMode && chaosInject) {
    chaosInject = false;
    const spike = 30 + Math.random() * 50;
    cpu = Math.min(100, cpu + spike);

    logLines.push(`ERROR simulated failure in ${serviceName} processing loop`);
    logLines.push(`WARN ${serviceName} retrying request after timeout`);
  }

  return {
    service_name: serviceName,
    timestamp: Date.now(),
    log_lines: logLines,
    metrics: { cpu, memory }
  };
}

async function sendPayload(payload) {
  try {
    const response = await fetch(ingestUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error("Ingest failed", response.status);
      logBuffer.unshift(...payload.log_lines);
    }
  } catch (error) {
    console.error("Ingest error", error.message);
    logBuffer.unshift(...payload.log_lines);
  }
}

function snapshotCpu() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }

  return { idle, total };
}

function computeCpuPercent(prev, next) {
  const idleDiff = next.idle - prev.idle;
  const totalDiff = next.total - prev.total;

  if (totalDiff <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100));
}

function computeMemoryPercent() {
  const total = os.totalmem();
  const free = os.freemem();
  if (total === 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (1 - free / total) * 100));
}

async function readNewLines(filePath) {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size < lastReadPos) {
      lastReadPos = 0;
    }

    if (stats.size === lastReadPos) {
      return [];
    }

    const handle = await fs.open(filePath, "r");
    const length = stats.size - lastReadPos;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, lastReadPos);
    await handle.close();

    lastReadPos = stats.size;
    const text = buffer.toString("utf8");
    const lines = (partialLine + text).split(/\r?\n/);
    partialLine = lines.pop() || "";
    return lines.filter((line) => line.trim().length > 0);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    console.error("Log read error", error.message);
    return [];
  }
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      result.config = argv[i + 1];
      i += 1;
    } else if (arg === "--service") {
      result.service = argv[i + 1];
      i += 1;
    } else if (arg === "--log") {
      result.log = argv[i + 1];
      i += 1;
    } else if (arg === "--ingest") {
      result.ingest = argv[i + 1];
      i += 1;
    } else if (arg === "--chaos") {
      result.chaos = "true";
    }
  }

  return result;
}

async function loadConfig(configPath) {
  if (!configPath) {
    return {};
  }

  const resolved = path.resolve(configPath);
  const data = await fs.readFile(resolved, "utf8");
  return JSON.parse(data);
}

function parseBoolean(value) {
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  return false;
}
