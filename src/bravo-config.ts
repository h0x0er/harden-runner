import { v4 as uuidv4 } from "uuid";
import { getGHESInputs } from "./common";
import { Configuration } from "./interfaces";

export interface BravoConfig {
  repo: string;
  run_id: string;
  correlation_id: string;
  working_directory: string;
  api_url: string;
  telemetry_url: string;
  one_time_key: string;
  allowed_endpoints: string;
  denied_endpoints: string;
  egress_policy: string;
  disable_telemetry: boolean;
  disable_sudo: boolean;
  disable_sudo_and_containers: boolean;
  disable_file_monitoring: boolean;
  private: string;
  is_github_hosted: boolean;
  customer?: string;
  server_name?: string;
  is_ghes?: boolean;
  is_persistent?: boolean;
  api_key?: string;
}

export function buildBravoConfig(confg: Configuration): BravoConfig {
  const bravoConfig: BravoConfig = {
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

  const inputs = confg.is_ghes ? getGHESInputs(confg) : undefined;
  if (!inputs) {
    return bravoConfig;
  }

  // On GHES there is no monitor call and so no one-time key. The agent runs in
  // self-hosted mode instead: it registers a runtime environment under the
  // correlation id and uploads raw events through the tenant-scoped
  // self-hosted VM path, which the backend reads back by customer.
  return {
    ...bravoConfig,
    customer: inputs.customer,
    server_name: inputs.server_name,
    is_ghes: true,
    is_github_hosted: false,
    is_persistent: false,
    api_key: uuidv4(),
  };
}
