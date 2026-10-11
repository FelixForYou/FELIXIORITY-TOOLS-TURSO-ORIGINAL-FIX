import { beforeEach, describe, it, expect, vi } from "vitest";
import dns from "node:dns/promises";
import {
  panelURL,
  publicAddress,
  resolvePublic,
  checkOrigin,
} from "../lib/security";
import { seal, unseal } from "../lib/store";
beforeEach(() => {
  process.env.SESSION_SECRET = "a".repeat(64);
  process.env.APP_ORIGIN = "https://tools.example.com";
  delete process.env.PANEL_ALLOWED_HOSTS;
});
describe("SSRF dan sesi", () => {
  it.each([
    "127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "100.64.0.1",
    "224.0.0.1",
  ])("blok IP %s", (ip) => expect(publicAddress(ip)).toBe(false));
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "izinkan public unicast %s",
    (ip) => expect(publicAddress(ip)).toBe(true),
  );
  it.each([
    "http://panel.example.com",
    "https://a:b@example.com",
    "https://example.com/path",
    "https://example.com:8080",
    "https://example.com/?key=a",
    "https://localhost",
    "https://example.com#x",
  ])("blok URL %s", (url) => expect(() => panelURL(url)).toThrow());
  it("normalisasi origin dan allowlist", () => {
    expect(panelURL("https://PANEL.example.com/")).toBe(
      "https://panel.example.com",
    );
    process.env.PANEL_ALLOWED_HOSTS = "other.example.com";
    expect(() => panelURL("https://panel.example.com")).toThrow();
  });
  it("menolak mixed DNS public/internal", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ] as never);
    await expect(resolvePublic("panel.example.com")).rejects.toThrow();
  });
  it("menerima origin tepat, menolak cross origin", () => {
    expect(() =>
      checkOrigin(
        new Request("https://tools.example.com/api/x", {
          headers: {
            origin: "https://evil.example.com",
            "content-type": "application/json",
          },
        }),
      ),
    ).toThrow();
    expect(() =>
      checkOrigin(
        new Request("https://tools.example.com/api/x", {
          headers: {
            origin: "https://tools.example.com",
            "content-type": "application/json",
          },
        }),
      ),
    ).not.toThrow();
  });
  it("encrypt, decrypt dan deteksi perubahan ciphertext", () => {
    const value = { key: "ptla_SECRET" };
    const sealed = seal(value);
    expect(sealed).not.toContain("ptla");
    expect(unseal(sealed)).toEqual(value);
    const b = Buffer.from(sealed, "base64");
    b[40] ^= 1;
    expect(() => unseal(b.toString("base64"))).toThrow();
  });
});
