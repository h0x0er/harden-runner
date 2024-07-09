import * as tc from "@actions/tool-cache";
import * as core from "@actions/core";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { arch } from "os";
import { verifyChecksum } from "./checksum";

export async function installAgent(isTLS: boolean, configStr: string) {
  let downloadPath: string;
  let variant = arch(); // Refer: https://nodejs.org/api/os.html#osarch

  // Note: to avoid github rate limiting
  let token = core.getInput("token");
  let auth = `token ${token}`;

  switch (variant) {
    case "arm64":
      downloadPath = await tc.downloadTool(
        "https://packages.stepsecurity.io/github-hosted/harden-runner_1.2.2_linux_arm64.tar.gz"
      );
      break;

    case "x64":
      if (isTLS) {
        downloadPath = await tc.downloadTool(
          "https://packages.stepsecurity.io/github-hosted/harden-runner_1.2.2_linux_amd64.tar.gz"
        );
      } else {
        downloadPath = await tc.downloadTool(
          "https://github.com/step-security/agent/releases/download/v0.13.5/agent_0.13.7_linux_amd64.tar.gz",
          undefined,
          auth
        );
      }
      break;
    default:
      core.error(`[installAgent] Agent is unavailable for ${variant} arch`);
      break;
  }

  // verifyChecksum(downloadPath, isTLS); // NOTE: verifying tls_agent's checksum, before extracting

  let cmd, args;
  const extractPath = await tc.extractTar(downloadPath);
  (cmd = "cp"), (args = [path.join(extractPath, "agent"), "/home/agent/agent"]);
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

  core.info(`[installAgent] successfully installed ${variant} variant`);
}
