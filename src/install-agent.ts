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
    // Disable gatekeeper
    core.info("Disabling gatekeeper");
    cp.execSync("sudo spctl --master-disable");

    // Download the Agent3.app package from placeholder URL
    // TODO: Update this URL with the actual release URL
    const downloadUrl =
      "https://github.com/h0x0er/playground/releases/download/v0.0.2/Agent3.tar.gz";
    core.info("Downloading macOS agent...");
    const downloadPath = await tc.downloadTool(downloadUrl, undefined, auth);

    // Extract the downloaded package
    const extractPath = await tc.extractTar(downloadPath);

    // Step 1: Fix user permission - Copy network extension plist files
    core.info("Step 1: Setting network extension permissions...");
    let cmd = "sudo";
    let args = [
      "cp",
      path.join(__dirname, "com.apple.networkextension.plist"),
      "/Library/Preferences/com.apple.networkextension.plist",
    ];
    cp.execFileSync(cmd, args);

    args = [
      "cp",
      path.join(__dirname, "com.apple.networkextension.necp.plist"),
      "/Library/Preferences/com.apple.networkextension.necp.plist",
    ];
    cp.execFileSync(cmd, args);

    // Step 2: Install Agent3.app to /Applications
    core.info("Step 2: Installing Agent3.app...");
    const agentAppPath = path.join(extractPath, "Agent3.app");
    cp.execSync(`sudo cp -r "${agentAppPath}" /Applications/`);

    // Write config file
    fs.writeFileSync("/tmp/agent.json", confgStr);

    // Launch the agent with log file
    core.info("Launching Agent3...");
    if (!fs.existsSync("/Applications/Agent3.app/Contents/MacOS/Agent3")) {
      core.warning("agent not present");
    }
    cp.execSync(
      "sudo /Applications/Agent3.app/Contents/MacOS/Agent3 >> /tmp/agent.log 2>&1 &",
      {
        shell: "/bin/bash",
      }
    );

    // Step 3: Fix user permission - Modify system extensions database
    core.info("Step 3: Modifying system extensions database...");
    cp.execSync("sleep 2");
    cp.execSync("sudo plutil -convert xml1 /Library/SystemExtensions/db.plist");
    cp.execSync(
      "sudo sed -i -e 's/activated_waiting_for_user/activated_enabling/g' /Library/SystemExtensions/db.plist"
    );
    cp.execSync(
      "sudo plutil -convert binary1 /Library/SystemExtensions/db.plist"
    );
    cp.execSync("sudo killall -9 Agent3");
    cp.execSync("sudo launchctl kickstart -k system/com.apple.sysextd");

    // Recopy the plist files
    args = [
      "cp",
      path.join(__dirname, "com.apple.networkextension.plist"),
      "/Library/Preferences/com.apple.networkextension.plist",
    ];
    cp.execFileSync(cmd, args);

    args = [
      "cp",
      path.join(__dirname, "com.apple.networkextension.necp.plist"),
      "/Library/Preferences/com.apple.networkextension.necp.plist",
    ];
    cp.execFileSync(cmd, args);

    // Step 4: Relaunch Agent3
    core.info("Step 4: Relaunching Agent3...");
    cp.execSync(
      "sudo /Applications/Agent3.app/Contents/MacOS/Agent3 >> /tmp/agent.log 2>&1 &",
      {
        shell: "/bin/bash",
      }
    );

    core.info("macOS agent installation completed successfully");
    return true;
  } catch (error) {
    core.error(`Failed to install macOS agent: ${error}`);
    return false;
  }
}
