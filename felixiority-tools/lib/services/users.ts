import { userSchema, type Session } from "../model";
import { allPages, single, request } from "./transport";
export const users = {
  all: (s: Session) => allPages(s, "users", userSchema),
  get: (s: Session, id: number) => single(s, "users", id, userSchema),
  delete: (s: Session, id: number) =>
    request(s, `/api/application/users/${id}`, "DELETE"),
};
