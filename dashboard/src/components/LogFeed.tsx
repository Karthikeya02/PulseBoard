import { useEffect, useRef } from "react";
import type { LogLine } from "../types";
import { formatTime } from "../format";

export interface LogFeedProps {
  logs: LogLine[];
}

export default function LogFeed({ logs }: LogFeedProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll only the log container; scrollIntoView would also scroll the page
  // itself to the feed on every batch.
  useEffect(() => {
    const list = listRef.current;
    if (list) {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    }
  }, [logs.length]);

  return (
    <section className="panel logs">
      <div className="panel-head">
        <h3>Live log feed</h3>
        <span className="panel-hint">Streaming from all services</span>
      </div>
      <div className="log-list" ref={listRef}>
        {logs.map((log) => (
          <div key={log.id} className={`log-line ${log.level.toLowerCase()}`}>
            <span className="log-time">{formatTime(log.timestamp)}</span>
            <span className="log-service">{log.service_name}</span>
            <span className="log-level">{log.level}</span>
            <span className="log-message">{log.message}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
