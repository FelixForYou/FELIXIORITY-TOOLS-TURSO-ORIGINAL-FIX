import { serverSchema, type Session, type Server } from "../model";
import { allPages, single, request } from "./transport";
export const servers = {
  all: (s: Session) => allPages(s, "servers", serverSchema),
  get: (s: Session, id: number) => single(s, "servers", id, serverSchema),
  delete: (s: Session, id: number) =>
    request(s, `/api/application/servers/${id}`, "DELETE"),
  power: (s: Session, id: number, action: "suspend" | "unsuspend") =>
    request(s, `/api/application/servers/${id}/${action}`, "POST"),
  rename: (s: Session, srv: Server, name: string) =>
    request(s, `/api/application/servers/${srv.id}/details`, "PATCH", {
      name,
      user: srv.user,
      external_id: srv.external_id ?? null,
      description: srv.description ?? "",
    }),
};
