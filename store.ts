import * as path from "@std/path";

export class ResultStore {
  readonly #dirPath: string;

  constructor(dirPath: string) {
    this.#dirPath = dirPath;
  }

  set(key: string, data: object) {
    Deno.writeTextFileSync(
      this.#getFilePath(key),
      JSON.stringify(data, undefined, 2) + "\n",
    );
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
    return path.join(this.#dirPath, key);
  }
}
