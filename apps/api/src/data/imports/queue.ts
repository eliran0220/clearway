/** Runs async jobs with at most `limit` in flight. The first failure is rethrown by add() or drain(). */
export function makeQueue(limit: number) {
  const inFlight = new Set<Promise<void>>();
  let failure: { error: unknown } | null = null;
  const check = () => {
    if (failure) throw failure.error;
  };
  return {
    async add(job: () => Promise<unknown>) {
      check();
      while (inFlight.size >= limit) await Promise.race(inFlight);
      check();
      const p: Promise<void> = job().then(
        () => {
          inFlight.delete(p);
        },
        (error: unknown) => {
          inFlight.delete(p);
          failure ??= { error };
        },
      );
      inFlight.add(p);
    },
    async drain() {
      await Promise.all(inFlight);
      check();
    },
  };
}
