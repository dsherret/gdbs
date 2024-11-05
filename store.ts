import * as path from "@std/path";

export class ResultStore {
  readonly #dirPath: string;

  constructor(dirPath: string) {
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
        Deno.mkdirSync(this.#dirPath, { recursive: true });
        this.#writeText(key, text);
      } else {
        throw err;
      }
    }
  }

  #writeText(key: string, text: string) {
    Deno.writeTextFileSync(this.#getFilePath(key), text);
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
    try {
      return Deno.readTextFileSync(this.#getFilePath(key));
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        return undefined;
      }
      throw e;
    }
  }

  #getFilePath(key: string) {
    return path.join(this.#dirPath, key) + ".json";
  }
}
