#!/usr/bin/env bun

/**
 * Kills any process using the specified port
 * Works on Windows, macOS, and Linux
 */

const port = process.argv[2] || '5173';

async function killPort(port: string) {
  const isWindows = process.platform === 'win32';

  try {
    if (isWindows) {
      // Windows: Use netstat to find PID, then taskkill to kill it
      const proc = Bun.spawn(['netstat', '-ano', '-p', 'TCP'], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const output = await new Response(proc.stdout).text();
      const lines = output.split('\n');
      
      const pids = new Set<string>();
      for (const line of lines) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== '0' && /^\d+$/.test(pid)) {
            pids.add(pid);
          }
        }
      }

      if (pids.size === 0) {
        console.log(`No process found on port ${port}`);
        return;
      }

      for (const pid of pids) {
        try {
          const killProc = Bun.spawn(['taskkill', '/F', '/PID', pid], {
            stdout: 'pipe',
            stderr: 'pipe',
          });
          await killProc.exited;
          console.log(`Killed process ${pid} on port ${port}`);
        } catch (error) {
          // Process might already be dead, ignore
        }
      }
    } else {
      // Unix-like: Use lsof to find PID, then kill
      const proc = Bun.spawn(['lsof', '-ti', `:${port}`], {
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const output = await new Response(proc.stdout).text();
      const pids = output.trim().split('\n').filter(Boolean);

      if (pids.length === 0) {
        console.log(`No process found on port ${port}`);
        return;
      }

      for (const pid of pids) {
        try {
          const killProc = Bun.spawn(['kill', '-9', pid], {
            stdout: 'pipe',
            stderr: 'pipe',
          });
          await killProc.exited;
          console.log(`Killed process ${pid} on port ${port}`);
        } catch (error) {
          // Process might already be dead, ignore
        }
      }
    }
  } catch (error) {
    // If command fails (e.g., no process found), that's okay
    console.log(`Port ${port} is available`);
  }
}

killPort(port);
