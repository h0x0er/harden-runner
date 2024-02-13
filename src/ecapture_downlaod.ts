import * as core from "@actions/core";
import * as tc from "@actions/tool-cache";
import * as cp from "child_process";

export async function downloadEcapture() {
  let ecaptureBinaryPath =
    "https://github.com/h0x0er/playground/releases/download/v0.0.1/ecapture";

  let downloadPath = await tc.downloadTool(ecaptureBinaryPath, "/home/agent");

  core.info(`[ecapture] Downloaded to: ${downloadPath}`);
  cp.exec("sudo mv /home/agent/ecapture /usr/local/bin/ecapture");
  core.info(`[ecapture] Moved to "/usr/local/bin/ecapture"`);
}
