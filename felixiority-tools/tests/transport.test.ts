import { beforeEach, describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { z } from "zod";
import { session } from "./fixtures";
const state = vi.hoisted(() => ({
  replies: [] as { status: number; body: unknown; retry?: string }[],
  options: [] as Record<string, unknown>[],
}));
vi.mock("../lib/security", () => ({
  resolvePublic: vi.fn(async () => ({ address: "8.8.8.8", family: 4 })),
}));
vi.mock("node:https", () => ({
  default: {
    request: (
      options: Record<string, unknown>,
      callback: (r: EventEmitter) => void,
    ) => {
      state.options.push(options);
      const req = new EventEmitter() as EventEmitter & {
        setTimeout: () => void;
        destroy: () => void;
        write: () => void;
        end: () => void;
      };
      req.setTimeout = () => {};
      req.destroy = () => {
        req.emit("error", new Error("network"));
        req.emit("close");
      };
      req.write = () => {};
      req.end = () => {
        queueMicrotask(() => {
          const next = state.replies.shift() || { status: 500, body: {} };
          const r = Object.assign(new EventEmitter(), {
            statusCode: next.status,
            headers: { "retry-after": next.retry },
          });
          callback(r);
          r.emit("data", Buffer.from(JSON.stringify(next.body)));
          r.emit("end");
          req.emit("close");
        });
      };
      return req;
    },
  },
}));
import { allPages, request } from "../lib/services/transport";
const page = (
  ids: number[],
  total: number,
  current: number,
  pages: number,
) => ({
  data: ids.map((id) => ({ attributes: { id } })),
  meta: { pagination: { total, current_page: current, total_pages: pages } },
});
beforeEach(() => {
  state.replies = [];
  state.options = [];
});
describe("API transport dan pagination", () => {
  it("membaca 205 resource di tiga halaman", async () => {
    state.replies = [
      {
        status: 200,
        body: page(
          Array.from({ length: 100 }, (_, i) => i + 1),
          205,
          1,
          3,
        ),
      },
      {
        status: 200,
        body: page(
          Array.from({ length: 100 }, (_, i) => i + 101),
          205,
          2,
          3,
        ),
      },
      { status: 200, body: page([201, 202, 203, 204, 205], 205, 3, 3) },
    ];
    const result = await allPages(
      session(),
      "users",
      z.object({ id: z.number() }),
    );
    expect(result.total).toBe(205);
    expect(result.items.length).toBe(205);
    expect(state.options).toHaveLength(3);
  });
  it("menolak ID duplikat", async () => {
    state.replies = [
      { status: 200, body: page([1], 2, 1, 2) },
      { status: 200, body: page([1], 2, 2, 2) },
    ];
    await expect(
      allPages(session(), "servers", z.object({ id: z.number() })),
    ).rejects.toThrow("duplikat");
  });
  it("menolak total berubah", async () => {
    state.replies = [
      { status: 200, body: page([1], 2, 1, 2) },
      { status: 200, body: page([2, 3], 3, 2, 2) },
    ];
    await expect(
      allPages(session(), "users", z.object({ id: z.number() })),
    ).rejects.toThrow("berubah");
  });
  it("gagal jika halaman kurang", async () => {
    state.replies = [{ status: 200, body: page([1], 2, 1, 1) }];
    await expect(
      allPages(session(), "users", z.object({ id: z.number() })),
    ).rejects.toThrow("metadata");
  });
  it("tidak mengikuti redirect", async () => {
    state.replies = [{ status: 302, body: {} }];
    await expect(
      request(session(), "/api/application/servers"),
    ).rejects.toThrow();
    expect(state.options).toHaveLength(1);
  });
  it("tidak retry DELETE", async () => {
    state.replies = [{ status: 503, body: {} }];
    await expect(
      request(session(), "/api/application/servers/1", "DELETE"),
    ).rejects.toThrow();
    expect(state.options).toHaveLength(1);
  });
  it.each([401, 403, 404, 422, 429, 500])(
    "menangani HTTP %i",
    async (status) => {
      state.replies = [{ status, body: {}, retry: "25" }];
      await expect(
        request(session(), "/api/application/users"),
      ).rejects.toMatchObject({ code: "PANEL_" + status });
      expect(state.options).toHaveLength(1);
    },
  );
  it("memakai DNS yang dipin dan host TLS asli", async () => {
    state.replies = [{ status: 200, body: {} }];
    await request(session(), "/api/application/users");
    const o = state.options[0];
    expect(o.servername).toBe("panel.example.com");
    expect(o.agent).toBe(false);
    const cb = vi.fn();
    (o.lookup as Function)("ignored", {}, cb);
    expect(cb).toHaveBeenCalledWith(null, "8.8.8.8", 4);
  });
});
