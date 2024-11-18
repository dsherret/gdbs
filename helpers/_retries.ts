export async function withRetries<T>(action: () => Promise<T>, opts: { retries?: number } = {}) {
  const maxRetries = opts.retries ?? 3;
  for (let i = 0; i < (opts.retries ?? 3); i++) {
    try {
      return await action();
    } catch (err) {
      if (i === maxRetries) {
        throw err;
      } else {
        console.warn(`${err}\nRetrying (${i + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, Math.min(5_000, (i + 1) * 1000)));
      }
    }
  }
}