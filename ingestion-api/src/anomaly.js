const buffers = new Map();

export function updateCpuBuffer(serviceName, cpu, timestamp) {
  const buffer = buffers.get(serviceName) || [];
  buffer.push({ cpu, timestamp });

  if (buffer.length > 20) {
    buffer.splice(0, buffer.length - 20);
  }

  buffers.set(serviceName, buffer);
  return buffer;
}

export function computeZScore(buffer) {
  if (!buffer || buffer.length < 20) {
    return { z: 0, mean: 0, std: 0, latest: buffer.at(-1)?.cpu ?? 0 };
  }

  const values = buffer.map((entry) => entry.cpu);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  const latest = values[values.length - 1];

  if (std < 1e-6) {
    return { z: 0, mean, std, latest };
  }

  const z = (latest - mean) / std;
  return { z, mean, std, latest };
}
