import { InfluxDB, Point } from "@influxdata/influxdb-client";

const influxUrl = process.env.INFLUX_URL || "http://localhost:8086";
const token = process.env.INFLUX_TOKEN || "pulseboard-token";
const org = process.env.INFLUX_ORG || "pulseboard";
const bucket = process.env.INFLUX_BUCKET || "pulseboard";

const influxDB = new InfluxDB({ url: influxUrl, token });
const writeApi = influxDB.getWriteApi(org, bucket, "ms");
writeApi.useDefaultTags({ app: "pulseboard" });

let warnedWriteFailure = false;

// Best-effort: ingest (and the live WS feed) must keep working when InfluxDB
// is down, e.g. local dev without Docker. History queries will just be empty.
export async function writeMetrics(serviceName, cpu, memory, timestampMs) {
  const point = new Point(serviceName)
    .floatField("cpu", cpu)
    .floatField("memory", memory)
    .timestamp(new Date(timestampMs));

  writeApi.writePoint(point);
  try {
    await writeApi.flush();
    warnedWriteFailure = false;
  } catch (error) {
    if (!warnedWriteFailure) {
      warnedWriteFailure = true;
      console.warn("InfluxDB write failed; metrics not persisted:", error.message);
    }
  }
}

export async function queryMetrics(serviceName, minutes) {
  const queryApi = influxDB.getQueryApi(org);
  const windowMinutes = Number.isFinite(minutes) ? Math.max(1, Math.min(minutes, 120)) : 10;

  const flux = `
    from(bucket: "${bucket}")
      |> range(start: -${windowMinutes}m)
      |> filter(fn: (r) => r._measurement == "${serviceName}")
      |> filter(fn: (r) => r._field == "cpu" or r._field == "memory")
      |> sort(columns: ["_time"])
  `;

  const rows = await queryApi.collectRows(flux);
  const byTime = new Map();

  for (const row of rows) {
    const time = row._time;
    const entry = byTime.get(time) || { timestamp: time, cpu: null, memory: null };
    entry[row._field] = row._value;
    byTime.set(time, entry);
  }

  return Array.from(byTime.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}
