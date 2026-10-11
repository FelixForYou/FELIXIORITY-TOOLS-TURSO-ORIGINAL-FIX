import { AppError, errorMessage } from "./errors";
import {
  id,
  type Job,
  type Session,
  type Runtime,
  canDeleteOffline,
  unusedUsers,
} from "./model";
import {
  audit,
  del,
  get,
  put,
  scope,
  panelKey,
  protectedIds,
  locked,
} from "./store";
import { token } from "./security";
import { sync } from "./services/sync";
import { servers } from "./services/servers";
import { users } from "./services/users";
import { runtime } from "./services/runtime";
import { pause } from "./services/transport";
import { z } from "zod";
export const jobInput = z.object({
  kind: z.enum([
    "scan",
    "delete-server",
    "delete-user",
    "unused",
    "offline",
    "suspend",
    "unsuspend",
  ]),
  ids: z.array(id).max(5000),
});
export async function createJob(s: Session, sid: string, raw: unknown) {
  const p = jobInput.parse(raw);
  if (p.ids.length !== new Set(p.ids).size)
    throw new AppError(400, "DUPLICATE", "ID duplikat.");
  if (p.kind !== "scan" && !p.ids.length)
    throw new AppError(400, "EMPTY", "Pilih resource terlebih dahulu.");
  if (
    p.ids.length > 1 &&
    ["delete-server", "delete-user", "unused", "offline"].includes(p.kind) &&
    process.env.ENABLE_BULK_DELETE !== "true"
  )
    throw new AppError(
      403,
      "BULK_DISABLED",
      "Bulk delete dinonaktifkan oleh konfigurasi server.",
    );
  if (p.kind === "offline" && !s.clientKey)
    throw new AppError(
      409,
      "NO_RUNTIME",
      "Atur Client API sebelum menggunakan Offline Cleaner.",
    );
  const snap = await sync(s, sid, true);
  const source =
    p.kind === "unused"
      ? unusedUsers(snap)
      : ["delete-user"].includes(p.kind)
        ? snap.users
        : snap.servers;
  const valid = new Set(source.map((x) => x.id));
  const ids = p.kind === "scan" ? snap.servers.map((x) => x.id) : p.ids;
  if (ids.some((x) => !valid.has(x)))
    throw new AppError(
      409,
      "INVALID_SELECTION",
      "Seleksi berubah atau tidak memenuhi syarat. Scan ulang.",
    );
  const protectedSet = await protectedIds(s);
  if (
    !["scan", "delete-user", "unused", "suspend", "unsuspend"].includes(
      p.kind,
    ) &&
    ids.some((x) => protectedSet.includes(x))
  )
    throw new AppError(409, "PROTECTED", "Seleksi memuat server Protected.");
  if (
    ["delete-user", "unused"].includes(p.kind) &&
    snap.users.some((u) => ids.includes(u.id) && u.root_admin)
  )
    throw new AppError(
      403,
      "ADMIN_PROTECTED",
      "Akun administrator dilindungi.",
    );
  const job: Job = {
    id: token(),
    kind: p.kind,
    ids,
    cursor: 0,
    results: [],
    runtime: {},
    status: "ready",
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 3600000,
    phrase: p.kind === "scan" ? "SCAN" : `KONFIRMASI ${ids.length}`,
    confirmed: false,
    dryRun: s.settings.dryRun,
    settings: { ...s.settings },
  };
  await put("job:" + scope(sid) + ":" + job.id, job);
  await audit(s, "preview:" + p.kind, "success");
  return {
    ...job,
    targets: ids.map((id) => {
      const x = source.find((x) => x.id === id);
      return {
        id,
        name:
          x && "name" in x
            ? x.name
            : x && "username" in x
              ? x.username
              : String(id),
      };
    }),
  };
}
export async function getJob(sid: string, jid: string) {
  if (!/^[a-f0-9]{64}$/.test(jid))
    throw new AppError(400, "JOB", "ID pekerjaan tidak valid.");
  const j = await get<Job>("job:" + scope(sid) + ":" + jid);
  if (!j || j.expiresAt < Date.now())
    throw new AppError(
      404,
      "JOB_EXPIRED",
      "Pekerjaan berakhir. Buat preview baru.",
    );
  return j;
}
export async function stepJob(
  s: Session,
  sid: string,
  jid: string,
  phrase?: string,
  cancel = false,
) {
  return locked("panel:" + panelKey(s), async (assertHeld) => {
    const j = await getJob(sid, jid),
      key = "job:" + scope(sid) + ":" + jid;
    if (["complete", "cancelled"].includes(j.status)) return j;
    if (cancel) {
      j.status = "cancelled";
      await put(key, j);
      return j;
    }
    if (!j.confirmed) {
      if (phrase !== j.phrase)
        throw new AppError(400, "CONFIRMATION", "Teks konfirmasi tidak cocok.");
      j.confirmed = true;
    }
    j.status = "running";
    await put(key, j);
    if (j.kind === "scan") {
      const cooldown = await get<number>("runtime-cooldown:" + scope(sid));
      if (cooldown && cooldown > Date.now())
        throw new AppError(
          429,
          "RUNTIME_RATE_LIMIT",
          "Runtime terkena rate limit. Lanjutkan setelah jeda.",
          Math.ceil((cooldown - Date.now()) / 1000),
        );
      const snap = await sync(s, sid);
      const batch = j.ids.slice(j.cursor, j.cursor + 4);
      await Promise.all(
        batch.map(async (id) => {
          const server = snap.servers.find((x) => x.id === id);
          const r: Runtime = server
            ? await runtime(s, server)
            : {
                state: "unknown",
                checkedAt: new Date().toISOString(),
                reason: "Server tidak ditemukan.",
              };
          j.runtime[id] = r;
          j.results.push({ id, ok: r.state !== "unknown", message: r.reason || r.state });
        }),
      );
      j.cursor += batch.length;
      const retry = Math.max(
        0,
        ...batch.map((id) => j.runtime[id]?.retryAfter || 0),
      );
      if (retry)
        await put(
          "runtime-cooldown:" + scope(sid),
          Date.now() + retry * 1000,
          retry,
        );
      await put("runtime:" + scope(sid), j.runtime, 300);
    } else {
      const target = j.ids[j.cursor];
      const pending = "attempt:" + scope(sid) + ":" + j.id + ":" + target;
      if (await get(pending)) {
        j.results.push({
          id: target,
          ok: false,
          message:
            "Hasil percobaan sebelumnya tidak pasti. Periksa langsung di panel; tidak diulang otomatis.",
        });
        j.cursor++;
      } else {
        await put(pending, true, 7200);
        try {
          if (["delete-user", "unused"].includes(j.kind)) {
            const user = await users.get(s, target);
            if (user.root_admin)
              throw new AppError(
                403,
                "ADMIN_PROTECTED",
                "Administrator dilindungi.",
              );
            const list = await servers.all(s);
            if (list.items.some((x) => x.user === target))
              throw new AppError(
                409,
                "HAS_SERVERS",
                "Pengguna masih memiliki server.",
              );
            const again = await users.get(s, target);
            if (again.root_admin)
              throw new AppError(
                403,
                "ADMIN_PROTECTED",
                "Role berubah menjadi administrator.",
              );
            if (!j.dryRun) {
              await assertHeld();
              if (s.expiresAt <= Date.now())
                throw new AppError(401, "SESSION_EXPIRED", "Sesi berakhir.");
              await users.delete(s, target);
            }
          } else {
            let server = await servers.get(s, target);
            if (
              ["delete-server", "offline"].includes(j.kind) &&
              (await protectedIds(s)).includes(target)
            )
              throw new AppError(409, "PROTECTED", "Server dilindungi.");
            if (j.kind === "offline") {
              const since = Date.now();
              const settings = j.settings;
              for (let count = 0; ; count++) {
                server = await servers.get(s, target);
                const rt = await runtime(s, server);
                if (!canDeleteOffline(server, rt, await protectedIds(s)))
                  throw new AppError(
                    409,
                    "NOT_STOPPED",
                    "Dilewati: status tidak terverifikasi stopped atau resource dilindungi.",
                  );
                if (
                  count + 1 >= settings.checks &&
                  Date.now() - since >= settings.minStopped * 1000
                )
                  break;
                await pause(settings.interval * 1000);
              }
            }
            if (!j.dryRun) {
              await assertHeld();
              if (s.expiresAt <= Date.now())
                throw new AppError(401, "SESSION_EXPIRED", "Sesi berakhir.");
              if (j.kind === "suspend" || j.kind === "unsuspend")
                await servers.power(s, target, j.kind);
              else await servers.delete(s, target);
            }
          }
          j.results.push({
            id: target,
            ok: true,
            message: j.dryRun
              ? "Dry-run: validasi lolos, tidak ada mutasi."
              : "Berhasil",
          });
          await audit(
            s,
            j.kind,
            j.dryRun ? "dry-run" : "success",
            target,
          ).catch(() => {});
        } catch (e) {
          j.results.push({ id: target, ok: false, message: errorMessage(e) });
          await audit(s, j.kind, "failed", target);
        }
        j.cursor++;
      }
      await del("snapshot:" + scope(sid));
      await del("runtime:" + scope(sid));
    }
    if (j.cursor >= j.ids.length) {
      j.status = "complete";
      await audit(s, j.kind, "complete");
    }
    await put(key, j);
    return j;
  });
}
