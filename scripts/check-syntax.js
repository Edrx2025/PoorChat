const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const roots = [
  path.join(projectRoot, "src"),
  path.join(projectRoot, "scripts"),
  path.join(projectRoot, "tests"),
];
const files = [];

function collect(directory) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(fullPath);
    else if (entry.name.endsWith(".js")) files.push(fullPath);
  }
}

for (const root of roots) collect(root);

let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    failed = true;
    console.error(result.stderr || result.stdout);
  }
}

if (failed) process.exit(1);
console.log(`Sintaxis válida en ${files.length} archivos JavaScript.`);
