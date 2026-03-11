import type { Path } from "@david/path";
import { withRetries } from "./_retries.ts";
import { CacheFile } from "./cache.ts";

export interface GitHubRelease {
  url: string;
  name: string;
  tag_name: string;
  published_at: string;
  assets: GitHubReleaseAsset[];
}

export interface GitHubReleaseAsset {
  url: string;
  id: number;
  name: string;
  content_type: string;
  browser_download_url: string;
  created_at: string;
  updated_at: string;
}

export interface FetchGitHubReleasesOptionsWithCache
  extends FetchGitHubReleasesOptions {
  /** File path to store the cache at. */
  cacheFilePath: Path;
  /** Number of milliseconds for the cache to be valid. */
  cacheDurationMs: number;
}

export async function fetchGitHubReleasesWithCache(
  opts: FetchGitHubReleasesOptionsWithCache,
): Promise<ReadonlyArray<GitHubRelease>> {
  const cacheFile = new CacheFile<GitHubRelease[]>({
    cacheFilePath: opts.cacheFilePath,
    cacheInvalidateTime: Date.now() - opts.cacheDurationMs,
  });
  let data = cacheFile.tryRead();
  if (data) {
    return data;
  }
  data = await Array.fromAsync(fetchGitHubReleases(opts));
  cacheFile.save(data);
  return data;
}

export interface FetchGitHubReleasesOptions {
  owner: string;
  repo: string;
  authToken?: string;
}

export async function* fetchGitHubReleases(
  opts: FetchGitHubReleasesOptions,
): AsyncGenerator<GitHubRelease> {
  const initialUrl =
    `https://api.github.com/repos/${opts.owner}/${opts.repo}/releases`;
  let pageNumber = 1;
  while (true) {
    const results = await withRetries(() =>
      fetchSingle(initialUrl + "?page=" + pageNumber, opts)
    );
    if (results.length === 0) {
      return;
    }
    yield* results;
    pageNumber++;
  }
}

function fetchSingle(url: string, opts: { authToken?: string }) {
  const authHeader: Record<string, string> = opts.authToken
    ? { Authorization: `Bearer ${opts.authToken}` }
    : {};
  return fetch(
    url,
    {
      headers: {
        "accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...authHeader,
      },
    },
  )
    .then((res) => {
      if (res.ok) {
        return res.json();
      } else {
        throw new Error(`Failed to fetch releases: ${res.statusText}`);
      }
    });
}
