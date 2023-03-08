import * as core from "@actions/core";
import { HttpClient } from "@actions/http-client";
import { RequestOptions } from "@actions/http-client/lib/interfaces";
import { BearerCredentialHandler } from "@actions/http-client/lib/auth";
import * as crypto from "crypto";
import * as exec from "@actions/exec";
import * as semver from "semver";

const versionSalt = "1.0";
export const cacheKey = "harden-runner-cacheKey";
export const cacheFile = "/home/agent/cache.txt";

function getCacheApiUrl(resource: string): string {
  const baseUrl: string = process.env["ACTIONS_CACHE_URL"] || "";
  if (!baseUrl) {
    throw new Error("Cache Service Url not found, unable to restore cache.");
  }

  const url = `${baseUrl}_apis/artifactcache/${resource}`;
  core.debug(`Resource Url: ${url}`);
  return url;
}

function createAcceptHeader(type: string, apiVersion: string): string {
  return `${type};api-version=${apiVersion}`;
}

function getRequestOptions(): RequestOptions {

  const requestOptions: RequestOptions = {
    headers: {
      Accept: createAcceptHeader("application/json", "6.0-preview.1"),
    },
  };

  return requestOptions;
}

function createHttpClient(): HttpClient {
  const token = process.env["ACTIONS_RUNTIME_TOKEN"] || "";
  const bhandler = new BearerCredentialHandler(token);
  return new HttpClient("actions/cache", [bhandler], getRequestOptions());
}

export function getCacheVersion(
  paths: string[],
  compressionMethod?: CompressionMethod,
  enableCrossOsArchive = false
): string {

  const components = paths;

  if(compressionMethod){
    components.push(compressionMethod);
  }

  if(process.platform === "win32" && !enableCrossOsArchive){
    components.push("windows-only");
  }

  // Add salt to cache version to support breaking changes in cache entry
  components.push(versionSalt);

  return "1463ecb30cd545392d6f2f65a6563babe501e244ccc4961f7dc6efdb40dea70a";
  // return crypto.createHash("sha256").update(components.join("|")).digest("hex");
}

export async function getCompressionMethod(): Promise<CompressionMethod> {
  const versionOutput = await getVersion('zstd', ['--quiet'])
  const version = semver.clean(versionOutput)
  core.debug(`zstd version: ${version}`)

  if (versionOutput === '') {
    return CompressionMethod.Gzip
  } else {
    return CompressionMethod.ZstdWithoutLong
  }
}


async function getVersion(
  app: string,
  additionalArgs: string[] = []
): Promise<string> {
  let versionOutput = ''
  additionalArgs.push('--version')
  core.debug(`Checking ${app} ${additionalArgs.join(' ')}`)
  try {
    await exec.exec(`${app}`, additionalArgs, {
      ignoreReturnCode: true,
      silent: true,
      listeners: {
        stdout: (data: Buffer): string => (versionOutput += data.toString()),
        stderr: (data: Buffer): string => (versionOutput += data.toString())
      }
    })
  } catch (err) {
    core.debug(err.message)
  }

  versionOutput = versionOutput.trim()
  core.debug(versionOutput)
  return versionOutput
}

export async function getCacheEntry(
  keys: string[],
  paths: string[],
  options?: InternalCacheOptions
): Promise<ArtifactCacheEntry | null> {
  const httpClient = createHttpClient();
  const version = getCacheVersion(paths, options?.compressionMethod, options?.enableCrossOsArchive);
  
  const resource = `cache?keys=${encodeURIComponent(
    keys.join(",")
  )}&version=${version}`;

  const response = await httpClient.getJson<ArtifactCacheEntry>(
    getCacheApiUrl(resource)
  );
  if (response.statusCode === 204) {
    throw new Error("Request returned 204 status");
  }
  if (!isSuccessStatusCode(response.statusCode)) {
    throw new Error(`Cache service responded with ${response.statusCode}`);
  }

  const cacheResult = response.result;
  const cacheDownloadUrl = cacheResult?.archiveLocation;
  if (!cacheDownloadUrl) {
    throw new Error("Cache still be done, but  not found.");
  }

  return cacheResult;
}

export interface InternalCacheOptions {
  compressionMethod?: CompressionMethod;
  cacheSize?: number;
  enableCrossOsArchive?:boolean
}

export interface ArtifactCacheEntry {
  cacheKey?: string;
  scope?: string;
  creationTime?: string;
  archiveLocation?: string;
}

function isSuccessStatusCode(statusCode?: number): boolean {
  if (!statusCode) {
    return false;
  }
  return statusCode >= 200 && statusCode < 300;
}

export enum CompressionMethod {
  Gzip = "gzip",
  // Long range mode was added to zstd in v1.3.2.
  // This enum is for earlier version of zstd that does not have --long support
  ZstdWithoutLong = "zstd-without-long",
  Zstd = "zstd",
}
// Refer: https://github.com/actions/cache/blob/12681847c623a9274356751fdf0a63576ff3f846/src/utils/actionUtils.ts#L53
const RefKey = "GITHUB_REF";
export function isValidEvent(): boolean {
  return RefKey in process.env && Boolean(process.env[RefKey]);
}