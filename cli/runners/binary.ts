import { whichSync } from "@david/which";
import * as math from "../math.ts";

export interface RunBinaryDurationBench extends BinaryRefInitOptions, BinaryRefRunOptions {
  /** Number of warmup runs (default: 2) */
  warmups?: number;
  /** Number of times to run the bench. */
  times?: number;
  /** Maximum times to retry on failure (default: 2). */
  maxRetries?: number;
  beforeEach?: () => Promise<void> | void;
}

export interface RunBinaryDurationBenchResult {
  rawDurations: number[];
  average: number;
  range: [number, number];
}

export async function runBinaryDurationBench(options: RunBinaryDurationBench): Promise<RunBinaryDurationBenchResult> {
  async function runWithRetries() {
    let i = 0;
    while (true) {
      try {
        if (options.beforeEach) {
          await options.beforeEach();
        }
        return binaryRef.runOnceForDuration(options);
      } catch (err) {
        if (i === (options.maxRetries ?? 2)) {
          throw err;
        } else {
          console.error("Retrying due to error: " + err);
        }
        i++;
      }
    }
  }
  const binaryRef = new BinaryRef(options);
  for (let i = 0; i < (options.warmups ?? 2); i++) {
    await runWithRetries();
  }
  const times = options.times ?? 10;
  const durations = new Array(times);
  for (let i = 0; i < times; i++) {
    durations[i] = (await runWithRetries()).duration;
  }

  return {
    rawDurations: durations,
    average: math.average(durations),
    range: math.range(durations),
  };
}

export interface BinaryRefInitOptions {
  binaryName: string;
}

export interface BinaryRefResult {
  duration: number;
}

// todo: allow way more scenarios
export interface BinaryRefRunOptions {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
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

  runOnceForDuration(options: BinaryRefRunOptions): BinaryRefResult {
    const command = new Deno.Command(this.#binaryPath, {
      args: options.args,
      clearEnv: true,
      env: {
        PATH: Deno.env.get("PATH") ?? "",
        ...(options.env ?? {}),
      },
      cwd: options.cwd,
      signal: options.signal,
      // by default, inherit the output so that people can
      // easily see what's going on when something fails
      stdout: "inherit",
      stderr: "inherit",
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
    }
  }
}