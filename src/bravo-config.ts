import { getGHESInputs } from "./common";
import { Configuration } from "./interfaces";

// ghesQualifiedRepo returns the repo agent-bravo should report events under.
// On GHES the org name alone is not unique across tenants, and the bravo config
// carries no customer or server-name, so the tenant is encoded into the owner
// segment as customer::server-name::org. The agent builds every API URL from
// this value, including the presigned raw-events upload, which the backend reads
// back under the same qualified owner.
export function ghesQualifiedRepo(confg: Configuration): string {
  if (!confg.is_ghes) {
    return confg.repo;
  }

  const inputs = getGHESInputs(confg);
  const [owner, repoName] = (confg.repo || "").split("/");
  if (!inputs || !owner || !repoName || owner.includes("::")) {
    return confg.repo;
  }

  return `${inputs.customer}::${inputs.server_name}::${owner}/${repoName}`;
}

export function buildBravoConfig(confg: Configuration) {
  return {
    repo: confg.repo,
    run_id: confg.run_id,
    correlation_id: confg.correlation_id,
    working_directory: confg.working_directory,
    api_url: confg.api_url,
    telemetry_url: confg.telemetry_url,
    one_time_key: confg.one_time_key,
    allowed_endpoints: confg.allowed_endpoints,
    denied_endpoints: confg.denied_endpoints,
    egress_policy: confg.egress_policy,
    disable_telemetry: confg.disable_telemetry,
    disable_sudo: confg.disable_sudo,
    disable_sudo_and_containers: confg.disable_sudo_and_containers,
    disable_file_monitoring: confg.disable_file_monitoring,
    private: confg.private,
    is_github_hosted: true,
  };
}
