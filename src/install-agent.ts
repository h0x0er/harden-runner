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

    // Download the Agent3.app package from placeholder URL
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

    // Clean network extension preferences WITHOUT stopping network services
    core.info("Cleaning network extension preference files...");

    // Remove main network extension plist
    try {
      cp.execSync(
        "sudo rm -f /Library/Preferences/com.apple.networkextension.plist",
        { stdio: "ignore" }
      );
      core.info("✓ Removed main network extension plist");
    } catch (e) {
      core.info("No main plist to remove");
    }

    // Remove control plist (the critical one for "stale configuration")
    try {
      cp.execSync(
        "sudo rm -f /Library/Preferences/com.apple.networkextension.control.plist",
        { stdio: "ignore" }
      );
      core.info("✓ Removed network extension control state");
    } catch (e) {
      core.info("No control plist to remove");
    }

    // Clean SystemConfiguration network extension files
    try {
      cp.execSync(
        "sudo rm -f /Library/Preferences/SystemConfiguration/com.apple.networkextension*.plist",
        { stdio: "ignore" }
      );
      core.info("✓ Cleaned SystemConfiguration files");
    } catch (e) {
      core.info("No SystemConfiguration files to remove");
    }

    // Clean network extension database/cache
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

    // REMOVED: No sleep needed here - file operations complete immediately

    // Copy the plist files
    core.info("Copying network extension plist files...");
    let cmd = "sudo";
    let args = [
      "cp",
      path.join(__dirname, "com.apple.networkextension.plist"),
      "/Library/Preferences/com.apple.networkextension.plist",
    ];
    cp.execFileSync(cmd, args);
    core.info("✓ Copied com.apple.networkextension.plist");

    // Launch the agent with log file
    core.info("Launching Agent3...");
    if (
      !fs.existsSync(
        "/Applications/HardenRunner.app/Contents/MacOS/HardenRunner"
      )
    ) {
      core.warning("✗ Agent3 binary not found at expected path");
    } else {
      core.info(
        "✓ Agent3 binary verified at /Applications/HardenRunner.app/Contents/MacOS/HardenRunner"
      );
    }
    cp.execSync(
      "sudo /Applications/HardenRunner.app/Contents/MacOS/HardenRunner >> /tmp/agent.log 2>&1 &",
      {
        shell: "/bin/bash",
      }
    );
    core.info("✓ Agent3 launched in background");

    // Step 3: Fix user permission - Modify system extensions database
    core.info("Step 3: Modifying system extensions database...");

    // OPTIMIZED: Poll for system extension instead of blind wait
    core.info("Waiting for system extension to register...");
    let extensionFound = false;
    const maxAttempts = 10; // 10 attempts = max 5 seconds (10 * 0.5s)

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Check if extension is in the database
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

      // Wait 0.5 seconds before next attempt
      cp.execSync("sleep 0.5");
    }

    if (!extensionFound) {
      core.warning(
        "⚠ System extension not found in expected time, proceeding anyway..."
      );
    }

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

    core.info("Killing Agent3 process...");
    try {
      cp.execSync("sudo killall -9 HardenRunner 2>/dev/null");
      core.info("✓ Agent3 process terminated");
    } catch (e) {
      core.info("No Agent3 process to terminate");
    }

    // Show logs if they exist
    if (fs.existsSync("/tmp/agent.log")) {
      var content = fs.readFileSync("/tmp/agent.log", "utf-8");
      console.log("Agent log contents:");
      console.log(content);
      core.info("✓ Agent log read and displayed");
    }

    core.info("Restarting sysextd...");
    cp.execSync("sudo launchctl kickstart -k system/com.apple.sysextd");
    core.info("✓ sysextd restarted");
    core.info("✓ Step 3 completed: System extensions database modified");

    // Step 4: Relaunch Agent3
    core.info("Step 4: Relaunching Agent3...");
    cp.execSync(
      "sudo /Applications/HardenRunner.app/Contents/MacOS/HardenRunner >> /tmp/agent.log 2>&1 &",
      {
        shell: "/bin/bash",
      }
    );
    core.info("✓ Agent3 relaunched successfully");
    core.info("✓ Step 4 completed: HardenRunner is now running");

    core.info("✓ macOS agent installation completed successfully");
    return true;
  } catch (error) {
    core.error(`Failed to install macOS agent: ${error}`);
    return false;
  }
}
