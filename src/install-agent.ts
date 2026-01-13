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
  // Note: to avoid github rate limiting
  const token = core.getInput("token", { required: true });
  const auth = `token ${token}`;

  try {
    // Write config file
    console.log("Creating agent.json");
    fs.writeFileSync("/tmp/agent.json", confgStr);
    core.info("✓ Successfully created agent.json at /tmp/agent.json");

    // Download the Agent3.app package
    const downloadUrl =
      "https://github.com/h0x0er/playground/releases/download/v0.0.2/HardenRunner.tar.gz";
    core.info("Downloading macOS agent...");
    const downloadPath = await tc.downloadTool(downloadUrl, undefined, auth);
    core.info(`✓ Successfully downloaded agent to: ${downloadPath}`);

    // Extract the downloaded package
    const extractPath = await tc.extractTar(downloadPath);
    core.info(`✓ Successfully extracted agent to: ${extractPath}`);

    // Step 2: Install Agent3.app to /Applications
    core.info("Step 2: Installing Agent3.app...");
    const agentAppPath = path.join(extractPath, "HardenRunner.app");
    core.info(`Agent app path: ${agentAppPath}`);
    cp.execSync(`sudo cp -r "${agentAppPath}" /Applications/`);
    core.info("✓ Successfully copied Agent3.app to /Applications");
    core.info("✓ Step 2 completed: Agent3.app installed");

    // Clean network extension preferences (no service restarts needed)
    core.info("Cleaning network extension preference files...");

    try {
      cp.execSync(
        "sudo rm -f /Library/Preferences/com.apple.networkextension.plist " +
          "/Library/Preferences/com.apple.networkextension.control.plist " +
          "/Library/Preferences/SystemConfiguration/com.apple.networkextension*.plist",
        { stdio: "ignore" }
      );
      core.info("✓ Removed network extension preference files");
    } catch (e) {
      core.info("No preference files to remove");
    }

    try {
      cp.execSync("sudo rm -rf /var/db/com.apple.networkextension/", {
        stdio: "ignore",
      });
      core.info("✓ Removed network extension cache");
    } catch (e) {
      core.info("No cache directory to remove");
    }

    // Notify nesessionmanager to reload configuration (gentle restart)
    core.info("Refreshing network extension manager...");
    try {
      cp.execSync(
        "sudo launchctl kickstart -k system/com.apple.nesessionmanager",
        {
          stdio: "ignore",
        }
      );
      core.info("✓ Network extension manager refreshed");
    } catch (e) {
      core.info("Could not refresh nesessionmanager");
    }

    // Copy the plist files (system will pick up changes automatically)
    core.info("Copying network extension plist files...");
    cp.execFileSync("sudo", [
      "cp",
      path.join(__dirname, "com.apple.networkextension.plist"),
      "/Library/Preferences/com.apple.networkextension.plist",
    ]);
    core.info("✓ Copied com.apple.networkextension.plist");

    // Launch the agent
    core.info("Launching Agent3...");
    const agentBinaryPath =
      "/Applications/HardenRunner.app/Contents/MacOS/HardenRunner";

    if (!fs.existsSync(agentBinaryPath)) {
      throw new Error("Agent3 binary not found at expected path");
    }

    core.info("✓ Agent3 binary verified");
    cp.execSync(`sudo "${agentBinaryPath}" >> /tmp/agent.log 2>&1 &`, {
      shell: "/bin/bash",
    });
    core.info("✓ Agent3 launched in background");

    // Step 3: Modify system extensions database
    core.info("Step 3: Modifying system extensions database...");

    // Poll for system extension registration
    core.info("Waiting for system extension to register...");
    let extensionFound = false;
    const maxAttempts = 10; // Max 5 seconds (10 * 0.5s)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const dbContent = cp.execSync(
          "sudo plutil -convert xml1 -o - /Library/SystemExtensions/db.plist 2>/dev/null || echo ''",
          { encoding: "utf-8" }
        );

        if (
          dbContent.includes("HardenRunner") ||
          dbContent.includes("activated")
        ) {
          extensionFound = true;
          core.info(
            `✓ System extension found after ${(attempt + 1) * 0.5} seconds`
          );
          break;
        }
      } catch (e) {
        // Continue waiting
      }

      cp.execSync("sleep 0.5");
    }

    if (!extensionFound) {
      core.warning(
        "⚠ System extension not found in expected time, proceeding anyway..."
      );
    }

    // Modify system extension approval state
    core.info("Converting db.plist to xml1 format...");
    cp.execSync("sudo plutil -convert xml1 /Library/SystemExtensions/db.plist");
    core.info("✓ Successfully converted db.plist to xml1");

    core.info("Modifying system extension state...");
    cp.execSync(
      "sudo sed -i '' 's/activated_waiting_for_user/activated_enabling/g' /Library/SystemExtensions/db.plist"
    );
    core.info("✓ Successfully modified system extension state");

    core.info("Converting db.plist back to binary1 format...");
    cp.execSync(
      "sudo plutil -convert binary1 /Library/SystemExtensions/db.plist"
    );
    core.info("✓ Successfully converted db.plist to binary1");

    // Terminate agent to reload with new permissions
    core.info("Terminating Agent3 process...");
    try {
      cp.execSync("sudo killall -9 HardenRunner 2>/dev/null");
      core.info("✓ Agent3 process terminated");
    } catch (e) {
      core.info("No Agent3 process to terminate");
    }

    // Display agent logs if available
    if (fs.existsSync("/tmp/agent.log")) {
      const content = fs.readFileSync("/tmp/agent.log", "utf-8");
      console.log("Agent log contents:");
      console.log(content);
      core.info("✓ Agent log read and displayed");
    }

    // Restart sysextd to apply changes
    core.info("Restarting sysextd...");
    cp.execSync("sudo launchctl kickstart -k system/com.apple.sysextd");
    core.info("✓ sysextd restarted");
    core.info("✓ Step 3 completed: System extensions database modified");

    // Step 4: Relaunch Agent3 with updated permissions
    core.info("Step 4: Relaunching Agent3...");
    cp.execSync(`sudo "${agentBinaryPath}" >> /tmp/agent.log 2>&1 &`, {
      shell: "/bin/bash",
    });
    core.info("✓ Agent3 relaunched successfully");
    core.info("✓ Step 4 completed: HardenRunner is now running");

    core.info("✓ macOS agent installation completed successfully");
    return true;
  } catch (error) {
    core.error(`Failed to install macOS agent: ${error}`);
    return false;
  }
}
