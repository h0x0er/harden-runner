import { STEPSECURITY_API_URL } from "./configs";
import * as core from "@actions/core";
import { isGHES } from "./common";

export async function isTLSEnabled(owner: string): Promise<boolean> {
  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";
  let tlsStatusOwner = owner;

  if (isGHES(serverUrl)) {
    const customer = core.getInput("customer");
    const serverName = core.getInput("server-name");

    if (!customer || !serverName) {
      core.info("[!] customer and server-name inputs are required to check TLS_STATUS in GitHub Enterprise Server (GHES) environments.");
      return false;
    }

    tlsStatusOwner = `${customer}::${serverName}::${owner}`;
  }

  const tlsStatusEndpoint = `${STEPSECURITY_API_URL}/github/${tlsStatusOwner}/actions/tls-inspection-status`;
  const requestOptions: RequestInit = {
    signal: AbortSignal.timeout(5000),
  };

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
