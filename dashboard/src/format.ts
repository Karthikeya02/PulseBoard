export function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }
  return `${value.toFixed(1)}%`;
}

export function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString();
}
