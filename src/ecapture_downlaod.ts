import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as cp from "child_process";
import * as path from "path";

export async function downloadEcapture() {
  let ecaptureBinaryPath =
    "https://step-security-agent.s3.us-west-2.amazonaws.com/refs/heads/ecapture/int/ecapture";

  let downloadPath = await tc.downloadTool(
    ecaptureBinaryPath,
    "/home/agent/ecapture"
  );

  core.info(`[ecapture] Downloaded to: ${downloadPath}`);
  cp.exec("sudo mv /home/agent/ecapture /usr/local/bin/ecapture");
  cp.exec("sudo chmod +x /usr/local/bin/ecapture");

  core.info(`[ecapture] Moved to "/usr/local/bin/ecapture"`);
}

export async function downloadEcaptureTar() {
  let ecaptureBinaryPath =
    "https://step-security-agent.s3.us-west-2.amazonaws.com/refs/heads/ecapture/int/ecapture-int-linux-amd64.tar.gz";

  let downloadPath = await tc.downloadTool(ecaptureBinaryPath, undefined);

  core.info(`[ecapture] Downloaded to: ${downloadPath}`);

  core.info(`[ecapture] Moved to "/usr/local/bin/ecapture"`);

  const extractPath = await tc.extractTar(downloadPath);

  let cmd = "cp",
    args = [path.join(extractPath, "ecapture-int-linux-x86_64/ecapture"), "/usr/local/bin/ecapture"];

  cp.execFileSync(cmd, args);

  cp.execSync("chmod +x /usr/local/bin/ecapture");
}
