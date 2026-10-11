import { beforeEach, describe, it, expect, vi } from "vitest";
import { server, user, session, snapshot } from "./fixtures";
const state = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  protected: [] as number[],
}));
vi.mock("../lib/store", () => ({
  get: vi.fn(async (k: string) => state.store.get(k) || null),
  put: vi.fn(async (k: string, v: unknown) => {
    state.store.set(k, structuredClone(v));
  }),
  del: vi.fn(async (k: string) => state.store.delete(k)),
  scope: () => "scope",
  panelKey: () => "panel",
  protectedIds: async () => state.protected,
  locked: async (
    _k: string,
    fn: (assertHeld: () => Promise<void>) => unknown,
  ) => fn(async () => {}),
  audit: vi.fn(async () => {}),
}));
vi.mock("../lib/services/sync", () => ({ sync: vi.fn() }));
vi.mock("../lib/services/servers", () => ({
  servers: { all: vi.fn(), get: vi.fn(), delete: vi.fn(), power: vi.fn() },
}));
vi.mock("../lib/services/users", () => ({
  users: { get: vi.fn(), delete: vi.fn() },
}));
vi.mock("../lib/services/runtime", () => ({ runtime: vi.fn() }));
vi.mock("../lib/services/transport", () => ({ pause: vi.fn(async () => {}) }));
import { createJob, stepJob } from "../lib/jobs";
import { sync } from "../lib/services/sync";
import { servers } from "../lib/services/servers";
import { users } from "../lib/services/users";
import { runtime } from "../lib/services/runtime";
beforeEach(() => {
  vi.clearAllMocks();
  state.store.clear();
  state.protected = [];
  process.env.ENABLE_BULK_DELETE = "true";
  vi.mocked(sync).mockResolvedValue(snapshot());
  vi.mocked(servers.get).mockImplementation(async (_s, id) => server(id));
  vi.mocked(servers.all).mockResolvedValue({ items: [], total: 0 });
  vi.mocked(users.get).mockImplementation(async (_s, id) => user(id));
  vi.mocked(servers.delete).mockResolvedValue(null);
  vi.mocked(users.delete).mockResolvedValue(null);
  vi.mocked(runtime).mockResolvedValue({
    state: "stopped",
    checkedAt: new Date().toISOString(),
  });
});
describe("job integration: prepare → confirm → recheck → API action", () => {
  it("confirmation wajib sebelum delete", async () => {
    const j = await createJob(session(), "sid", {
      kind: "delete-server",
      ids: [1],
    });
    await expect(stepJob(session(), "sid", j.id, "SALAH")).rejects.toThrow(
      "konfirmasi",
    );
    expect(servers.delete).not.toHaveBeenCalled();
  });
  it("menjalankan DELETE dan hasil per item", async () => {
    const s = session(),
      j = await createJob(s, "sid", { kind: "delete-server", ids: [1] });
    const r = await stepJob(s, "sid", j.id, j.phrase);
    expect(servers.delete).toHaveBeenCalledWith(s, 1);
    expect(r.status).toBe("complete");
    expect(r.results[0].ok).toBe(true);
  });
  it("bulk partial success tidak sukses palsu", async () => {
    vi.mocked(servers.delete).mockImplementation(async (_s, id) => {
      if (id === 2) throw new Error("failed");
      return null;
    });
    const s = session(),
      j = await createJob(s, "sid", { kind: "delete-server", ids: [1, 2] });
    await stepJob(s, "sid", j.id, j.phrase);
    const r = await stepJob(s, "sid", j.id);
    expect(r.results.map((x) => x.ok)).toEqual([true, false]);
    expect(r.status).toBe("complete");
  });
  it("server jadi running sesudah scan tidak dihapus", async () => {
    vi.mocked(runtime).mockResolvedValue({
      state: "running",
      checkedAt: new Date().toISOString(),
    });
    const s = { ...session(), clientKey: "ptlc_test" },
      j = await createJob(s, "sid", { kind: "offline", ids: [1] });
    const r = await stepJob(s, "sid", j.id, j.phrase);
    expect(r.results[0].ok).toBe(false);
    expect(servers.delete).not.toHaveBeenCalled();
  });
  it("protected sesudah preview tetap diblokir", async () => {
    const s = session(),
      j = await createJob(s, "sid", { kind: "delete-server", ids: [1] });
    state.protected = [1];
    expect((await stepJob(s, "sid", j.id, j.phrase)).results[0].ok).toBe(false);
    expect(servers.delete).not.toHaveBeenCalled();
  });
  it("admin tidak bisa masuk preview cleanup", async () => {
    await expect(
      createJob(session(), "sid", { kind: "unused", ids: [4] }),
    ).rejects.toThrow();
    await expect(
      createJob(session(), "sid", { kind: "delete-user", ids: [4] }),
    ).rejects.toThrow("administrator");
  });
  it("user mendapat server sebelum delete diblokir", async () => {
    vi.mocked(servers.all).mockResolvedValue({
      items: [server(5, 3)],
      total: 1,
    });
    const s = session(),
      j = await createJob(s, "sid", { kind: "unused", ids: [3] });
    expect((await stepJob(s, "sid", j.id, j.phrase)).results[0].ok).toBe(false);
    expect(users.delete).not.toHaveBeenCalled();
  });
  it("role berubah menjadi admin sebelum delete diblokir", async () => {
    vi.mocked(users.get).mockResolvedValue(user(3, true));
    const s = session(),
      j = await createJob(s, "sid", { kind: "unused", ids: [3] });
    expect((await stepJob(s, "sid", j.id, j.phrase)).results[0].ok).toBe(false);
    expect(users.delete).not.toHaveBeenCalled();
  });
  it("dry run tidak memutasi API", async () => {
    const s = session();
    s.settings.dryRun = true;
    const j = await createJob(s, "sid", { kind: "delete-server", ids: [1] });
    expect((await stepJob(s, "sid", j.id, j.phrase)).results[0].ok).toBe(true);
    expect(servers.delete).not.toHaveBeenCalled();
  });
  it.each(["suspend", "unsuspend"] as const)(
    "%s memanggil aksi API",
    async (kind) => {
      const s = session(),
        j = await createJob(s, "sid", { kind, ids: [1] });
      await stepJob(s, "sid", j.id, j.phrase);
      expect(servers.power).toHaveBeenCalledWith(s, 1, kind);
    },
  );
  it("opsi server memblok bulk delete", async () => {
    process.env.ENABLE_BULK_DELETE = "false";
    await expect(
      createJob(session(), "sid", { kind: "delete-server", ids: [1, 2] }),
    ).rejects.toThrow("dinonaktifkan");
  });
  it("percobaan tidak pasti tidak mengulang DELETE", async () => {
    const s = session(),
      j = await createJob(s, "sid", { kind: "delete-server", ids: [1] });
    state.store.set("attempt:scope:" + j.id + ":1", true);
    const r = await stepJob(s, "sid", j.id, j.phrase);
    expect(r.results[0].message).toContain("tidak pasti");
    expect(servers.delete).not.toHaveBeenCalled();
  });
  it("tanpa runtime menolak offline cleaner", async () => {
    await expect(
      createJob(session(), "sid", { kind: "offline", ids: [1] }),
    ).rejects.toThrow("Client API");
  });
  it("unused user valid memanggil DELETE user", async () => {
    const s = session(),
      j = await createJob(s, "sid", { kind: "unused", ids: [3] });
    await stepJob(s, "sid", j.id, j.phrase);
    expect(users.delete).toHaveBeenCalledWith(s, 3);
  });
  it("cancel tidak memutasi API", async () => {
    const s = session(),
      j = await createJob(s, "sid", { kind: "delete-server", ids: [1] });
    expect((await stepJob(s, "sid", j.id, undefined, true)).status).toBe(
      "cancelled",
    );
    expect(servers.delete).not.toHaveBeenCalled();
  });
});
