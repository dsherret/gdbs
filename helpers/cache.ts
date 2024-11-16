import { dirname } from "@std/path/dirname";

export interface CacheFileData<T> {
  saveTime: number;
  data: T;
}

export class CacheFile<T> {
  readonly #cacheFilePath: string;
  readonly #cacheInvalidateTime: number| undefined;

  constructor(opts: { cacheFilePath: string; cacheInvalidateTime: number | undefined }) {
    this.#cacheFilePath = opts.cacheFilePath;
    this.#cacheInvalidateTime = opts.cacheInvalidateTime;
  }

  tryRead(): T | undefined {
    try {
      const content = JSON.parse(
        Deno.readTextFileSync(this.#cacheFilePath),
      ) as CacheFileData<T>;
      if (this.#cacheInvalidateTime != null && content.saveTime < this.#cacheInvalidateTime) {
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
    Deno.mkdirSync(dirname(this.#cacheFilePath), { recursive: true });
    const tempPath = this.#cacheFilePath + ".tmp";
    Deno.writeTextFileSync(tempPath, JSON.stringify(content));
    Deno.renameSync(tempPath, this.#cacheFilePath);
  }
}