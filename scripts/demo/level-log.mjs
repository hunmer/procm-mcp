// Demo script: structured logging with the SDK Logger. Emits one entry per
// second, cycling through debug/info/warn/error. Set the LOG_LEVEL env
// (debug|info|warn|error|silent) to raise the minimum level — entries below
// it are dropped at the source — then filter by level in the LogPanel.
import { createLogger } from "../../packages/procm-sdk/dist/index.js";

const level = process.env.LOG_LEVEL ?? "debug";
const logger = createLogger({ clientName: "level-demo", level });
logger.info(`logger started at level "${logger.getLevel()}"`);

const levels = ["debug", "info", "warn", "error"];
let i = 0;
setInterval(() => {
  const lv = levels[i % levels.length];
  logger.log(lv, `level-demo line ${i}`, { i, level: lv });
  i++;
}, 1000);
