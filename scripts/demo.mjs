// Sobe o painel em modo demonstração (dados inventados, sem login) em http://localhost:3001.
// Funciona em qualquer sistema: `npm run demo`.
import { spawn } from "node:child_process";

const child = spawn("npx", ["next", "dev", "-p", "3001"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
