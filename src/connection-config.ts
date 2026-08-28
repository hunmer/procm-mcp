let roomWebSocketUrl: string | undefined;
let httpToken: string | undefined;

export function setConnectionConfig(port: number, token?: string): void {
  roomWebSocketUrl = `ws://127.0.0.1:${port}/room`;
  httpToken = token;
}

export function getConnectionEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  if (roomWebSocketUrl) env.PROCM_WS_URL = roomWebSocketUrl;
  if (httpToken) env.PROCM_HTTP_TOKEN = httpToken;
  return env;
}
