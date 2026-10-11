import { z } from "zod";
export const id = z.number().int().positive();
export const userSchema = z.object({
  id,
  username: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  root_admin: z.boolean(),
  created_at: z.string(),
});
export const serverSchema = z.object({
  id,
  uuid: z.string(),
  identifier: z.string(),
  name: z.string(),
  user: id,
  node: id,
  allocation: id,
  egg: id,
  nest: id,
  suspended: z.boolean(),
  status: z.string().nullable().optional(),
  limits: z.object({
    memory: z.number().nonnegative(),
    disk: z.number().nonnegative(),
    cpu: z.number().nonnegative(),
  }),
  created_at: z.string(),
  description: z.string().nullable().optional(),
  external_id: z.string().nullable().optional(),
});
export const nodeSchema = z.object({
  id,
  name: z.string(),
  fqdn: z.string(),
  location_id: id,
  memory: z.number(),
  disk: z.number(),
});
export type User = z.infer<typeof userSchema>;
export type Server = z.infer<typeof serverSchema>;
export type Node = z.infer<typeof nodeSchema>;
export type RuntimeState =
  | "running"
  | "starting"
  | "stopping"
  | "stopped"
  | "suspended"
  | "installing"
  | "node_unreachable"
  | "unknown";
export type Runtime = {
  state: RuntimeState;
  checkedAt: string;
  reason?: string;
  retryAfter?: number;
};
export type Snapshot = {
  servers: Server[];
  users: User[];
  nodes: Node[];
  nodeError?: string;
  syncedAt: string;
  totals: { servers: number; users: number; nodes: number | null };
};
export type Settings = {
  checks: number;
  interval: number;
  minStopped: number;
  dryRun: boolean;
};
export type Session = {
  domain: string;
  key: string;
  clientKey?: string;
  csrf: string;
  expiresAt: number;
  settings: Settings;
};
export type Audit = {
  at: string;
  action: string;
  target?: number;
  outcome: string;
};
export type Result = { id: number; ok: boolean; message: string };
export type Job = {
  id: string;
  kind:
    | "scan"
    | "delete-server"
    | "delete-user"
    | "unused"
    | "offline"
    | "suspend"
    | "unsuspend";
  ids: number[];
  cursor: number;
  results: Result[];
  runtime: Record<number, Runtime>;
  status: "ready" | "running" | "complete" | "cancelled";
  createdAt: string;
  expiresAt: number;
  phrase: string;
  confirmed: boolean;
  dryRun: boolean;
  settings: Settings;
};
export function ownerCounts(servers: Server[], users: User[]) {
  const usersSet = new Set(users.map((u) => u.id));
  const counts = new Map<number, number>();
  for (const s of servers) {
    if (!usersSet.has(s.user))
      throw new Error("Relasi owner tidak lengkap. Sinkronisasi ulang.");
    counts.set(s.user, (counts.get(s.user) || 0) + 1);
  }
  return counts;
}
export function unusedUsers(s: Snapshot) {
  const counts = ownerCounts(s.servers, s.users);
  return s.users.filter((u) => !u.root_admin && !counts.has(u.id));
}
export function canDeleteOffline(
  s: Server,
  r: Runtime,
  protectedIds: number[],
) {
  return (
    !s.suspended &&
    !s.status &&
    r.state === "stopped" &&
    !protectedIds.includes(s.id)
  );
}
