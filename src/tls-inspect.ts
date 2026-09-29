import { STEPSECURITY_API_URL } from "./configs";
import * as core from "@actions/core";

export async function isTLSEnabled(owner: string): Promise<boolean> {
  const tlsStatusEndpoint = `${STEPSECURITY_API_URL}/github/${owner}/actions/tls-inspection-status`;
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  const requestOptions: RequestInit = {
    signal: AbortSignal.timeout(5000),
  };

  if (serverUrl !== "https://github.com") {
    requestOptions.method = "GET";
    requestOptions.headers = {"content-type": "application/json"};
    requestOptions.body = JSON.stringify({ghes_server: serverUrl});
  }

  core.info(`[!] Checking TLS_STATUS: ${owner}`);
  try {
    const resp = await fetch(tlsStatusEndpoint, requestOptions);
    if (resp.status === 200) {
      core.info(`[!] TLS_ENABLED: ${owner}`);
      return true;
    }
    core.info(`[!] TLS_NOT_ENABLED: ${owner}`);
    return false;
  } catch (e) {
    core.info(`[!] Unable to check TLS_STATUS. Defaulting to TLS enabled.`);
    return true;
  }
}

export function isGithubHosted() {
  const runnerEnvironment = process.env.RUNNER_ENVIRONMENT || "";
  return runnerEnvironment === "github-hosted";
}
