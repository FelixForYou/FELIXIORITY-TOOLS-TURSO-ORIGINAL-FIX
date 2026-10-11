import { beforeEach, it, expect, vi } from "vitest";
import { server, session } from "./fixtures";
import { AppError } from "../lib/errors";
vi.mock("../lib/services/transport", () => ({ request: vi.fn() }));
import { request } from "../lib/services/transport";
import { runtime } from "../lib/services/runtime";
beforeEach(() => {
  vi.mocked(request).mockReset();
});
it("tanpa PTLC tetap unknown tanpa request", async () => {
  expect((await runtime(session(), server())).state).toBe("unknown");
  expect(request).not.toHaveBeenCalled();
});
it("runtime offline menjadi stopped", async () => {
  vi.mocked(request).mockResolvedValue({
    attributes: { current_state: "offline", is_suspended: false },
  });
  expect(
    (await runtime({ ...session(), clientKey: "ptlc_test" }, server())).state,
  ).toBe("stopped");
});
it.each([403, 502, 503, 429])(
  "error %i bukan bukti offline",
  async (status) => {
    vi.mocked(request).mockRejectedValue(new AppError(status, "TEST", "Gagal"));
    expect(
      (await runtime({ ...session(), clientKey: "ptlc_test" }, server())).state,
    ).toBe("unknown");
  },
);
it("suspended tidak dianggap stopped", async () => {
  expect(
    (await runtime(session(), { ...server(), suspended: true })).state,
  ).toBe("suspended");
  expect(request).not.toHaveBeenCalled();
});
it("payload tidak dikenal menjadi unknown", async () => {
  vi.mocked(request).mockResolvedValue({
    attributes: { current_state: "invalid" },
  });
  expect(
    (await runtime({ ...session(), clientKey: "ptlc_test" }, server())).state,
  ).toBe("unknown");
});
