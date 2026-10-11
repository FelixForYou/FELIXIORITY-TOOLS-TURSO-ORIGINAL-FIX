import { beforeEach, it, expect, vi } from "vitest";
import { session, snapshot, server } from "./fixtures";
const state = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("../lib/store", () => ({
  get: async (k: string) => state.store.get(k) || null,
  put: async (k: string, v: unknown) => {
    state.store.set(k, v);
  },
  scope: () => "scope",
  locked: async (_k: string, fn: () => unknown) => fn(),
}));
vi.mock("../lib/services/runtime", () => ({ runtime: vi.fn() }));
import { runtime } from "../lib/services/runtime";
import { refreshRuntime } from "../lib/services/runtime-sync";
beforeEach(() => {
  vi.clearAllMocks();
  state.store.clear();
  state.store.set("snapshot:scope", snapshot());
  vi.mocked(runtime).mockResolvedValue({
    state: "stopped",
    checkedAt: new Date().toISOString(),
  });
});
it("tanpa Client API tidak membuat status palsu", async () => {
  expect(await refreshRuntime(session(), "sid")).toEqual({});
  expect(runtime).not.toHaveBeenCalled();
});
it("runtime otomatis mengisi hanya hasil sumber asli", async () => {
  const r = await refreshRuntime({ ...session(), clientKey: "test" }, "sid");
  expect(Object.keys(r)).toHaveLength(2);
  expect(r[1].state).toBe("stopped");
  expect(runtime).toHaveBeenCalledTimes(2);
});
it("deduplikasi polling dalam 12 detik", async () => {
  const s = { ...session(), clientKey: "test" };
  await refreshRuntime(s, "sid");
  await refreshRuntime(s, "sid");
  expect(runtime).toHaveBeenCalledTimes(2);
});
it("429 menghentikan batch berikut dan menerapkan cooldown", async () => {
  const d = snapshot();
  d.servers = Array.from({ length: 20 }, (_, i) => server(i + 1));
  state.store.set("snapshot:scope", d);
  vi.mocked(runtime).mockResolvedValue({
    state: "unknown",
    checkedAt: new Date().toISOString(),
    retryAfter: 30,
  });
  await refreshRuntime({ ...session(), clientKey: "test" }, "sid");
  expect(runtime).toHaveBeenCalledTimes(4);
  expect(state.store.get("runtime-cooldown:scope")).toBeGreaterThan(Date.now());
});
it("snapshot stale tidak memulai request runtime", async () => {
  state.store.set("snapshot:scope", {
    ...snapshot(),
    syncedAt: new Date(Date.now() - 60000).toISOString(),
  });
  await refreshRuntime({ ...session(), clientKey: "test" }, "sid");
  expect(runtime).not.toHaveBeenCalled();
});
