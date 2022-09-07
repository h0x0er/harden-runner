import * as core from '@actions/core'
import {HttpClient} from '@actions/http-client'
import * as crypto from 'crypto'
import { RequestOptions } from 'https'

const versionSalt = '1.0'

export function getCacheApiUrl(resource: string): string {
  const baseUrl: string = process.env['ACTIONS_CACHE_URL'] || ''
  if (!baseUrl) {
    throw new Error('Cache Service Url not found, unable to restore cache.')
  }

  const url = `${baseUrl}_apis/artifactcache/${resource}`
  core.info(`Resource Url: ${url}`)
  return url
}

function createAcceptHeader(type: string, apiVersion: string): string {
  return `${type};api-version=${apiVersion}`
}

function getRequestOptions(): RequestOptions {
const token = process.env['ACTIONS_RUNTIME_TOKEN'] || ''

  const requestOptions: RequestOptions = {
    headers: {
      Accept: createAcceptHeader('application/json', '6.0-preview.1'),
      Authorization: `Bearer ${token}`,
    }
  }

  return requestOptions
}

function createHttpClient(): HttpClient {

  return new HttpClient(
    'actions/cache',
    [],
    getRequestOptions(),
  )
}

export function getCacheVersion(
  paths: string[],
  compressionMethod?: string
): string {
  const components = paths.concat(
    !compressionMethod || compressionMethod === "gzip"
      ? []
      : [compressionMethod]
  )

  // Add salt to cache version to support breaking changes in cache entry
  components.push(versionSalt)

  return crypto
    .createHash('sha256')
    .update(components.join('|'))
    .digest('hex')
}

export async function getCacheEntry(
  keys: string[],
  paths: string[],
  options: any
){
  const httpClient = createHttpClient()
  const version = getCacheVersion(paths, "gzip")
  const resource = `cache?keys=${encodeURIComponent(
    keys.join(',')
  )}&version=${version}`

  const response = await httpClient.getJson(getCacheApiUrl(resource))
  
  if (response.statusCode === 204) {
    return null
  }


  const cacheResult = response.result

  core.info(`${cacheResult}`)
}


