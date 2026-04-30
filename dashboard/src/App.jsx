import { useEffect, useMemo, useRef, useState } from "react";

const SERVICES = ["auth-service", "order-service", "payment-service"];
const MAX_LOGS = 240;
const MAX_ANOMALIES = 120;

export default function App() {
  const [connected, setConnected] = useState(false);
  const [services, setServices] = useState(() => initServices());
  const [logs, setLogs] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const logEndRef = useRef(null);

  const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:4000";

  useEffect(() => {
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleEvent(payload);
      } catch (error) {
        console.error("WS parse error", error);
      }
    };

    return () => ws.close();
  }, [wsUrl]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  function handleEvent(payload) {
    if (!payload || typeof payload !== "object") {
      return;
    }

    if (payload.type === "metrics") {
      const data = payload.data;
      if (!data) {
        return;
      }

      setServices((prev) => {
        const next = { ...prev };
        const current = next[data.service_name] || defaultService(data.service_name);
        next[data.service_name] = {
          ...current,
          cpu: data.cpu,
          memory: data.memory,
          lastSeenAt: data.timestamp || Date.now()
        };
        return next;
      });
    }

    if (payload.type === "log_batch" && Array.isArray(payload.data)) {
      const incoming = payload.data.map((entry) => ({
        id: `${entry.service_name}-${entry.timestamp}-${Math.random()}`,
        service_name: entry.service_name,
        level: entry.level || "INFO",
        message: entry.message || "",
        timestamp: entry.timestamp || Date.now()
      }));

      setLogs((prev) => {
        const next = [...prev, ...incoming];
        return next.slice(-MAX_LOGS);
      });
    }

    if (payload.type === "anomaly") {
      const anomaly = payload.data;
      if (!anomaly) {
        return;
      }

      setAnomalies((prev) => [anomaly, ...prev].slice(0, MAX_ANOMALIES));
      setServices((prev) => {
        const next = { ...prev };
        const current = next[anomaly.service_name] || defaultService(anomaly.service_name);
        next[anomaly.service_name] = {
          ...current,
          lastAnomalyAt: anomaly.timestamp || Date.now()
        };
        return next;
      });
    }
  }

  const cards = useMemo(() => {
    const now = Date.now();
    return SERVICES.map((name) => {
      const data = services[name] || defaultService(name);
      const status = getStatus(data.lastAnomalyAt, now);
      return { name, status, ...data };
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
        {cards.map((service) => (
          <article key={service.name} className={`card ${service.status}`}>
            <div className="card-head">
              <h2>{service.name}</h2>
              <span className={`status-dot ${service.status}`} />
            </div>
            <div className="stats">
              <div>
                <span className="stat-label">CPU</span>
                <span className="stat-value">{formatPercent(service.cpu)}</span>
              </div>
              <div>
                <span className="stat-label">Memory</span>
                <span className="stat-value">{formatPercent(service.memory)}</span>
              </div>
            </div>
            <p className="stat-foot">{statusText(service.status)}</p>
          </article>
        ))}
      </section>

      <section className="panel logs">
        <div className="panel-head">
          <h3>Live log feed</h3>
          <span className="panel-hint">Streaming from all services</span>
        </div>
        <div className="log-list">
          {logs.map((log) => (
            <div key={log.id} className={`log-line ${log.level.toLowerCase()}`}>
              <span className="log-time">{formatTime(log.timestamp)}</span>
              <span className="log-service">{log.service_name}</span>
              <span className="log-level">{log.level}</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </section>

      <section className="panel anomalies">
        <div className="panel-head">
          <h3>Anomaly history</h3>
          <span className="panel-hint">Latest AI summaries</span>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <div>Time</div>
            <div>Service</div>
            <div>CPU spike</div>
            <div>Summary</div>
          </div>
          <div className="table-body">
            {anomalies.map((anomaly) => (
              <div key={`${anomaly.service_name}-${anomaly.timestamp}`} className="table-row">
                <div>{formatTime(anomaly.timestamp)}</div>
                <div>{anomaly.service_name}</div>
                <div>{formatPercent(anomaly.cpu)}</div>
                <div className="summary">{anomaly.summary}</div>
              </div>
            ))}
            {anomalies.length === 0 && (
              <div className="table-empty">Waiting for anomalies...</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function initServices() {
  return SERVICES.reduce((acc, name) => {
    acc[name] = defaultService(name);
    return acc;
  }, {});
}

function defaultService(name) {
  return {
    name,
    cpu: null,
    memory: null,
    lastSeenAt: null,
    lastAnomalyAt: null
  };
}

function getStatus(lastAnomalyAt, now) {
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

function statusText(status) {
  if (status === "critical") {
    return "Recent anomaly detected";
  }
  if (status === "warning") {
    return "Anomaly cooling down";
  }
  return "Stable";
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "--";
  }
  return `${value.toFixed(1)}%`;
}

function formatTime(value) {
  const date = new Date(value || Date.now());
  return date.toLocaleTimeString();
}
