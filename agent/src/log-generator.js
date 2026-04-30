import fs from "fs/promises";
import path from "path";

const logDir = process.env.LOG_DIR || "./logs";
const services = (process.env.LOG_SERVICES || "auth-service,order-service,payment-service")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const intervalMs = Number.parseInt(process.env.LOG_INTERVAL_MS || "2000", 10);

const messages = {
  INFO: [
    "request completed",
    "cache hit",
    "health check ok",
    "auth token validated",
    "order queued"
  ],
  WARN: [
    "retrying downstream request",
    "slow response from dependency",
    "elevated latency detected",
    "queue depth rising"
  ],
  ERROR: [
    "timeout talking to upstream",
    "failed to persist transaction",
    "unexpected nil reference",
    "rate limit exceeded"
  ]
};

await fs.mkdir(logDir, { recursive: true });

console.log("PulseBoard log generator starting", {
  logDir,
  services,
  intervalMs
});

setInterval(() => {
  const timestamp = new Date().toISOString();

  for (const service of services) {
    const level = pickLevel();
    const message = pickMessage(level);
    const line = `${level} ${timestamp} ${service} ${message}\n`;
    const filePath = path.join(logDir, `${service}.log`);

    fs.appendFile(filePath, line).catch((error) => {
      console.error("Log write failed", error.message);
    });
  }
}, Math.max(500, intervalMs));

function pickLevel() {
  const roll = Math.random();
  if (roll < 0.1) {
    return "ERROR";
  }
  if (roll < 0.3) {
    return "WARN";
  }
  return "INFO";
}

function pickMessage(level) {
  const options = messages[level] || messages.INFO;
  const index = Math.floor(Math.random() * options.length);
  return options[index];
}
