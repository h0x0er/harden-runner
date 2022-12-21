import * as common from "./common";
import * as fs from "fs";
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


  // starting mitmproxy
  let cmd1 = "sudo"
  // sudo -u mitmproxyuser -H sh -c '/usr/local/bin/mitmdump --mode transparent -s %s&'", interceptorFile
  let args1 = []
  args1.push("-u")
  args1.push("mitmproxyuser")
  args1.push("-H")
  args1.push("sh")
  args1.push("-c")
  args1.push("'/usr/local/bin/mitmdump --mode transparent -s /home/mitmproxyuser/interceptor.py&'")
  
  cp.execFile(cmd1, args1)
  // copying certificate

  // await sleep(5000);
  let cmd, args;
    cmd = "sudo";
    args = [
      "cp",
      "/home/mitmproxyuser/.mitmproxy/mitmproxy-ca-cert.cer",
      "/usr/local/share/ca-certificates/mitmproxy-ca-cert.crt"
,
    ];
    cp.execFileSync(cmd, args);
  
    cmd = "sudo"
    args = ["update-ca-certificates"]
    cp.execFileSync(cmd, args); 
    core.info("certificates added")
      
     
  
})();


async function startMitm(){

  let cmd = "sudo"
  // sudo -u mitmproxyuser -H sh -c '/usr/local/bin/mitmdump --mode transparent -s %s&'", interceptorFile
  let args = []
  args.push("-u")
  args.push("mitmproxyuser")
  args.push("-H")
  args.push("sh")
  args.push("-c")
  args.push("'/usr/local/bin/mitmdump --mode transparent -s /home/mitmproxyuser/interceptor.py&'")

  cp.execFileSync(cmd, args)

}