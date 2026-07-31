// Demo script: a tiny HTTP server that logs each request to stdout, showing
// a long-running process whose output reacts to traffic.
import http from "node:http";

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  res.end("ok\n");
});

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  console.log(`listening on http://127.0.0.1:${port}`);
});
