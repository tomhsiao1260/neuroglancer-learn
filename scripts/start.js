import { spawn } from "cross-spawn";
import open from "open";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { cwd, stdio: "inherit", shell: true });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function main() {
  const clientDir = path.join(__dirname, "..", "client");
  const serverDir = path.join(__dirname, "..", "server");

  try {
    // First run npm install for server
    await runCommand("npm", ["install"], serverDir);
    await runCommand("npm", ["install"], clientDir);
    // Then build client
    await runCommand("npm", ["run", "build"], clientDir);

    // Run preview client and server dev simultaneously
    const preview = spawn("npm", ["run", "preview"], {
      cwd: clientDir,
      shell: true,
      stdio: "inherit",
    });

    const server = spawn("npm", ["run", "dev"], {
      cwd: serverDir,
      shell: true,
      stdio: "inherit",
    });

    // Open browser after 3 seconds
    setTimeout(() => {
      open("http://localhost:4173/");
    }, 3000);

    // Wait for server and preview to end (usually won't end)
    await Promise.all([
      new Promise((resolve) => preview.on("close", resolve)),
      new Promise((resolve) => server.on("close", resolve)),
    ]);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
