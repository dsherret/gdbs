import type { Path } from "@david/path";

export class ResultStore {
  readonly #dirPath: Path;

  constructor(dirPath: Path) {
    this.#dirPath = dirPath;
  }

  set(key: string, data: unknown) {
    // a separate file per key is used in order to reduce the chance
    // of merge conflicts for distinct bench results and to cause merge
    // conflicts when two branches have the same benches
    const text = JSON.stringify(data, undefined, 2) + "\n";
    try {
      this.#writeText(key, text);
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        this.#getFilePath(key).parentOrThrow().mkdirSync({ recursive: true });
        this.#writeText(key, text);
      } else {
        throw err;
      }
    }
  }

  #writeText(key: string, text: string) {
    this.#getFilePath(key).writeTextSync(text);
  }

  get(key: string) {
    const text = this.#getFileText(key);
    try {
      return text == null ? undefined : JSON.parse(text);
    } catch (e) {
      console.warn(
        "Failed to deserialize JSON for ",
        this.#getFilePath(key),
        e,
      );
    }
  }

  #getFileText(key: string) {
    return this.#getFilePath(key).readMaybeTextSync();
  }

  delete(key: string) {
    const filePath = this.#getFilePath(key);
    filePath.removeSync();
    // clean up empty parent directories up to the results dir
    let parent = filePath.parentOrThrow();
    while (!parent.equals(this.#dirPath)) {
      const entries = [...parent.readDirSync()];
      if (entries.length === 0) {
        parent.removeSync();
        parent = parent.parentOrThrow();
      } else {
        break;
      }
    }
  }

  #getFilePath(key: string) {
    return this.#dirPath.join(key + ".json");
  }
}
