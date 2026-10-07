// ISO 8601 UTC timestamps are unambiguous across host/container time zones.
export function logInfo(message) {
  console.log(`[${new Date().toISOString()}] INFO ${message}`);
}

export function logError(message) {
  console.error(`[${new Date().toISOString()}] ERROR ${message}`);
}
