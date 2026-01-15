import * as tc from "@actions/tool-cache";
import * as core from "@actions/core";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { verifyChecksum } from "./checksum";
import { EOL } from "os";
import { ARM64_RUNNER_MESSAGE } from "./common";

export async function installLinuxAgent(
  isTLS: boolean,
  configStr: string
): Promise<boolean> {
  // Note: to avoid github rate limiting
  const token = core.getInput("token", { required: true });
  const auth = `token ${token}`;

  const variant = process.arch === "x64" ? "amd64" : "arm64";

  let downloadPath: string;

  fs.appendFileSync(process.env.GITHUB_STATE, `isTLS=${isTLS}${EOL}`, {
    encoding: "utf8",
  });

  if (isTLS) {
    downloadPath = await tc.downloadTool(
      `https://github.com/step-security/agent-ebpf/releases/download/v1.7.9/harden-runner_1.7.9_linux_${variant}.tar.gz`,
      undefined,
      auth
    );
  } else {
    if (variant === "arm64") {
      console.log(ARM64_RUNNER_MESSAGE);
      return false;
    }
    downloadPath = await tc.downloadTool(
      "https://github.com/step-security/agent/releases/download/v0.14.2/agent_0.14.2_linux_amd64.tar.gz",
      undefined,
      auth
    );
  }

  verifyChecksum(downloadPath, isTLS, variant);

  const extractPath = await tc.extractTar(downloadPath);

  let cmd = "cp",
    args = [path.join(extractPath, "agent"), "/home/agent/agent"];

  cp.execFileSync(cmd, args);

  cp.execSync("chmod +x /home/agent/agent");

  fs.writeFileSync("/home/agent/agent.json", configStr);

  cmd = "sudo";
  args = [
    "cp",
    path.join(__dirname, "agent.service"),
    "/etc/systemd/system/agent.service",
  ];
  cp.execFileSync(cmd, args);
  cp.execSync("sudo systemctl daemon-reload");
  cp.execSync("sudo service agent start", { timeout: 15000 });
  return true;
}

