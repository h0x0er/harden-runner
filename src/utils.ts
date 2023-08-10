import * as fs from "fs";

export function patchDockerConfig() {
  let docker_config_file = "/home/runner/.docker/config.json";

  let rawdata = fs.readFileSync(docker_config_file);

  let config = JSON.parse(rawdata.toString());

  config["proxies"] = {
    default: {
      httpProxy: "http://0.0.0.0:8080",
      httpsProxy: "https://0.0.0.0:8080",
    },
  };

  let new_config = JSON.stringify(config);
  console.log(`Docker Config: ${new_config}`);

  fs.writeFileSync(docker_config_file, new_config);
}
