import type { Runtime, Session, Snapshot } from "../model";
import { get, put, scope, locked } from "../store";
import { runtime } from "./runtime";
// Bounded read-only rounds. Large panels return partial coverage with per-item timestamps.
// The UI never extrapolates unknown resources into running/stopped totals.
export async function refreshRuntime(s: Session, sid: string) {
  const key = "runtime:" + scope(sid);
  const previous = (await get<Record<number, Runtime>>(key)) || {};
  if (!s.clientKey) return previous;
  const cooldown = await get<number>("runtime-cooldown:" + scope(sid));
  if (cooldown && cooldown > Date.now()) return previous;
  const last = await get<number>("runtime-round:" + scope(sid));
  if (last && Date.now() - last < 12000) return previous;
  const snap = await get<Snapshot>("snapshot:" + scope(sid));
  if (!snap || Date.now() - Date.parse(snap.syncedAt) > 30000) return previous;
  return locked("runtime:" + scope(sid), async () => {
    const current: Record<number, Runtime> = {};
    for (const server of snap.servers) {
      if (previous[server.id]) current[server.id] = previous[server.id];
    }
    const queue = [...snap.servers].sort(
      (a, b) =>
        Date.parse(current[a.id]?.checkedAt || "1970-01-01") -
        Date.parse(current[b.id]?.checkedAt || "1970-01-01"),
    );
    const start = Date.now();
    for (let i = 0; i < Math.min(queue.length, 80); i += 4) {
      const batch = queue.slice(i, i + 4);
      const result = await Promise.all(
        batch.map(async (server) => ({
          id: server.id,
          value: await runtime(s, server),
        })),
      );
      let retry = 0;
      for (const r of result) {
        current[r.id] = r.value;
        retry = Math.max(retry, r.value.retryAfter || 0);
      }
      if (retry) {
        await put(
          "runtime-cooldown:" + scope(sid),
          Date.now() + retry * 1000,
          retry,
        );
        break;
      }
      if (Date.now() - start > 8000) break;
    }
    await put(key, current, 300);
    await put("runtime-round:" + scope(sid), Date.now(), 30);
    return current;
  });
}
