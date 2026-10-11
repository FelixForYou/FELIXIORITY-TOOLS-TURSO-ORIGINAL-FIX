import { describe, it, expect } from "vitest";
import { canDeleteOffline, ownerCounts, unusedUsers } from "../lib/model";
import { server, user, snapshot } from "./fixtures";
describe("cleanup safety", () => {
  it("menghitung seluruh owner > 100 tanpa menganggap suspended/stopped kosong", () => {
    const s = snapshot();
    s.users = Array.from({ length: 205 }, (_, i) => user(i + 1, i === 204));
    s.servers = Array.from({ length: 201 }, (_, i) => ({
      ...server(i + 1, i + 1),
      suspended: i % 2 === 0,
    }));
    expect(unusedUsers(s).map((u) => u.id)).toEqual([202, 203, 204]);
    expect(ownerCounts(s.servers, s.users).size).toBe(201);
  });
  it("gagal tertutup jika owner hilang", () => {
    expect(() => ownerCounts([server(1, 999)], [user(1)])).toThrow();
  });
  it("selalu melindungi administrator", () => {
    expect(unusedUsers(snapshot()).map((u) => u.id)).toEqual([3]);
  });
  it.each([
    "running",
    "starting",
    "stopping",
    "unknown",
    "suspended",
    "installing",
    "node_unreachable",
  ] as const)("tidak menghapus status %s", (state) => {
    expect(canDeleteOffline(server(), { state, checkedAt: "" }, [])).toBe(
      false,
    );
  });
  it("memerlukan stopped dan tidak protected atau suspended", () => {
    expect(
      canDeleteOffline(server(), { state: "stopped", checkedAt: "" }, []),
    ).toBe(true);
    expect(
      canDeleteOffline(server(), { state: "stopped", checkedAt: "" }, [1]),
    ).toBe(false);
    expect(
      canDeleteOffline(
        { ...server(), suspended: true },
        { state: "stopped", checkedAt: "" },
        [],
      ),
    ).toBe(false);
    expect(
      canDeleteOffline(
        { ...server(), status: "restoring_backup" },
        { state: "stopped", checkedAt: "" },
        [],
      ),
    ).toBe(false);
  });
});
