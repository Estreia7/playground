/* Server start-up hook.

   Next calls register() once when a server instance boots, in both `next dev`
   and `next start`, and never during `next build`. That makes it the right
   place to start the FX Lab scheduler and the crypto XRP flow collector, both
   of which need to keep running whether or not anyone has a page open.

   Two guards matter. The Edge runtime has no timers or filesystem, so the
   scheduler is Node-only. And dev re-runs register() whenever this file
   recompiles, so the scheduler module itself holds a globalThis flag and
   ignores a second start. */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Imported inside register() rather than at module scope: the Edge bundle
  // would otherwise try to include the whole data layer.
  const { startScheduler } = await import("./app/api/fx/scheduler.ts");
  startScheduler();

  const { startCollector } = await import("./app/api/crypto/xrpl/collector.ts");
  void startCollector();

  // Warm the crypto overview's signal cache, so the first visitor after a
  // deploy is not the one waiting for 250 coins' candles.
  const { marketsPayload } = await import("./app/api/crypto/lib/markets.ts");
  void marketsPayload().catch(() => {});
}
