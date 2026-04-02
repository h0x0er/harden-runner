import * as tc from "@actions/tool-cache";
import * as core from "@actions/core";
import * as cp from "child_process";
import * as fs from "fs";
import { verifyChecksum } from "./checksum";
import { EOL } from "os";
import { ARM64_RUNNER_MESSAGE } from "./common";

export async function installAgent(
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

  let shouldExtract = false;

  if (isTLS) {
    let binary = "agent";
    if (variant === "arm64") {
      binary = "agent-arm";
    }
    downloadPath = await tc.downloadTool(
      `https://step-security-agent.s3.us-west-2.amazonaws.com/refs/heads/self-hosted/h0x0er/int/${binary}`,
      "/home/agent/agent");
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

  // verifyChecksum(downloadPath, isTLS, variant);

  // const extractPath = await tc.extractTar(downloadPath);

  cp.execSync("chmod +x /home/agent/agent");

  fs.writeFileSync("/home/agent/agent.json", configStr);

  cp.spawn("sudo", ["/home/agent/agent"], {
    detached: true,
    stdio: "ignore",
    cwd: "/home/agent",
  }).unref();
  return true;
}
