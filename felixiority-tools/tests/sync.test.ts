import { beforeEach, it, expect, vi } from "vitest";
import { session, snapshot } from "./fixtures";
vi.mock("../lib/store", () => ({
  get: vi.fn(async () => null),
  put: vi.fn(),
  locked: async (_k: string, fn: () => unknown) => fn(),
  scope: () => "test-scope",
  audit: vi.fn(),
}));
vi.mock("../lib/services/users", () => ({ users: { all: vi.fn() } }));
vi.mock("../lib/services/servers", () => ({ servers: { all: vi.fn() } }));
vi.mock("../lib/services/nodes", () => ({ nodes: { all: vi.fn() } }));
import { sync } from "../lib/services/sync";
import { users } from "../lib/services/users";
import { servers } from "../lib/services/servers";
import { nodes } from "../lib/services/nodes";
import { put } from "../lib/store";
beforeEach(() => {
  vi.clearAllMocks();
  const s = snapshot();
  vi.mocked(users.all).mockResolvedValue({
    items: s.users,
    total: s.users.length,
  });
  vi.mocked(servers.all).mockResolvedValue({
    items: s.servers,
    total: s.servers.length,
  });
  vi.mocked(nodes.all).mockResolvedValue({
    items: s.nodes,
    total: s.nodes.length,
  });
});
it("snapshot lengkap ditulis setelah semua owner valid", async () => {
  const r = await sync(session(), "sid", true);
  expect(r.totals).toEqual({ users: 4, servers: 2, nodes: 1 });
  expect(put).toHaveBeenCalledOnce();
});
it("nodes gagal tidak berubah menjadi total nol", async () => {
  vi.mocked(nodes.all).mockRejectedValue(new Error("nodes failed"));
  const r = await sync(session(), "sid", true);
  expect(r.totals.nodes).toBeNull();
  expect(r.nodeError).toBeTruthy();
});
it("users gagal tidak mempublikasikan snapshot parsial", async () => {
  vi.mocked(users.all).mockRejectedValue(new Error("users failed"));
  await expect(sync(session(), "sid", true)).rejects.toThrow();
  expect(put).not.toHaveBeenCalled();
});
it("servers gagal tidak mempublikasikan snapshot parsial", async () => {
  vi.mocked(servers.all).mockRejectedValue(new Error("servers failed"));
  await expect(sync(session(), "sid", true)).rejects.toThrow();
  expect(put).not.toHaveBeenCalled();
});
