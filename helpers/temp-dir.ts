// import {} from "@std/fs";
import * as path from "@std/path";

export class TempDir implements Disposable {
  #path: string;

  constructor(opts?: Deno.MakeTempOptions) {
    this.#path = Deno.makeTempDirSync(opts);
  }

  static fromBenchDir(existingDir: string) {
    function copyDirSync(
      from: string,
      to: string,
      ignoredEntries: string[],
    ) {
      for (const entry of Deno.readDirSync(from)) {
        if (ignoredEntries.includes(entry.name)) {
          continue;
        }
        if (entry.isDirectory) {
          const toDir = path.join(to, entry.name);
          Deno.mkdirSync(toDir);
          copyDirSync(
            path.join(from, entry.name),
            toDir,
            [],
          );
        } else if (entry.isFile) {
          Deno.copyFileSync(
            path.join(from, entry.name),
            path.join(to, entry.name),
          );
        } else if (entry.isSymlink) {
          console.warn("Ignoring symlink at", path.join(from, entry.name));
        }
      }
    }

    const tempDir = new TempDir();
    copyDirSync(existingDir, tempDir.path, [
      // ignore these
      "__results__",
      "__bench__.ts",
    ]);
    return tempDir;
  }

  get path() {
    return this.#path;
  }

  cleanup() {
    try {
      Deno.removeSync(this.#path, {
        recursive: true,
      });
    } catch (err) {
      console.warn("Failed cleaning up temp dir", this.#path, '- Error:', err);
    }
  }

  [Symbol.dispose]() {
    this.cleanup();
  }
}
