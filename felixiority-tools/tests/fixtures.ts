import type { Server, User, Session, Snapshot } from "../lib/model";
export const user = (id = 1, root_admin = false): User => ({
  id,
  username: "user" + id,
  email: `user${id}@example.com`,
  first_name: "User",
  last_name: String(id),
  root_admin,
  created_at: "2026-01-01T00:00:00Z",
});
export const server = (id = 1, owner = 1): Server => ({
  id,
  uuid: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  identifier: `abcd${id}`,
  name: "Server " + id,
  user: owner,
  node: 1,
  allocation: id,
  egg: 1,
  nest: 1,
  suspended: false,
  status: null,
  limits: { memory: 1024, cpu: 100, disk: 2048 },
  created_at: "2026-01-01T00:00:00Z",
});
export const session = (): Session => ({
  domain: "https://panel.example.com",
  key: "ptla_" + "a".repeat(32),
  csrf: "b".repeat(64),
  expiresAt: Date.now() + 3600000,
  settings: { checks: 1, interval: 1, minStopped: 0, dryRun: false },
});
export const snapshot = (): Snapshot => ({
  servers: [server(1, 1), server(2, 2)],
  users: [user(1), user(2), user(3), user(4, true)],
  nodes: [
    {
      id: 1,
      name: "node",
      fqdn: "node.example.com",
      location_id: 1,
      memory: 4096,
      disk: 8192,
    },
  ],
  totals: { servers: 2, users: 4, nodes: 1 },
  syncedAt: new Date().toISOString(),
});
