import * as fs from "fs";
import * as cp from "child_process";
import * as core from "@actions/core";

export function patchDockerConfig() {
  let docker_config_file = "/etc/docker/daemon.json";

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

export function addCertEnvs() {
  let cert_path = "/home/mitmproxyuser/.mitmproxy/mitmproxy-ca-cert.pem";
  
  // adding env for node
  core.exportVariable("NODE_EXTRA_CA_CERTS", cert_path);

  // adding env for python requests
  core.exportVariable("REQUESTS_CA_BUNDLE", cert_path);

  // adding env for golang
  core.exportVariable("SSL_CERT_FILE", cert_path);
  core.exportVariable("SSL_CERT_DIR", "/home/mitmproxyuser/.mitmproxy");

  core.info("[!] Added Cert Envs");

}
