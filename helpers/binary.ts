import { whichSync } from "@david/which";

export interface BinaryRefInitOptions {
  binaryName: string;
}

export interface BinaryRunOnceForDurationResult {
  duration: number;
}

// todo: allow way more scenarios
export interface BinaryRefRunOptions {
  args: string[];
  cwd: string;
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
  #binaryPath: string;

  constructor(options: BinaryRefInitOptions) {
    const binaryPath = whichSync(options.binaryName);
    if (binaryPath == null) {
      throw new Error("Could not find path for binary: " + options.binaryName);
    }
    this.#binaryPath = binaryPath;
  }

  get binaryPath() {
    return this.#binaryPath;
  }

  runOnceForDuration(options: BinaryRefRunOptions): BinaryRunOnceForDurationResult {
    const command = new Deno.Command(this.#binaryPath, {
      args: options.args,
      clearEnv: options.clearEnv,
      env: options.env ?? {},
      cwd: options.cwd,
      signal: options.signal,
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
