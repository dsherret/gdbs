import * as math from "../math.ts";

export interface RunDurationBench {
  /** Number of warmup runs (default: 2) */
  warmups?: number;
  /** Number of times to run the bench. */
  times?: number;
  /** Maximum times to retry on failure (default: 2). */
  maxRetries?: number;
  /** Run the bench returning how long it took in milliseconds. */
  run: () => Promise<number> | number;
}

export interface RunDurationBenchResult {
  rawDurations: number[];
  average: number;
  range: [number, number];
}

export async function runDurationBench(
  options: RunDurationBench,
): Promise<RunDurationBenchResult> {
  async function runWithRetries() {
    let i = 0;
    while (true) {
      try {
        return await options.run();
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
  for (let i = 0; i < (options.warmups ?? 2); i++) {
    await runWithRetries();
  }
  const times = options.times ?? 10;
  const durations = new Array(times);
  for (let i = 0; i < times; i++) {
    durations[i] = await runWithRetries();
  }

  return {
    rawDurations: durations,
    average: math.average(durations),
    range: math.range(durations),
  };
}
