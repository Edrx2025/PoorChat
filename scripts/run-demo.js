const { spawn } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const electronBinary = require("electron");

const server = spawn(
  process.execPath,
  [path.join(projectRoot, "src", "backend", "server", "start.js")],
  {
    cwd: projectRoot,
    stdio: "inherit",
  },
);

let electron = null;

const launchElectron = () => {
  electron = spawn(electronBinary, ["."], {
    cwd: projectRoot,
    stdio: "inherit",
  });

  electron.on("exit", () => {
    server.kill("SIGTERM");
    process.exit(0);
  });
};

setTimeout(launchElectron, 900);

const shutdown = () => {
  electron?.kill("SIGTERM");
  server.kill("SIGTERM");
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.on("exit", (code) => {
  if (code && code !== 0) {
    electron?.kill("SIGTERM");
    process.exit(code);
  }
});
