import * as fs from "fs";
import * as cp from "child_process";
import * as path from "path";
import * as common from "./common";
import isDocker from "is-docker";
import { isARCRunner } from "./arc-runner";
import { isGithubHosted } from "./tls-inspect";
import { context } from "@actions/github";
(async () => {
  console.log("[harden-runner] post-step");

  const customProperties = context?.payload?.repository?.custom_properties || {};
  if (customProperties["skip-harden-runner"] === "true") {
    console.log("Skipping harden-runner: custom property 'skip-harden-runner' is set to 'true'");
    return;
  }

  // Check platform support
  if (process.platform !== "linux" && process.platform !== "win32" && process.platform !== "darwin") {
    console.log(common.UNSUPPORTED_PLATFORM_MESSAGE);
    return;
  }

  // Linux-specific checks
  if (process.platform === "linux") {
    if (isGithubHosted() && isDocker()) {
      console.log(common.CONTAINER_MESSAGE);
      return;
    }
  }

  if (isARCRunner()) {
    console.log(`[!] ${common.ARC_RUNNER_MESSAGE}`);
    return;
  }

  if (process.env.STATE_selfHosted === "true") {
    return;
  }

  if (process.env.STATE_customVMImage === "true") {
    return;
  }

  if (process.platform === "linux" && process.env.STATE_isTLS === "false" && process.arch === "arm64") {
    return;
  }

  if (
    String(process.env.STATE_monitorStatusCode) ===
    common.STATUS_HARDEN_RUNNER_UNAVAILABLE
  ) {
    console.log(common.HARDEN_RUNNER_UNAVAILABLE_MESSAGE);
    return;
  }

  // Platform-specific cleanup
  switch (process.platform) {
    case "linux":
      // Linux cleanup
      if (isGithubHosted() && fs.existsSync("/home/agent/post_event.json")) {
        console.log("Post step already executed, skipping");
        return;
      }

      fs.writeFileSync(
        "/home/agent/post_event.json",
        JSON.stringify({ event: "post" })
      );

      const doneFile = "/home/agent/done.json";
      let counter = 0;
      while (true) {
        if (!fs.existsSync(doneFile)) {
          counter++;
          if (counter > 10) {
            console.log("timed out");
            break;
          }
          await sleep(1000);
        } else {
          break;
        }
      }

      const log = "/home/agent/agent.log";
      if (fs.existsSync(log)) {
        console.log("log:");
        var content = fs.readFileSync(log, "utf-8");
        console.log(content);
      }

      const daemonLog = "/home/agent/daemon.log";
      if (fs.existsSync(daemonLog)) {
        console.log("daemonLog:");
        var content = fs.readFileSync(daemonLog, "utf-8");
        console.log(content);
      }

      var status = "/home/agent/agent.status";
      if (fs.existsSync(status)) {
        console.log("status:");
        var content = fs.readFileSync(status, "utf-8");
        console.log(content);
      }

      var disable_sudo = process.env.STATE_disableSudo;
      var disable_sudo_and_containers = process.env.STATE_disableSudoAndContainers;

      if (disable_sudo !== "true" && disable_sudo_and_containers !== "true") {
        try {
          var journalLog = cp.execSync(
            "sudo journalctl -u agent.service --lines=1000",
            {
              encoding: "utf8",
              maxBuffer: 1024 * 1024 * 10, // 10MB buffer
            }
          );
          console.log("agent.service log:");
          console.log(journalLog);
        } catch (error) {
          console.log("Warning: Could not fetch service logs:", error.message);
        }
      }
      break;

    case "win32":
      // Windows cleanup
      const agentDir = process.env.STATE_agentDir || "C:\\agent";
      const postEventFile = path.join(agentDir, "post_event.json");

      if (isGithubHosted() && fs.existsSync(postEventFile)) {
        console.log("Post step already executed, skipping");
        return;
      }

      
      const p = cp.spawn(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "query user; exit $LASTEXITCODE"],
        { stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true }
      );

      p.on("error", (e) => console.log("powershell spawn error:", e));
      p.on("exit", (code) => console.log("powershell exit:", code));
      p.unref();

      // Mark post event as completed
      fs.writeFileSync(postEventFile, JSON.stringify({ event: "post" }));

      // Wait for done file
      const doneWindowsFile = path.join(agentDir, "done.json");
      let windowsCounter = 0;
      while (true) {
        if (!fs.existsSync(doneWindowsFile)) {
          windowsCounter++;
          if (windowsCounter > 10) {
            console.log("timed out");
            break;
          }
          await sleep(1000);
        } else {
          break;
        }
      }

      // Stop agent process
      console.log("Stopping Windows Agent process...");
      const pidFile = path.join(agentDir, "agent.pid");

      try {
        // Read PID from file
        if (!fs.existsSync(pidFile)) {
          console.log("PID file not found. Agent may not be running.");
          return;
        }

        const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim());
        console.log(`Agent PID from file: ${pid}`);

        // Check if process is still running
        try {
          process.kill(pid, 0); // Signal 0 just checks if process exists
        } catch {
          console.log("Agent process not running.");
          fs.unlinkSync(pidFile);
          return;
        }

        // Send SIGINT signal for graceful shutdown
        console.log(`Stopping agent process (PID: ${pid})...`);
        console.log("Sending SIGINT signal for graceful shutdown...");
        process.kill(pid, 'SIGINT');

        // Wait for the process to exit gracefully (up to 10 seconds)
        let gracefulShutdown = false;
        for (let i = 0; i < 10; i++) {
          await sleep(1000);

          try {
            process.kill(pid, 0); // Check if still exists
          } catch {
            gracefulShutdown = true;
            console.log("Agent process stopped gracefully");
            break;
          }
        }

        // Force termination if graceful shutdown failed
        if (!gracefulShutdown) {
          console.log("Graceful shutdown timeout (10s), forcing termination...");
          process.kill(pid, 'SIGKILL');
          console.log("Agent process terminated forcefully");
        }

        // Clean up PID file
        if (fs.existsSync(pidFile)) {
          fs.unlinkSync(pidFile);
          console.log("PID file cleaned up");
        }
      } catch (error) {
        console.log("Warning: Error stopping agent process:", error.message);
      }

      // Display agent log
      const windowsLog = path.join(agentDir, "agent.log");
      if (fs.existsSync(windowsLog)) {
        console.log("log:");
        var content = fs.readFileSync(windowsLog, "utf-8");
        console.log(content);
      }
      break;
    
    case "darwin":
      // macOS cleanup
      case "darwin":
      {
        fs.writeFileSync(
          "/private/tmp/post_event.json",
          JSON.stringify({ event: "post" })
        );

        let macDone = "/private/tmp/done.json";
        let counter = 0;
        while (true) {
          if (!fs.existsSync(macDone)) {
            counter++;
            if (counter > 10) {
              console.log("timed out");

              break;
            }
            await sleep(1000);
          } // The file *does* exist
          else {
            break;
          }
        }

        let macAgenLog = "/tmp/agent.log";
        if (fs.existsSync(macAgenLog)) {
          console.log("macAgenLog:");
          var content = fs.readFileSync(macAgenLog, "utf-8");
          console.log(content);
        } else {
          console.log("😭 macos agent.log file not found");
        }

        // Capture system log stream for harden-runner subsystem
        try {
          console.log("\nSystem log stream for io.stepsecurity.harden-runner:");
          const logStreamOutput = cp.execSync(
            "log show --predicate 'subsystem == \"io.stepsecurity.harden-runner\"' --info --last 10m",
            {
              encoding: "utf8",
              maxBuffer: 1024 * 1024 * 10, // 10MB buffer
              timeout: 10000, // 30 second timeout
            }
          );
          console.log(logStreamOutput);
        } catch (error) {
          console.log(
            "Warning: Could not fetch system log stream:",
            error.message
          );
        }
      }
      break;
  }

  try {
    await common.addSummary();
  } catch (exception) {
    console.log(exception);
  }
})();

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
