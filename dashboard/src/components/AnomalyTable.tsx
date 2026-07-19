import type { Anomaly } from "../types";
import { formatPercent, formatTime } from "../format";

export interface AnomalyTableProps {
  anomalies: Anomaly[];
}

export default function AnomalyTable({ anomalies }: AnomalyTableProps) {
  return (
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
  );
}
