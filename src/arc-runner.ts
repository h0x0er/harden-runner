import * as cp from "child_process";
import * as fs from "fs";
import path from "path";

export function isArcRunner(): boolean {
  const runnerUserAgent = process.env["GITHUB_ACTIONS_RUNNER_EXTRA_USER_AGENT"];

  let isARC = false;

  if (!runnerUserAgent) {
    isARC = false;
  } else {
    isARC = runnerUserAgent.includes("actions-runner-controller/");
  }

  return isARC || isSecondaryPod();
}

function isSecondaryPod(): boolean {
  const workDir = "/__w";
  return fs.existsSync(workDir);
}

function getRunnerTempDir(): string {
  return process.env["RUNNER_TEMP"] || "/tmp";
}

export function sendAllowedEndpoints(endpoints: string): void {
  const allowedEndpoints = endpoints.split(" "); // endpoints are space separated

  for (const endpoint of allowedEndpoints) {
    if (endpoint) {
      let cmdArgs = [];
      let encodedEndpoint = Buffer.from(endpoint).toString("base64");
      cmdArgs.push(
        path.join(getRunnerTempDir(), `step_policy_endpoint_${encodedEndpoint}`)
      );
      echo(cmdArgs);
    }
  }

  if (allowedEndpoints.length > 0) {
    applyPolicy(allowedEndpoints.length);
  }
}

function applyPolicy(count: number): void {
  const fileName = `step_policy_apply_${count}`;

  let cmdArgs = [];
  cmdArgs.push(
    path.join(getRunnerTempDir(), `step_policy_endpoint_${fileName}`)
  );

  echo(cmdArgs);
}

function echo(args: string[]) {
  cp.execFileSync("echo", args);
}
