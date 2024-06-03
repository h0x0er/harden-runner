import * as tc from "@actions/tool-cache";
import * as path from "path";
import * as cp from "child_process";

export async function installTLSCapture(env: string) {
  let shouldExtract: boolean = false;
  let downloadURL: string =
    "https://step-security-agent.s3.us-west-2.amazonaws.com/refs/heads/ecapture/int";
  let downloadPath: string;
  switch (env) {
    case "int":
      downloadURL += "/ecapture-int-linux-amd64.tar.gz";

      downloadPath = await tc.downloadTool(downloadURL);

      shouldExtract = true;
    case "int-pull":
      downloadURL += "/ecapture";
      downloadPath = await tc.downloadTool(downloadURL, "/home/agent/ecapture");

    case "prod":
    case "agent":
      console.log(`[installTLS] agent will install daemon`);
      return;
  }

  let cmd, args;
  if (shouldExtract) {
    const extractPath = await tc.extractTar(downloadPath);
    (cmd = "cp"),
      (args = [path.join(extractPath, "ecapture"), "/home/agent/ecapture"]);
    cp.execFileSync(cmd, args);
  }

  cp.execSync("chmod +x /home/agent/ecapture");
  console.log(`[installTLS] daemon(${env}) downloaded.`);
}
