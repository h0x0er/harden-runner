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

    // Disable gatekeeper
    // core.info("Disabling gatekeeper");
    // cp.execSync("sudo spctl --master-disable");

    // Download the Agent3.app package from placeholder URL
    // TODO: Update this URL with the actual release URL
    const downloadUrl =
      "https://github.com/h0x0er/playground/releases/download/v0.0.2/Agent3.tar.gz";
    core.info("Downloading macOS agent...");
    const downloadPath = await tc.downloadTool(downloadUrl, undefined, auth);
    core.info(`✓ Successfully downloaded agent to: ${downloadPath}`);

    // Extract the downloaded package
    const extractPath = await tc.extractTar(downloadPath);
    core.info(`✓ Successfully extracted agent to: ${extractPath}`);

    // Step 1: Fix user permission - Copy network extension plist files
    core.info("Step 1: Setting network extension permissions...");
    let cmd = "sudo";
    let args = [
      "cp",
      path.join(__dirname, "com.apple.networkextension.plist"),
      "/Library/Preferences/com.apple.networkextension.plist",
    ];
    cp.execFileSync(cmd, args);
    core.info("✓ Copied com.apple.networkextension.plist to /Library/Preferences");

    args = [
      "cp",
      path.join(__dirname, "com.apple.networkextension.necp.plist"),
      "/Library/Preferences/com.apple.networkextension.necp.plist",
    ];
    cp.execFileSync(cmd, args);
    core.info("✓ Copied com.apple.networkextension.necp.plist to /Library/Preferences");
    core.info("✓ Step 1 completed: Network extension permissions set");

    // Step 2: Install Agent3.app to /Applications
    core.info("Step 2: Installing Agent3.app...");
    const agentAppPath = path.join(extractPath, "Agent3.app");
    core.info(`Agent app path: ${agentAppPath}`);
    cp.execSync(`sudo cp -r "${agentAppPath}" /Applications/`);
    core.info("✓ Successfully copied Agent3.app to /Applications");
    core.info("✓ Step 2 completed: Agent3.app installed");

    // Launch the agent with log file
    core.info("Launching Agent3...");
    if (!fs.existsSync("/Applications/Agent3.app/Contents/MacOS/Agent3")) {
      core.warning("✗ Agent3 binary not found at expected path");
    } else {
      core.info("✓ Agent3 binary verified at /Applications/Agent3.app/Contents/MacOS/Agent3");
    }
    cp.execSync(
      "sudo /Applications/Agent3.app/Contents/MacOS/Agent3 >> /tmp/agent.log 2>&1 &",
      {
        shell: "/bin/bash",
      }
    );
    core.info("✓ Agent3 launched in background");

    // Step 3: Fix user permission - Modify system extensions database
    core.info("Step 3: Modifying system extensions database...");
    core.info("Waiting 5 seconds for system extension to initialize...");
    cp.execSync("sleep 3");
    core.info("✓ Wait completed");

    core.info("Converting db.plist to xml1 format...");
    cp.execSync("sudo plutil -convert xml1 /Library/SystemExtensions/db.plist");
    core.info("✓ Successfully converted db.plist to xml1");

    core.info("Modifying system extension state...");
    cp.execSync(
      "sudo sed -i -e 's/activated_waiting_for_user/activated_enabling/g' /Library/SystemExtensions/db.plist"
    );
    core.info("✓ Successfully modified system extension state");

    core.info("Converting db.plist back to binary1 format...");
    cp.execSync(
      "sudo plutil -convert binary1 /Library/SystemExtensions/db.plist"
    );
    core.info("✓ Successfully converted db.plist to binary1");

    core.info("Checking Agent3 processes...");
    cp.execSync("sudo pgrep -fl Agent3 >> /tmp/agent.log");
    core.info("✓ Agent3 process status logged");
    // cp.execSync("sudo pgrep -fl step >> /tmp/agent.log")

    core.info("Killing Agent3 process...");
    cp.execSync("sudo killall -9 Agent3");
    core.info("✓ Agent3 process terminated");

    var content = fs.readFileSync("/tmp/agent.log", "utf-8");
    console.log("Agent log contents:");
    console.log(content);
    core.info("✓ Agent log read and displayed");

    core.info("Restarting sysextd...");
    cp.execSync("sudo launchctl kickstart -k system/com.apple.sysextd");
    core.info("✓ sysextd restarted");
    core.info("✓ Step 3 completed: System extensions database modified");

    // Recopy the plist files
    core.info("Recopying network extension plist files...");
    args = [
      "cp",
      path.join(__dirname, "com.apple.networkextension.plist"),
      "/Library/Preferences/com.apple.networkextension.plist",
    ];
    cp.execFileSync(cmd, args);
    core.info("✓ Recopied com.apple.networkextension.plist");

    args = [
      "cp",
      path.join(__dirname, "com.apple.networkextension.necp.plist"),
      "/Library/Preferences/com.apple.networkextension.necp.plist",
    ];
    cp.execFileSync(cmd, args);
    core.info("✓ Recopied com.apple.networkextension.necp.plist");

    // Step 4: Relaunch Agent3
    core.info("Step 4: Relaunching Agent3...");
    cp.execSync(
      "sudo /Applications/Agent3.app/Contents/MacOS/Agent3 >> /tmp/agent.log 2>&1 &",
      {
        shell: "/bin/bash",
      }
    );
    core.info("✓ Agent3 relaunched successfully");
    core.info("✓ Step 4 completed: Agent3 is now running");

    core.info("✓ macOS agent installation completed successfully");
    return true;
  } catch (error) {
    core.error(`Failed to install macOS agent: ${error}`);
    return false;
  }
}
