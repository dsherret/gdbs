import { whichSync } from "@david/which";
import { isAbsolute } from "@std/path/is-absolute";
import { Path } from "@david/path";

export interface BinaryRefInitOptions {
  binaryName: string;
}

export interface BinaryRunOnceForDurationResult {
  duration: number;
}

export interface BinaryRefRunOnceForDurationOptions {
  args: string[];
  cwd: Path;
  clearEnv?: boolean;
  env?: Record<string, string>;
  signal?: AbortSignal;
  stdout?: "inherit" | "null";
  stderr?: "inherit" | "null";
  expectedExitCode?: number;
}

export class BinaryRef {
  // very important to cache this upfront so that
  // resolving it doesn't count towards benchmarks
  #binaryPath: Path;

  constructor(options: BinaryRefInitOptions) {
    const binaryPath = isAbsolute(options.binaryName)
      ? options.binaryName
      : whichSync(options.binaryName);
    if (binaryPath == null) {
      throw new Error("Could not find path for binary: " + options.binaryName);
    }
    this.#binaryPath = new Path(binaryPath);
  }

  get binaryPath(): Path {
    return this.#binaryPath;
  }

  runGetOutput(options: {
    args: string[];
    cwd: Path;
    clearEnv?: boolean;
    env?: Record<string, string>;
    signal?: AbortSignal;
  }): string {
    const command = new Deno.Command(this.#binaryPath.toString(), {
      args: options.args,
      clearEnv: options.clearEnv,
      env: options.env ?? {},
      cwd: options.cwd.toString(),
      signal: options.signal,
      stdin: "null",
      stdout: "piped",
      stderr: "inherit",
    });
    const output = command.outputSync();
    if (output.code !== 0) {
      throw new Error("Unexpected exit code. Must be 0, was " + output.code);
    }
    return new TextDecoder().decode(output.stdout);
  }

  runOnceForDuration(
    options: BinaryRefRunOnceForDurationOptions,
  ): BinaryRunOnceForDurationResult {
    const command = new Deno.Command(this.#binaryPath.toString(), {
      args: options.args,
      clearEnv: options.clearEnv,
      env: options.env ?? {},
      cwd: options.cwd.toString(),
      signal: options.signal,
      stdin: "null",
      // by default, inherit the output so that people can
      // easily see what's going on when something fails
      stdout: options.stdout ?? "inherit",
      stderr: options.stderr ?? "inherit",
    });

    // the test for duration should be synchronous in order
    // to get a more accurate measurement than async
    const startTime = performance.now();
    const output = command.outputSync();
    const endTime = performance.now();
    if (output.code !== (options.expectedExitCode ?? 0)) {
      throw new Error("Unexpected exit code: " + output.code);
    }
    return {
      duration: endTime - startTime,
    };
  }
}
