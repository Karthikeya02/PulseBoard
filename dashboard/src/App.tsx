import { useEffect, useMemo, useState } from "react";
import { parseServerEvent } from "./types";
import type { Anomaly, LogLine, ServerEvent, ServiceState, ServiceStatus } from "./types";
import ServiceCard from "./components/ServiceCard";
import LogFeed from "./components/LogFeed";
import AnomalyTable from "./components/AnomalyTable";

const SERVICES = ["auth-service", "order-service", "payment-service"];
const MAX_LOGS = 240;
const MAX_ANOMALIES = 120;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [services, setServices] = useState<Record<string, ServiceState>>(() => initServices());
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);

  const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:4000";

  useEffect(() => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event: MessageEvent<string>) => {
      const payload = parseServerEvent(event.data);
      if (payload) {
        handleEvent(payload);
      } else {
        console.error("Unrecognized WS message", event.data);
      }
    };

    return () => ws.close();
  }, [wsUrl]);

  function handleEvent(payload: ServerEvent): void {
    switch (payload.type) {
      case "hello":
        break;

      case "metrics": {
        const data = payload.data;
        setServices((prev) => {
          const current = prev[data.service_name] || defaultService(data.service_name);
          return {
            ...prev,
            [data.service_name]: {
              ...current,
              cpu: data.cpu,
              memory: data.memory,
              lastSeenAt: data.timestamp
            }
          };
        });
        break;
      }

      case "log_batch": {
        const incoming: LogLine[] = payload.data.map((entry) => ({
          ...entry,
          id: `${entry.service_name}-${entry.timestamp}-${Math.random()}`
        }));
        setLogs((prev) => [...prev, ...incoming].slice(-MAX_LOGS));
        break;
      }

      case "anomaly": {
        const anomaly = payload.data;
        setAnomalies((prev) => [anomaly, ...prev].slice(0, MAX_ANOMALIES));
        setServices((prev) => {
          const current = prev[anomaly.service_name] || defaultService(anomaly.service_name);
          return {
            ...prev,
            [anomaly.service_name]: {
              ...current,
              lastAnomalyAt: anomaly.timestamp
            }
          };
        });
        break;
      }
    }
  }

  const cards = useMemo(() => {
    const now = Date.now();
    return SERVICES.map((name) => {
      const service = services[name] || defaultService(name);
      return { service, status: getStatus(service.lastAnomalyAt, now) };
    });
  }, [services]);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Real-time microservices observability</p>
          <h1>PulseBoard</h1>
          <p className="subtitle">Live metrics, logs, and AI-driven root-cause hints.</p>
        </div>
        <div className={`connection ${connected ? "online" : "offline"}`}>
          {connected ? "Live feed" : "Offline"}
        </div>
      </header>

      <section className="cards">
        {cards.map(({ service, status }) => (
          <ServiceCard key={service.name} service={service} status={status} />
        ))}
      </section>

      <LogFeed logs={logs} />
      <AnomalyTable anomalies={anomalies} />
    </div>
  );
}

function initServices(): Record<string, ServiceState> {
  return SERVICES.reduce<Record<string, ServiceState>>((acc, name) => {
    acc[name] = defaultService(name);
    return acc;
  }, {});
}

function defaultService(name: string): ServiceState {
  return {
    name,
    cpu: null,
    memory: null,
    lastSeenAt: null,
    lastAnomalyAt: null
  };
}

function getStatus(lastAnomalyAt: number | null, now: number): ServiceStatus {
  if (!lastAnomalyAt) {
    return "ok";
  }

  const age = now - lastAnomalyAt;
  if (age < 60 * 1000) {
    return "critical";
  }

  if (age < 5 * 60 * 1000) {
    return "warning";
  }

  return "ok";
}
