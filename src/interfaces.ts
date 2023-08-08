export interface Configuration {
  repo: string;
  run_id: string;
  correlation_id: string;
  working_directory: string;
  api_url: string;
  allowed_endpoints: string;
  allowed_paths: string,
  egress_policy: string;
  disable_telemetry: boolean;
  disable_sudo: boolean;
  disable_file_monitoring: boolean;
  private: string;
}

export interface PolicyResponse {
  owner?: string;
  policyName?: string;
  allowed_endpoints?: string[];
  allowed_paths?: string
  disable_sudo?: boolean;
  disable_file_monitoring?: boolean;
  disable_telemetry?: boolean;
  egress_policy?: string;
}
