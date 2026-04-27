#!/usr/bin/env bun

/**
 * Kills any process using the specified port
 * Works on Windows, macOS, and Linux
 */

const port = process.argv[2] || "5173";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findProcessesOnPort(port: string): Promise<string[]> {
  const isWindows = process.platform === "win32";

  if (isWindows) {
    // Windows: Use netstat -ano (no -p TCP to avoid locale/format issues)
    const proc = Bun.spawn(["netstat", "-ano"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;
    const lines = output.split(/\r?\n/);

    const pids = new Set<string>();
    // Match lines that contain :port and LISTENING; PID is last column
    const portPattern = new RegExp(`:${port}(?:\\s|$)`);
    for (const line of lines) {
      if (portPattern.test(line) && line.includes("LISTENING")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== "0" && /^\d+$/.test(pid)) {
          pids.add(pid);
        }
      }
    }

    // Fallback: try PowerShell Get-NetTCPConnection if netstat found nothing
    if (pids.size === 0) {
      try {
        const psProc = Bun.spawn(
          [
            "powershell",
            "-NoProfile",
            "-Command",
            `Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { $_.OwningProcess }`,
          ],
          { stdout: "pipe", stderr: "pipe" }
        );
        const psOut = await new Response(psProc.stdout).text();
        await psProc.exited;
        const psPids = psOut
          .trim()
          .split(/\r?\n/)
          .filter((s) => /^\d+$/.test(s.trim()));
        psPids.forEach((p) => pids.add(p.trim()));
      } catch {
        // ignore
      }
    }

    return Array.from(pids);
  } else {
    // Unix-like: Use lsof to find PID
    const proc = Bun.spawn(["lsof", "-ti", `:${port}`], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    return output.trim().split("\n").filter(Boolean);
  }
}

async function killProcess(pid: string): Promise<boolean> {
  const isWindows = process.platform === "win32";

  try {
    if (isWindows) {
      const killProc = Bun.spawn(["taskkill", "/F", "/PID", pid], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await killProc.exited;
    } else {
      const killProc = Bun.spawn(["kill", "-9", pid], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await killProc.exited;
    }
    return true;
  } catch {
    return false;
  }
}

async function killPort(port: string) {
  try {
    // Find processes
    let pids = await findProcessesOnPort(port);

    if (pids.length === 0) {
      console.log(`No process found on port ${port}`);
      return;
    }

    // Kill all found processes
    console.log(`Found ${pids.length} process(es) on port ${port}`);
    for (const pid of pids) {
      const killed = await killProcess(pid);
      if (killed) {
        console.log(`Killed process ${pid}`);
      }
    }

    // Wait a bit for the port to be freed
    await sleep(500);

    // Verify the port is actually free
    pids = await findProcessesOnPort(port);
    if (pids.length > 0) {
      console.log(`Warning: Port ${port} still has ${pids.length} process(es) running`);
      // Try one more time with a longer wait
      for (const pid of pids) {
        await killProcess(pid);
      }
      await sleep(1000);
    } else {
      console.log(`Port ${port} is now free`);
    }
  } catch (error) {
    console.error(`Error killing port ${port}:`, error);
  }
}

await killPort(port);
