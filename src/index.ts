import * as common from "./common";
import * as core from "@actions/core";
import isDocker from "is-docker";
import * as cp from "child_process";
import { sleep } from "./setup";


(async () => {
  if (process.platform !== "linux") {
    console.log(common.UBUNTU_MESSAGE);
    return;
  }
  if (isDocker()) {
    console.log(common.CONTAINER_MESSAGE);
    return;
  }

  if (
    core.getBooleanInput("disable-telemetry") &&
    core.getInput("egress-policy") === "block"
  ) {
    console.log(
      "Telemetry will not be sent to StepSecurity API as disable-telemetry is set to true"
    );
  } else {
    var web_url = "https://app.stepsecurity.io";
    common.printInfo(web_url);
  }
  // copying certificate
  let cmd, args;
  sleep(2000);
  cmd = "sudo";
  args = [
    "cp",
    "/home/mitmproxyuser/.mitmproxy/mitmproxy-ca-cert.cer",
    "/usr/local/share/ca-certificates/mitmproxy-ca-cert.crt",
  ];
  cp.execFileSync(cmd, args);

  cmd = "sudo"
  args = ["update-ca-certificates"]
  cp.execFileSync(cmd, args);

  core.exportVariable("NODE_EXTRA_CA_CERTS", "/home/mitmproxyuser/.mitmproxy/mitmproxy-ca.pem")

})();
