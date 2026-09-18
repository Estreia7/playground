/* Server start-up hook.

   Next calls register() once when a server instance boots, in both `next dev`
   and `next start`, and never during `next build`. That makes it the right
   place to start the FX Lab scheduler, which needs to keep ticking whether or
   not anyone has the page open.

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
}