export async function installMacosAgent(confgStr: string): Promise<boolean> {
  const token = core.getInput("token", { required: true });
  const auth = `token ${token}`;

  try {
    // ========================================================================
    // SECTION 1: PREPARATION - Create Configuration and Download Agent
    // ========================================================================
    core.info("=== SECTION 1: PREPARATION ===");

    // Create agent configuration file
    core.info("Creating agent.json");
    fs.writeFileSync("/tmp/agent.json", confgStr);
    core.info("✓ Successfully created agent.json at /tmp/agent.json");

    // Download agent package
    const downloadUrl =
      "https://github.com/h0x0er/playground/releases/download/v0.0.2/HardenRunner.tar.gz";
    core.info("Downloading macOS agent...");
    const downloadPath = await tc.downloadTool(downloadUrl, undefined, auth);
    core.info(`✓ Successfully downloaded agent to: ${downloadPath}`);

    // Extract agent package
    const extractPath = await tc.extractTar(downloadPath);
    core.info(`✓ Successfully extracted agent to: ${extractPath}`);

    // ========================================================================
    // SECTION 2: INSTALLATION - Install Agent to /Applications
    // ========================================================================
    core.info("=== SECTION 2: INSTALLATION ===");

    const agentAppPath = path.join(extractPath, "HardenRunner.app");
    core.info(`Installing from: ${agentAppPath}`);
    cp.execSync(`sudo cp -r "${agentAppPath}" /Applications/`);
    core.info("✓ Successfully installed HardenRunner.app to /Applications");

    // ========================================================================
    // SECTION 3: NETWORK EXTENSION CLEANUP - Reset Network Extension State
    // ========================================================================
    core.info("=== SECTION 3: NETWORK EXTENSION CLEANUP ===");

    // Stop network extension daemons
    core.info("Stopping network extension daemons...");

    try {
      cp.execSync("sudo launchctl stop system/com.apple.nesessionmanager", {
        stdio: "ignore",
      });
      core.info("✓ Stopped nesessionmanager");
    } catch (e) {
      core.info("nesessionmanager not running or already stopped");
    }

    // Clean preference files
    core.info("Removing network extension preference files...");
    cp.execSync(
      "sudo rm -f /Library/Preferences/com.apple.networkextension*.plist"
    );
    core.info("✓ Removed main network extension plists");

    cp.execSync(
      "sudo rm -f /Library/Preferences/com.apple.networkextension.control.plist"
    );
    core.info("✓ Removed control state plist");

    cp.execSync(
      "sudo rm -f /Library/Preferences/SystemConfiguration/com.apple.networkextension*.plist"
    );
    core.info("✓ Removed SystemConfiguration files");

    // Clean cache
    core.info("Removing network extension cache...");
    cp.execSync("sudo rm -rf /var/db/com.apple.networkextension/");
    core.info("✓ Removed network extension cache");

    // ========================================================================
    // SECTION 4: DAEMON RESTART - Restart Daemons with Clean State
    // ========================================================================
    core.info("=== SECTION 4: DAEMON RESTART ===");

    try {
      cp.execSync("sudo launchctl start system/com.apple.nesessionmanager");
      core.info("✓ Started nesessionmanager");
    } catch (e) {
      core.info("nesessionmanager already running or failed to start");
    }

    // Wait for daemons to stabilize
    core.info("Waiting for network extension system to stabilize...");
    cp.execSync("sleep 2");
    core.info("✓ System stabilized");

    // ========================================================================
    // SECTION 5: CONFIGURATION - Apply Network Extension Preferences
    // ========================================================================
    core.info("=== SECTION 5: CONFIGURATION ===");

    core.info("Copying network extension preference file...");
    cp.execFileSync("sudo", [
      "cp",
      path.join(__dirname, "com.apple.networkextension.plist"),
      "/Library/Preferences/com.apple.networkextension.plist",
    ]);
    cp.execFileSync("sudo", [
      "cp",
      path.join(__dirname, "com.apple.networkextension.necp.plist"),
      "/Library/Preferences/com.apple.networkextension.necp.plist",
    ]);
    core.info("✓ Copied com.apple.networkextension.plist");

    // ========================================================================
    // SECTION 6: AGENT LAUNCH - Start Agent for Initial Registration
    // ========================================================================
    core.info("=== SECTION 6: AGENT LAUNCH ===");

    const agentBinaryPath =
      "/Applications/HardenRunner.app/Contents/MacOS/HardenRunner";

    // Verify agent binary exists
    if (!fs.existsSync(agentBinaryPath)) {
      throw new Error("Agent binary not found at expected path");
    }
    core.info("✓ Agent binary verified");

    // Launch agent in background
    cp.execSync(`sudo "${agentBinaryPath}" >> /tmp/agent.log 2>&1 &`, {
      shell: "/bin/bash",
    });
    core.info("✓ Agent launched in background");

    // ========================================================================
    // SECTION 7: SYSTEM EXTENSION APPROVAL - Modify Extension Permissions
    // ========================================================================
    core.info("=== SECTION 7: SYSTEM EXTENSION APPROVAL ===");

    // Wait for system extension to register
    core.info("Waiting for system extension to initialize...");
    cp.execSync("sleep 5");
    core.info("✓ Wait completed");

    // Convert db.plist to XML for editing
    core.info("Converting system extensions database to XML...");
    cp.execSync("sudo plutil -convert xml1 /Library/SystemExtensions/db.plist");
    core.info("✓ Converted to XML format");

    // Modify extension approval state
    core.info("Modifying system extension approval state...");
    cp.execSync(
      "sudo sed -i '' 's/activated_waiting_for_user/activated_enabling/g' /Library/SystemExtensions/db.plist"
    );
    core.info("✓ Changed state from 'waiting_for_user' to 'enabling'");

    // Convert back to binary format
    core.info("Converting system extensions database to binary...");
    cp.execSync(
      "sudo plutil -convert binary1 /Library/SystemExtensions/db.plist"
    );
    core.info("✓ Converted to binary format");

    // ========================================================================
    // SECTION 8: AGENT RESTART - Reload Agent with New Permissions
    // ========================================================================
    core.info("=== SECTION 8: AGENT RESTART ===");

    // Terminate existing agent process
    core.info("Terminating agent process...");
    try {
      cp.execSync("sudo killall -9 HardenRunner 2>/dev/null");
      core.info("✓ Agent process terminated");
    } catch (e) {
      core.info("No agent process to terminate");
    }

    // Display agent logs
    if (fs.existsSync("/tmp/agent.log")) {
      const content = fs.readFileSync("/tmp/agent.log", "utf-8");
      console.log("=== Agent Log Contents ===");
      console.log(content);
      console.log("=== End Agent Log ===");
      core.info("✓ Agent log displayed");
    }

    // Restart sysextd to apply permission changes
    core.info("Restarting system extension daemon...");
    cp.execSync("sudo launchctl kickstart -k system/com.apple.sysextd");
    core.info("✓ sysextd restarted");

    // Relaunch agent with updated permissions
    core.info("Relaunching agent with updated permissions...");
    cp.execSync(`sudo "${agentBinaryPath}" >> /tmp/agent.log 2>&1 &`, {
      shell: "/bin/bash",
    });
    core.info("✓ Agent relaunched successfully");

    // ========================================================================
    // COMPLETION
    // ========================================================================
    core.info("✅ macOS agent installation completed successfully");
    return true;
  } catch (error) {
    core.error(`❌ Failed to install macOS agent: ${error}`);
    if (error instanceof Error && error.stack) {
      core.debug(error.stack);
    }
    return false;
  }
}
