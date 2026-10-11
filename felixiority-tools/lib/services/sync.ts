import { users } from "./users";
import { servers } from "./servers";
import { nodes } from "./nodes";
import type { Session, Snapshot } from "../model";
import { ownerCounts } from "../model";
import { get, put, locked, scope, audit } from "../store";
import { errorMessage } from "../errors";
export async function sync(
  s: Session,
  sid: string,
  force = false,
): Promise<Snapshot> {
  const key = "snapshot:" + scope(sid);
  if (!force) {
    const cached = await get<Snapshot>(key);
    if (cached && Date.now() - Date.parse(cached.syncedAt) < 10000)
      return cached;
  }
  return locked("sync:" + scope(sid), async () => {
    const [u, v, n] = await Promise.all([
      users.all(s),
      servers.all(s),
      nodes
        .all(s)
        .then((value) => ({ value, error: undefined }))
        .catch((e) => ({ value: undefined, error: errorMessage(e) })),
    ]);
    ownerCounts(v.items, u.items);
    const snapshot: Snapshot = {
      users: u.items,
      servers: v.items,
      nodes: n.value?.items || [],
      nodeError: n.error,
      totals: {
        users: u.total,
        servers: v.total,
        nodes: n.value?.total ?? null,
      },
      syncedAt: new Date().toISOString(),
    };
    await put(key, snapshot, 60);
    await audit(s, "sync", n.error ? "partial-nodes" : "success");
    return snapshot;
  });
}
