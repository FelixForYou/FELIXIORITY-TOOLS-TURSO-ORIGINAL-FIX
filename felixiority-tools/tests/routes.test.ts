import { beforeEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { session as fixtureSession, server, user } from "./fixtures";
import { AppError } from "../lib/errors";
vi.mock("../lib/store", () => ({
  session: vi.fn(),
  saveSession: vi.fn(),
  rate: vi.fn(),
  scope: () => "test",
  del: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  logs: vi.fn(),
  audit: vi.fn(async () => {}),
  protectedIds: vi.fn(async () => []),
  protect: vi.fn(),
  locked: async (_k: string, fn: (guard: () => Promise<void>) => unknown) =>
    fn(async () => {}),
  panelKey: () => "panel",
}));
vi.mock("../lib/services/users", () => ({ users: { all: vi.fn() } }));
vi.mock("../lib/services/servers", () => ({ servers: { all: vi.fn() } }));
import { session, saveSession } from "../lib/store";
import { users } from "../lib/services/users";
import { servers } from "../lib/services/servers";
import { GET, POST } from "../app/api/[...path]/route";
function req(
  path: string,
  data?: unknown,
  csrf?: string,
  origin = "https://tools.example.com",
) {
  return new NextRequest("https://tools.example.com/api/" + path, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
const ctx = (path: string) => ({
  params: Promise.resolve({ path: path.split("/") }),
});
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_ORIGIN = "https://tools.example.com";
  process.env.SESSION_SECRET = "a".repeat(64);
  delete process.env.PANEL_ALLOWED_HOSTS;
  vi.mocked(session).mockResolvedValue(fixtureSession());
  vi.mocked(users.all).mockResolvedValue({ items: [user()], total: 1 });
  vi.mocked(servers.all).mockResolvedValue({ items: [server()], total: 1 });
});
it("connect valid membuat cookie HttpOnly, Secure dan SameSite Strict tanpa key di respons", async () => {
  const key = "ptla_" + "a".repeat(32);
  const r = await POST(
    req("connect", { domain: "https://panel.example.com", key }),
    ctx("connect"),
  );
  expect(r.status).toBe(200);
  expect(saveSession).toHaveBeenCalledOnce();
  expect(r.headers.get("set-cookie")).toMatch(/HttpOnly/i);
  expect(r.headers.get("set-cookie")).toMatch(/Secure/i);
  expect(r.headers.get("set-cookie")).toMatch(/SameSite=strict/i);
  expect(await r.text()).not.toContain(key);
});
it("invalid panel key tidak membuat sesi", async () => {
  vi.mocked(users.all).mockRejectedValue(
    new AppError(403, "PANEL_401", "API key tidak valid."),
  );
  const r = await POST(
    req("connect", {
      domain: "https://panel.example.com",
      key: "ptla_" + "a".repeat(32),
    }),
    ctx("connect"),
  );
  expect(r.status).toBe(403);
  expect(saveSession).not.toHaveBeenCalled();
});
it("origin silang ditolak", async () => {
  const r = await POST(
    req("disconnect", {}, fixtureSession().csrf, "https://evil.example.com"),
    ctx("disconnect"),
  );
  expect(r.status).toBe(403);
});
it("CSRF wajib untuk mutasi", async () => {
  expect((await POST(req("disconnect", {}), ctx("disconnect"))).status).toBe(
    403,
  );
});
it("sesi kedaluwarsa memberikan 401", async () => {
  vi.mocked(session).mockRejectedValue(
    new AppError(401, "SESSION_EXPIRED", "Sesi berakhir."),
  );
  expect((await GET(req("session"), ctx("session"))).status).toBe(401);
});
it("endpoint session tidak membocorkan key", async () => {
  const r = await GET(req("session"), ctx("session"));
  const data = await r.json();
  expect(data.key).toBeUndefined();
  expect(data.clientKey).toBeUndefined();
  expect(data.csrf).toBe(fixtureSession().csrf);
});
