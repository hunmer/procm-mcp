const path = require("node:path");
const { execSync } = require("node:child_process");

const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();

module.exports = {
  apps: [{
    name: "procm-mcp",
    script: path.join(globalRoot, "@hunmer", "procm-mcp", "build", "index.js"),
    args: "--server --port 7331 --data-path global"
  }]
};
