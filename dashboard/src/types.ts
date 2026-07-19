// Data contracts for the ingestion-api (ingestion-api/src/index.js).
// WebSocket events arrive on ws://localhost:4000; REST responses come from the
// same server over HTTP.

// The server normalizes every log line to one of these levels (normalizeLogLines).
export type LogLevel = "ERROR" | "WARN" | "INFO";

/** One metrics sample for a service. Timestamps are epoch milliseconds. */
export interface ServiceMetrics {
  service_name: string;
  cpu: number;
  memory: number;
  timestamp: number;
}

/** One normalized log line, as broadcast and as stored in sqlite. */
export interface LogEvent {
  service_name: string;
  level: LogLevel;
  message: string;
  timestamp: number;
}

/** A detected CPU anomaly with its LLM-generated root-cause summary. */
export interface Anomaly {
  service_name: string;
  z_score: number;
  cpu: number;
  memory: number;
  summary: string;
  timestamp: number;
}

// --- WebSocket events (discriminated on `type`) ---

export interface HelloEvent {
  type: "hello";
  message: string;
}

export interface MetricsEvent {
  type: "metrics";
  data: ServiceMetrics;
}

export interface LogBatchEvent {
  type: "log_batch";
  data: LogEvent[];
}

export interface AnomalyEvent {
  type: "anomaly";
  data: Anomaly;
}

export type ServerEvent = HelloEvent | MetricsEvent | LogBatchEvent | AnomalyEvent;

const EVENT_TYPES: ReadonlyArray<ServerEvent["type"]> = [
  "hello",
  "metrics",
  "log_batch",
  "anomaly"
];

/**
 * Parse a raw WebSocket frame into a ServerEvent, or null if it isn't one.
 * Only the discriminant is checked at runtime; the payload shape is trusted
 * to match the server contract above.
 */
export function parseServerEvent(raw: string): ServerEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const { type } = parsed as { type?: unknown };
  if (typeof type !== "string" || !EVENT_TYPES.includes(type as ServerEvent["type"])) {
    return null;
  }

  return parsed as ServerEvent;
}

// --- REST responses ---

/**
 * One aggregated point from GET /metrics/:service. Unlike WebSocket events,
 * `timestamp` is an ISO-8601 string (InfluxDB `_time`), and a field is null
 * when Influx returned no value for it at that instant.
 */
export interface MetricPoint {
  timestamp: string;
  cpu: number | null;
  memory: number | null;
}

/** GET /metrics/:service?minutes=n */
export interface MetricsResponse {
  service: string;
  points: MetricPoint[];
}

/** GET /logs/:service?level=&limit= (newest first) */
export interface LogsResponse {
  service: string;
  logs: LogEvent[];
}

/** GET /anomalies?service=&limit= (newest first) */
export interface AnomaliesResponse {
  anomalies: Anomaly[];
}

/** GET /health */
export interface HealthResponse {
  ok: boolean;
}

/** POST /ingest success body; `anomaly` is set when the sample tripped detection. */
export interface IngestResponse {
  ok: true;
  anomaly: Anomaly | null;
}

/** Any endpoint's error body (non-2xx). */
export interface ApiError {
  error: string;
}

// --- Dashboard view state ---

export type ServiceStatus = "ok" | "warning" | "critical";

/** Per-service state accumulated from the live feed; null until first data. */
export interface ServiceState {
  name: string;
  cpu: number | null;
  memory: number | null;
  lastSeenAt: number | null;
  lastAnomalyAt: number | null;
}

/** A log entry with a client-side key for React list rendering. */
export interface LogLine extends LogEvent {
  id: string;
}
