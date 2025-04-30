import { createTempDirSync, type TempDir as InnerTempDir } from "@david/temp";
import type { Path } from "@david/path";

export class TempDir implements Disposable {
  #inner: InnerTempDir;

  constructor(opts?: Deno.MakeTempOptions) {
    this.#inner = createTempDirSync(opts);
  }

  static fromBenchDir(existingDir: Path) {
    function copyDirSync(
      from: Path,
      to: Path,
      ignoredEntries: string[],
    ) {
      for (const entry of from.readDirSync()) {
        if (ignoredEntries.includes(entry.name)) {
          continue;
        }
        if (entry.isDirectory) {
          const toDir = to.join(entry.name);
          toDir.mkdirSync();
          copyDirSync(
            from.join(entry.name),
            toDir,
            [],
          );
        } else if (entry.isFile) {
          from.join(entry.name).copyFileSync(to.join(entry.name));
        } else if (entry.isSymlink) {
          console.warn("Ignoring symlink at", from.join(entry.name));
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
    return this.#inner.path;
  }

  cleanup() {
    try {
      this.path.removeSync({ recursive: true });
    } catch (err) {
      if (!(err instanceof Deno.errors.NotFound)) {
        console.warn(
          "Failed cleaning up temp dir",
          this.path,
          "- Error:",
          err,
        );
      }
    }
  }

  [Symbol.dispose]() {
    this.#inner[Symbol.dispose]();
  }
}
