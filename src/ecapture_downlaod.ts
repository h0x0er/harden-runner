import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as cp from "child_process";

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
