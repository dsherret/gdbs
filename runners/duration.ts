import * as math from "../math.ts";

export interface RunDurationBench<TBeforeEachResult> {
  /** Number of warmup runs (default: 2) */
  warmups?: number;
  /** Number of times to run the bench. */
  times?: number;
  /** Maximum times to retry on failure (default: 2). */
  maxRetries?: number;
  beforeEach?: () => Promise<TBeforeEachResult> | TBeforeEachResult;
  /** Run the bench returning how long it took. */
  run: (data: TBeforeEachResult) => Promise<number> | number;
  afterEach?: (data: TBeforeEachResult) => Promise<void> | void;
}

export interface RunDurationBenchResult {
  rawDurations: number[];
  average: number;
  range: [number, number];
}

export async function runDurationBench<TBeforeEachResult>(
  options: RunDurationBench<TBeforeEachResult>,
): Promise<RunDurationBenchResult> {
  async function runWithRetries() {
    let i = 0;
    while (true) {
      try {
        let beforeEachResult: TBeforeEachResult;
        if (options.beforeEach) {
          beforeEachResult = await options.beforeEach();
        }
        const duration = options.run(beforeEachResult!);
        if (options.afterEach) {
          await options.afterEach(beforeEachResult!);
        }
        return duration;
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
