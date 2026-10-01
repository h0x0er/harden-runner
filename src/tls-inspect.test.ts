import { STEPSECURITY_API_URL } from "./configs";
import { isGHES } from "./common";
import { isTLSEnabled } from "./tls-inspect";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  delete process.env.GITHUB_SERVER_URL;
});

function mockFetch(impl: typeof fetch) {
  globalThis.fetch = impl as typeof fetch;
}

test("tls-inspect enabled", async () => {
  const owner = "h0x0er";
  const expectedUrl = `${STEPSECURITY_API_URL}/github/${owner}/actions/tls-inspection-status`;

  mockFetch(async (url) => {
    expect(String(url)).toBe(expectedUrl);
    return new Response("", { status: 200 });
  });

  const got = await isTLSEnabled(owner);
  expect(got).toBe(true);
});

test("tls-inspect not enabled", async () => {
  const owner = "step-security";

  mockFetch(async () => new Response("unauthorized", { status: 401 }));

  const got = await isTLSEnabled(owner);
  expect(got).toBe(false);
});

test("tls-inspect sends GHES server URL", async () => {
  const owner = "ghes-org";
  const serverUrl = "https://github.example.com";
  const expectedUrl = `${STEPSECURITY_API_URL}/github/${owner}/actions/tls-inspection-status`;
  process.env.GITHUB_SERVER_URL = serverUrl;

  mockFetch(async (url, init) => {
    expect(String(url)).toBe(expectedUrl);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({"content-type": "application/json"});
    expect(init?.body).toBe(JSON.stringify({ghes_server: serverUrl}));
    return new Response("", { status: 200 });
  });

  const got = await isTLSEnabled(owner);
  expect(got).toBe(true);
});

test("isGHES returns false for GitHub.com", () => {
  expect(isGHES()).toBe(false);
  expect(isGHES("https://github.com")).toBe(false);
});

test("isGHES returns true for GitHub Enterprise Server", () => {
  process.env.GITHUB_SERVER_URL = "https://github.example.com";

  expect(isGHES()).toBe(true);
  expect(isGHES("https://github.enterprise.local")).toBe(true);
});

test("isTLSEnabled returns true within ~5s when server is slow (regression test for AggregateError)", async () => {
  const owner = "slow-org";

  mockFetch((_url, init) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        if (signal.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }
    });
  });

  const start = Date.now();
  const result = await isTLSEnabled(owner);
  const elapsed = Date.now() - start;

  expect(result).toBe(true);
  expect(elapsed).toBeLessThan(5500);
}, 10_000);

test("isTLSEnabled returns true on connection error without hanging", async () => {
  const owner = "broken-org";

  mockFetch(async () => {
    const err = new TypeError("fetch failed");
    (err as Error & { cause?: unknown }).cause = Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" });
    throw err;
  });

  const start = Date.now();
  const result = await isTLSEnabled(owner);
  const elapsed = Date.now() - start;

  expect(result).toBe(true);
  expect(elapsed).toBeLessThan(5500);
});
