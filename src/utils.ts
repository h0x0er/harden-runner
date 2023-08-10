import * as fs from "fs";
import * as cp from "child_process";
import * as core from "@actions/core";

export function patchDockerConfig() {
  let docker_config_file = "/home/runner/.docker/config.json";

  let rawdata = fs.readFileSync(docker_config_file);

  let config = JSON.parse(rawdata.toString());

  config["proxies"] = {
    default: {
      httpProxy: "http://127.0.0.1:8080",
      httpsProxy: "http://127.0.0.1:8080",
    },
  };

  let new_config = JSON.stringify(config);

  fs.writeFileSync(docker_config_file, new_config);

  cp.execSync("sudo service docker restart");

  core.info("[!] Docker config patched");
}
