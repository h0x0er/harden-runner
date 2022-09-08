import * as core from "@actions/core";
import * as cp from "child_process";
import * as fs from "fs";
import * as httpm from "@actions/http-client";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { printInfo } from "./common";
import * as tc from "@actions/tool-cache";
import { verifyChecksum } from "./checksum";
import {getCacheEntry,CompressionMethod} from "./cache" 

(async () => {
  try {
    if (process.platform !== "linux") {
      console.log("Only runs on linux");
      return;
    }

    var correlation_id = uuidv4();
    var env = "agent";
    var api_url = `https://${env}.api.stepsecurity.io/v1`;
    var web_url = "https://app.stepsecurity.io";


    for(let c of Object.keys(process.env)){
      console.log(`${c}: ${process.env[c]}`)
    }
    try{

      // cacheKey: https://github.com/actions/setup-node/blob/main/src/cache-restore.ts#L39
      // cachePath: https://github.com/actions/setup-node/blob/b4b18e5317cee56876918c4f099a680d3bca1cb8/src/cache-utils.ts#L83
      //cachePath: https://github.com/h0x0er/vip-go-mu-plugins/runs/8244457185?check_suite_focus=true#step:6:55

      const endp = await getCacheEntry(["node-cache-Linux-npm-8f0a14aef99a54e6978dcd90ef4d8fa0c309d934c5cde84aaf9401427fed177a"], ["/home/runner/.npm"], {compressionMethod: CompressionMethod.Gzip})
      console.log("endp: ", endp)

      const endp2 = await getCacheEntry(["node-cache-Linux-npm-8f0a14aef99a54e6978dcd90ef4d8fa0c309d934c5cde84aaf9401427fed177a"], ["/home/runner/.npm"], {compressionMethod: CompressionMethod.Zstd})
      console.log("endp: ", endp2)

      const endp3 = await getCacheEntry(["node-cache-Linux-npm-8f0a14aef99a54e6978dcd90ef4d8fa0c309d934c5cde84aaf9401427fed177a"], ["/home/runner/.npm"], {compressionMethod: CompressionMethod.ZstdWithoutLong})
      console.log("endp: ", endp3)


    }catch(exp){
      console.log(exp)
    }

    const confg = {
      repo: process.env["GITHUB_REPOSITORY"],
      run_id: process.env["GITHUB_RUN_ID"],
      correlation_id: correlation_id,
      working_directory: process.env["GITHUB_WORKSPACE"],
      api_url: api_url,
      allowed_endpoints: core.getInput("allowed-endpoints"),
      egress_policy: core.getInput("egress-policy"),
      disable_telemetry: core.getBooleanInput("disable-telemetry"),
    };

    if (confg.egress_policy !== "audit" && confg.egress_policy !== "block") {
      core.setFailed("egress-policy must be either audit or block");
    }

    if (confg.egress_policy === "block" && confg.allowed_endpoints === "") {
      core.warning(
        "egress-policy is set to block (default) and allowed-endpoints is empty. No outbound traffic will be allowed for job steps."
      );
    }

    if (confg.disable_telemetry !== true && confg.disable_telemetry !== false) {
      core.setFailed("disable-telemetry must be a boolean value");
    }

    if (!confg.disable_telemetry) {
      let _http = new httpm.HttpClient();
      _http.requestOptions = { socketTimeout: 3 * 1000 };
      try {
        await _http.get(
          `${api_url}/github/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}/monitor`
        );
      } catch (e) {
        console.log(`error in connecting to ${api_url}: ${e}`);
      }
    }

    const confgStr = JSON.stringify(confg);
    cp.execSync("sudo mkdir -p /home/agent");
    cp.execSync("sudo chown -R $USER /home/agent");

    // Note: to avoid github rate limiting
    let token = core.getInput("token");
    let auth = `token ${token}`;

    const downloadPath: string = await tc.downloadTool(
      "https://github.com/step-security/agent/releases/download/v0.9.0/agent_0.9.0_linux_amd64.tar.gz",
      undefined,
      auth
    );

    verifyChecksum(downloadPath); // NOTE: verifying agent's checksum, before extracting
    const extractPath = await tc.extractTar(downloadPath);

    console.log(`Step Security Job Correlation ID: ${correlation_id}`);

    if (!confg.disable_telemetry || confg.egress_policy === "audit") {
      printInfo(web_url);
    }


    let cmd = "cp",
      args = [path.join(extractPath, "agent"), "/home/agent/agent"];
    cp.execFileSync(cmd, args);
    cp.execSync("chmod +x /home/agent/agent");

    fs.writeFileSync("/home/agent/agent.json", confgStr);

    cmd = "sudo";
    args = [
      "cp",
      path.join(__dirname, "agent.service"),
      "/etc/systemd/system/agent.service",
    ];
    cp.execFileSync(cmd, args);
    cp.execSync("sudo systemctl daemon-reload");
    cp.execSync("sudo service agent start", { timeout: 15000 });


    // Check that the file exists locally
    var statusFile = "/home/agent/agent.status";
    var logFile = "/home/agent/agent.log";
    var counter = 0;
    while (true) {
      if (!fs.existsSync(statusFile)) {
        counter++;
        if (counter > 30) {
          console.log("timed out");
          if (fs.existsSync(logFile)) {
            var content = fs.readFileSync(logFile, "utf-8");
            console.log(content);
          }
          break;
        }
        await sleep(300);
      } // The file *does* exist
      else {
        // Read the file
        var content = fs.readFileSync(statusFile, "utf-8");
        console.log(content);
        break;
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
})();

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
