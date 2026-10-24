import { createServer } from "node:http";

const server = createServer((_request, response) => {
  response.end(JSON.stringify({ pid: process.pid, marker: "process-tree-test" }));
});
server.listen(Number(process.env.PROCM_TEST_PORT), "127.0.0.1", () => {
  console.log(`Listening: pid=${process.pid} port=${server.address().port}`);
});
process.on("SIGINT", () => server.close(() => process.exit(0)));
