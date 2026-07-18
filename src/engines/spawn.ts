import { spawn } from "node:child_process";

export interface SpawnOutcome {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Thin promise wrapper around child_process.spawn used by every subprocess
 * engine. Collects stdout/stderr and enforces an optional timeout.
 */
export function runProcess(
  command: string,
  args: string[],
  opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}
): Promise<SpawnOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? process.cwd(),
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/** Returns true if `command --version` (or `which`) resolves. */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const probe = process.platform === "win32" ? "where" : "which";
    const { code } = await runProcess(probe, [command], { timeoutMs: 5000 });
    return code === 0;
  } catch {
    return false;
  }
}
