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
  if (process.platform !== "linux" && process.platform !== "win32") {
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
  if (process.platform === "win32") {
    // Windows cleanup
    const agentDir = process.env.STATE_agentDir || "C:\\agent";
    const postEventFile = path.join(agentDir, "post_event.json");

    if (isGithubHosted() && fs.existsSync(postEventFile)) {
      console.log("Post step already executed, skipping");
      return;
    }

    // Run PowerShell command to query users
    console.log("Running query user command...");
    cp.execSync("powershell -Command \"query user > $null\"", {
      encoding: "utf8",
      stdio: "inherit",
    });

    // Mark post event as completed
    fs.writeFileSync(postEventFile, JSON.stringify({ event: "post" }));

    // Wait for done file
    const doneFile = path.join(agentDir, "done.json");
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

    // // Display agent status
    // const status = path.join(agentDir, "agent.status");
    // if (fs.existsSync(status)) {
    //   console.log("status:");
    //   var content = fs.readFileSync(status, "utf-8");
    //   console.log(content);
    // }

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
    const log = path.join(agentDir, "agent.log");
    if (fs.existsSync(log)) {
      console.log("log:");
      var content = fs.readFileSync(log, "utf-8");
      console.log(content);
    }

    // --- COMMENTED OUT: Windows Service cleanup code ---
    // // Stop and remove agent service
    // console.log("Stopping Windows Agent service...");
    // const serviceName = "StepSecurityAgent";
    //
    // try {
    //   // Check if service exists
    //   const serviceExists = cp.execSync(
    //     `powershell -Command "Get-Service -Name ${serviceName} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"`,
    //     { encoding: "utf8" }
    //   ).trim();
    //
    //   if (serviceExists) {
    //     console.log(`Service ${serviceName} found, stopping and removing...`);
    //
    //     // Stop the service using NSSM
    //     try {
    //       cp.execSync(`nssm stop ${serviceName}`, {
    //         encoding: "utf8",
    //         stdio: "inherit",
    //       });
    //       console.log("Service stopped");
    //     } catch (stopError) {
    //       console.log("Warning: Could not stop service:", stopError.message);
    //     }
    //
    //     // Wait a moment for service to stop
    //     cp.execSync("powershell -Command \"Start-Sleep -Seconds 2\"");
    //
    //     // Remove the service
    //     try {
    //       cp.execSync(`nssm remove ${serviceName} confirm`, {
    //         encoding: "utf8",
    //         stdio: "inherit",
    //       });
    //       console.log("Service removed");
    //     } catch (removeError) {
    //       console.log("Warning: Could not remove service:", removeError.message);
    //     }
    //   } else {
    //     console.log(`Service ${serviceName} not found. May not have been installed.`);
    //   }
    // } catch (error) {
    //   console.log("Warning: Error managing service:", error.message);
    // }
    // --- END COMMENTED CODE ---
  } else {
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
