import { z } from "zod";
import type { Session, Server, Runtime } from "../model";
import { request } from "./transport";
import { AppError } from "../errors";
export async function runtime(s: Session, server: Server): Promise<Runtime> {
  const checkedAt = new Date().toISOString();
  if (server.suspended) return { state: "suspended", checkedAt };
  if (server.status === "installing" || server.status === "install_failed")
    return { state: "installing", checkedAt };
  if (server.status)
    return {
      state: "unknown",
      checkedAt,
      reason: "Status administratif: " + server.status,
    };
  if (!s.clientKey)
    return {
      state: "unknown",
      checkedAt,
      reason: "Status Tidak Tersedia — atur Client API di Settings.",
    };
  try {
    const raw = await request(
      s,
      `/api/client/servers/${encodeURIComponent(server.identifier)}/resources`,
      "GET",
      undefined,
      true,
    );
    const p = z
      .object({
        attributes: z.object({
          current_state: z.enum(["running", "starting", "stopping", "offline"]),
          is_suspended: z.boolean(),
        }),
      })
      .safeParse(raw);
    if (!p.success)
      return {
        state: "unknown",
        checkedAt,
        reason: "Respons runtime tidak dikenal.",
      };
    return {
      state: p.data.attributes.is_suspended
        ? "suspended"
        : p.data.attributes.current_state === "offline"
          ? "stopped"
          : p.data.attributes.current_state,
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      state: "unknown",
      checkedAt: new Date().toISOString(),
      reason: e instanceof AppError ? e.message : "Runtime tidak tersedia.",
      retryAfter: e instanceof AppError ? e.retryAfter : undefined,
    };
  }
}
