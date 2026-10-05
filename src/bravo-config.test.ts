import { buildBravoConfig } from "./bravo-config";
import { Configuration } from "./interfaces";

const base: Configuration = {
  repo: "org/repo",
  run_id: "123",
  correlation_id: "depot-abc",
  working_directory: "/w",
  api_url: "https://int.api.stepsecurity.io/v1",
  telemetry_url: "https://int.app-api.stepsecurity.io/v1",
  allowed_endpoints: "github.com:443",
  denied_endpoints: "bad.example.com:443",
  egress_policy: "audit",
  disable_telemetry: false,
  disable_sudo: false,
  disable_sudo_and_containers: false,
  disable_file_monitoring: false,
  is_github_hosted: false,
  private: "true" as unknown as string,
  is_debug: false,
  one_time_key: "otk-xyz",
  api_key: "tenant-key",
  use_policy_store: false,
  deploy_on_self_hosted_vm: false,
  is_ghes: false,
};

describe("buildBravoConfig", () => {
  test("forces is_github_hosted=true so agent honors passed correlation_id", () => {
    expect(buildBravoConfig(base).is_github_hosted).toBe(true);
  });

  test("omits api_key on github.com (agent authenticates via one_time_key, not vm-api-key)", () => {
    expect(buildBravoConfig(base)).not.toHaveProperty("api_key");
  });

  test("omits customer on github.com (server infers tenant from repo)", () => {
    expect(buildBravoConfig(base)).not.toHaveProperty("customer");
  });

  test("omits use_policy_store (action-side concern, not agent)", () => {
    expect(buildBravoConfig(base)).not.toHaveProperty("use_policy_store");
  });

  test("forwards telemetry_url so network events hit configured env", () => {
    expect(buildBravoConfig(base).telemetry_url).toBe(base.telemetry_url);
  });

  test("forwards one_time_key so agent can auth to presigned URL endpoint", () => {
    expect(buildBravoConfig(base).one_time_key).toBe("otk-xyz");
  });

  test("forwards repo, run_id, correlation_id so server can attribute events", () => {
    const cfg = buildBravoConfig(base);
    expect(cfg.repo).toBe("org/repo");
    expect(cfg.run_id).toBe("123");
    expect(cfg.correlation_id).toBe("depot-abc");
  });

  test("forwards private flag", () => {
    expect(buildBravoConfig(base).private).toBe(base.private);
  });

  test("forwards egress_policy and allowed_endpoints", () => {
    const cfg = buildBravoConfig(base);
    expect(cfg.egress_policy).toBe("audit");
    expect(cfg.allowed_endpoints).toBe("github.com:443");
  });

  test("forwards denied_endpoints", () => {
    expect(buildBravoConfig(base).denied_endpoints).toBe("bad.example.com:443");
  });

  test("forwards disable_* flags", () => {
    const cfg = buildBravoConfig({
      ...base,
      disable_telemetry: true,
      disable_sudo: true,
      disable_sudo_and_containers: true,
      disable_file_monitoring: true,
    });
    expect(cfg.disable_telemetry).toBe(true);
    expect(cfg.disable_sudo).toBe(true);
    expect(cfg.disable_sudo_and_containers).toBe(true);
    expect(cfg.disable_file_monitoring).toBe(true);
  });
});

describe("buildBravoConfig on GHES", () => {
  const ghes: Configuration = {
    ...base,
    repo: "test-org/widgets",
    correlation_id: "depot-abc",
    is_ghes: true,
    customer: "example-customer",
    server_name: "example-server",
  };

  test("runs the agent in GHES self-hosted mode", () => {
    const cfg = buildBravoConfig(ghes);
    expect(cfg.customer).toBe("example-customer");
    expect(cfg.server_name).toBe("example-server");
    expect(cfg.is_ghes).toBe(true);
    expect(cfg.is_github_hosted).toBe(false);
    expect(cfg.is_persistent).toBe(false);
  });

  test("sets a generated api_key so the agent uses the self-hosted VM upload path", () => {
    const cfg = buildBravoConfig(ghes);
    expect(typeof cfg.api_key).toBe("string");
    expect(cfg.api_key).not.toBe("");
    expect(cfg.api_key).not.toBe(base.api_key);
  });

  test("keeps the bare repo and the runner-name correlation id", () => {
    const cfg = buildBravoConfig(ghes);
    expect(cfg.repo).toBe("test-org/widgets");
    expect(cfg.correlation_id).toBe("depot-abc");
  });

  test("falls back to the github.com shape when GHES inputs are missing", () => {
    for (const cfg of [
      buildBravoConfig({ ...ghes, customer: "" }),
      buildBravoConfig({ ...ghes, server_name: undefined }),
    ]) {
      expect(cfg.is_github_hosted).toBe(true);
      expect(cfg).not.toHaveProperty("customer");
      expect(cfg).not.toHaveProperty("is_ghes");
      expect(cfg).not.toHaveProperty("api_key");
    }
  });
});

describe("buildBravoConfig on github.com", () => {
  test("omits GHES identity and self-hosted fields", () => {
    const cfg = buildBravoConfig({ ...base, customer: "example-customer", server_name: "example-server" });
    for (const key of ["customer", "server_name", "is_ghes", "is_persistent", "api_key"]) {
      expect(cfg).not.toHaveProperty(key);
    }
    expect(cfg.is_github_hosted).toBe(true);
  });
});
