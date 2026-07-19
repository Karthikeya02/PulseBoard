import type { ServiceState, ServiceStatus } from "../types";
import { formatPercent } from "../format";

export interface ServiceCardProps {
  service: ServiceState;
  status: ServiceStatus;
}

export default function ServiceCard({ service, status }: ServiceCardProps) {
  return (
    <article className={`card ${status}`}>
      <div className="card-head">
        <h2>{service.name}</h2>
        <span className={`status-dot ${status}`} />
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
      <p className="stat-foot">{statusText(status)}</p>
    </article>
  );
}

function statusText(status: ServiceStatus): string {
  if (status === "critical") {
    return "Recent anomaly detected";
  }
  if (status === "warning") {
    return "Anomaly cooling down";
  }
  return "Stable";
}
