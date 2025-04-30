import type { Path } from "@david/path";

export interface CacheFileData<T> {
  saveTime: number;
  data: T;
}

export class CacheFile<T> {
  readonly #cacheFilePath: Path;
  readonly #cacheInvalidateTime: number | undefined;

  constructor(
    opts: { cacheFilePath: Path; cacheInvalidateTime: number | undefined },
  ) {
    this.#cacheFilePath = opts.cacheFilePath;
    this.#cacheInvalidateTime = opts.cacheInvalidateTime;
  }

  tryRead(): T | undefined {
    try {
      const content = JSON.parse(
        this.#cacheFilePath.readTextSync(),
      ) as CacheFileData<T>;
      if (
        this.#cacheInvalidateTime != null
        && content.saveTime < this.#cacheInvalidateTime
      ) {
        return undefined;
      }
      return content.data;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return undefined;
      }
      throw err;
    }
  }

  save(data: T) {
    const content: CacheFileData<T> = {
      saveTime: Date.now(),
      data,
    };
    this.#cacheFilePath.parentOrThrow().mkdirSync({ recursive: true });
    const tempPath = this.#cacheFilePath.withExtname(".tmp");
    tempPath.writeTextSync(JSON.stringify(content));
    tempPath.renameSync(this.#cacheFilePath);
  }
}
