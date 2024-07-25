import * as tc from "@actions/tool-cache";
import * as core from "@actions/core";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";

export async function installAgent(
  env: string,
  agentTLS: boolean,
  configStr: string
) {
  // Note: to avoid github rate limiting
  let token = core.getInput("token");
  let auth = `token ${token}`;

  let isTLS: boolean = agentTLS;
  let shouldExtract: boolean = false;

  let downloadPath: string;
  let variant = "arm64";
  if (process.arch === "x64") {
    variant = "amd64";
  }

  if (isTLS) {
    switch (env) {
      case "prod":
        downloadPath = await tc.downloadTool(
          `https://packages.stepsecurity.io/github-hosted/harden-runner_1.2.3_linux_${variant}.tar.gz`
        );
        shouldExtract = true;
        break;
      case "int":
        downloadPath = await tc.downloadTool(
          `https://step-security-agent.s3.us-west-2.amazonaws.com/refs/heads/self-hosted/int/agent_linux_${variant}.tar.gz`
        );
        shouldExtract = true;
        break;

      case "int-pull":
        let binary = "agent";
        if (variant === "arm64") {
          binary = "agent-arm";
        }
        downloadPath = await tc.downloadTool(
          `https://step-security-agent.s3.us-west-2.amazonaws.com/refs/heads/self-hosted/int/${binary}`,
          "/home/agent/agent"
        );
        shouldExtract = false;
        break;
    }

    // verifyChecksum(downloadPath, true); // NOTE: verifying tls_agent's checksum, before extracting
  } else {
    downloadPath = await tc.downloadTool(
      "https://github.com/step-security/agent/releases/download/v0.13.5/agent_0.13.5_linux_amd64.tar.gz",
      undefined,
      auth
    );

    // verifyChecksum(downloadPath, false); // NOTE: verifying agent's checksum, before extracting
  }

  let cmd, args;
  if (shouldExtract) {
    const extractPath = await tc.extractTar(downloadPath);
    (cmd = "cp"),
      (args = [path.join(extractPath, "agent"), "/home/agent/agent"]);
    cp.execFileSync(cmd, args);
  }

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
  console.log(`[installAgent] agent(${env}) of ${variant} downloaded.`);
}
