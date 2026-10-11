"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  LayoutDashboard,
  Server,
  Users,
  ShieldCheck,
  Network,
  ScanLine,
  UserRoundX,
  Layers,
  ChartNoAxesCombined,
  History,
  Download,
  Settings,
  LogOut,
  Search,
  RefreshCw,
  Menu,
  X,
  ArrowUpRight,
  LoaderCircle,
  Shield,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Pause,
  Play,
  Trash2,
  HardDrive,
  MemoryStick,
  Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, ApiError, download } from "@/lib/client";
import type {
  Snapshot,
  Runtime,
  Job,
  Settings as Config,
  Audit,
  Server as ServerType,
} from "@/lib/model";
import { unusedUsers } from "@/lib/model";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { DataTable, type Row, type Column } from "./table";
import { Brand } from "./connect";
export type SessionView = {
  domain: string;
  csrf: string;
  expiresAt: number;
  hasRuntime: boolean;
  settings: Config;
  protectedIds: number[];
  bulkDelete: boolean;
  apiVersion: string;
};
const navigation: [string, string, LucideIcon, string][] = [
  ["dashboard", "Dashboard", LayoutDashboard, "OVERVIEW"],
  ["servers", "Servers", Server, "MANAGEMENT"],
  ["users", "Users", Users, ""],
  ["admins", "Administrators", ShieldCheck, ""],
  ["nodes", "Nodes", Network, ""],
  ["offline", "Offline Cleaner", ScanLine, "TOOLS"],
  ["unused", "Unused User Cleaner", UserRoundX, ""],
  ["bulk", "Bulk Manager", Layers, ""],
  ["resources", "Resource Analyzer", ChartNoAxesCombined, ""],
  ["logs", "Activity Logs", History, "SYSTEM"],
  ["exports", "Export & Reports", Download, ""],
  ["settings", "Settings", Settings, ""],
];
const labels: Record<string, string> = {
  running: "Running",
  stopped: "Stopped",
  starting: "Starting",
  stopping: "Stopping",
  suspended: "Suspended",
  installing: "Installing",
  node_unreachable: "Node Unreachable",
  unknown: "Tidak tersedia",
};
const size = (n: number) =>
  n === 0
    ? "Unlimited"
    : n >= 1024
      ? (n / 1024).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " GB"
      : n + " MB";
const when = (s: string | number) => new Date(s).toLocaleString("id-ID");
function Badge({ state }: { state: string }) {
  return (
    <span className={"badge " + state}>
      <span className="dot" />
      {labels[state] || state}
    </span>
  );
}
function Stat({
  label,
  value,
  icon: Icon,
  note,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  note?: string;
}) {
  return (
    <motion.article
      className="stat"
      initial={{ opacity: 0, y: 7 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <span>{label}</span>
        <Icon size={19} />
      </div>
      <strong>{value}</strong>
      <small>{note || "Berdasarkan cakupan Application API"}</small>
    </motion.article>
  );
}
export function Dashboard({
  session: s,
  onDisconnect,
}: {
  session: SessionView;
  onDisconnect: () => void;
}) {
  const qc = useQueryClient();
  const [page, P] = useState("dashboard"),
    [drawer, D] = useState(false),
    [selected, S] = useState<number[]>([]),
    [filterNode, FN] = useState("all"),
    [filterStatus, FS] = useState("all"),
    [filterRam, FR] = useState("all"),
    [filterRole, FRo] = useState("all"),
    [globalSearch, GS] = useState(""),
    [detail, Detail] = useState<{ type: string; row: Row } | null>(null),
    [toast, T] = useState(""),
    [error, E] = useState(""),
    [busy, B] = useState(false),
    [preview, Preview] = useState<
      (Job & { targets: { id: number; name: string }[] }) | null
    >(null),
    [phrase, Ph] = useState(""),
    [job, J] = useState<Job | null>(null),
    [running, R] = useState(false),
    [unusedScan, US] = useState<Snapshot | null>(null),
    [tick, Tick] = useState(Date.now());
  const stop = useRef(false);
  useEffect(() => {
    const t = setInterval(() => Tick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => T(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const snapshot = useQuery({
    queryKey: ["snapshot", s.domain],
    queryFn: () => api<Snapshot>("snapshot"),
    refetchInterval: (q) =>
      q.state.error instanceof ApiError
        ? Math.max(15000, q.state.error.retryAfter * 1000)
        : 15000,
    refetchIntervalInBackground: true,
    retry: false,
  });
  const rt = useQuery({
    queryKey: ["runtime", s.domain],
    queryFn: () => api<Record<number, Runtime>>("runtime"),
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    retry: false,
  });
  const audit = useQuery({
    queryKey: ["logs", s.domain],
    queryFn: () => api<Audit[]>("logs"),
    refetchInterval: 15000,
    retry: false,
  });
  const data = snapshot.data,
    rs = rt.data || {};
  const age = data ? tick - Date.parse(data.syncedAt) : Infinity;
  const fresh = !!data && age < 30000 && !snapshot.isError;
  const userIndex = useMemo(
    () => new Map(data?.users.map((u) => [u.id, u]) || []),
    [data],
  );
  const nodeIndex = useMemo(
    () => new Map(data?.nodes.map((n) => [n.id, n]) || []),
    [data],
  );
  const protectedSet = useMemo(() => new Set(s.protectedIds), [s.protectedIds]);
  const srvRows: Row[] = useMemo(
    () =>
      data?.servers.map((v) => ({
        id: v.id,
        name: v.name,
        uuid: v.uuid,
        identifier: v.identifier,
        owner: userIndex.get(v.user)?.username || "Tidak diketahui",
        ownerId: v.user,
        node: nodeIndex.get(v.node)?.name || "Node #" + v.node,
        nodeId: v.node,
        memory: v.limits.memory,
        cpu: v.limits.cpu,
        disk: v.limits.disk,
        status: v.suspended
          ? "suspended"
          : v.status === "installing"
            ? "installing"
            : rs[v.id] && tick - Date.parse(rs[v.id].checkedAt) < 30000
              ? rs[v.id].state
              : "unknown",
        checkedAt: rs[v.id]?.checkedAt,
        runtimeReason: rs[v.id]?.reason || "",
        protected: protectedSet.has(v.id),
        created_at: v.created_at,
        egg: v.egg,
        allocation: v.allocation,
      })) || [],
    [data, rs, protectedSet, userIndex, nodeIndex, tick],
  );
  const counts = useMemo(() => {
    const m = new Map<number, number>();
    data?.servers.forEach((v) => m.set(v.user, (m.get(v.user) || 0) + 1));
    return m;
  }, [data]);
  const userRows: Row[] =
    data?.users.map((u) => ({
      ...u,
      name: u.first_name + " " + u.last_name,
      role: u.root_admin ? "Admin · Protected" : "User",
      owned: counts.get(u.id) || 0,
    })) || [];
  const nodeRows: Row[] =
    data?.nodes.map((n) => ({
      ...n,
      servers: data.servers.filter((v) => v.node === n.id).length,
      ram: data.servers
        .filter((v) => v.node === n.id)
        .reduce((t, v) => t + v.limits.memory, 0),
      storage: data.servers
        .filter((v) => v.node === n.id)
        .reduce((t, v) => t + v.limits.disk, 0),
      connection: "Tidak terverifikasi",
    })) || [];
  const filtered = srvRows.filter(
    (r) =>
      (filterNode === "all" || r.nodeId === Number(filterNode)) &&
      (filterStatus === "all" || r.status === filterStatus) &&
      (filterRam === "all" ||
        (filterRam === "unlimited"
          ? r.memory === 0
          : filterRam === "small"
            ? Number(r.memory) > 0 && Number(r.memory) <= 1024
            : Number(r.memory) > 1024)),
  );
  const serverCols: Column[] = [
    { key: "id", label: "ID" },
    {
      key: "name",
      label: "Server",
      render: (r) => (
        <div className="name-cell">
          <b>{String(r.name)}</b>
          <small>
            {String(r.identifier)}{" "}
            {Boolean(r.protected) && <Shield size={12} />}
          </small>
        </div>
      ),
    },
    {
      key: "uuid",
      label: "UUID",
      render: (r) => (
        <span className="truncate" title={String(r.uuid)}>
          {String(r.uuid).slice(0, 13)}…
        </span>
      ),
    },
    { key: "owner", label: "Owner" },
    { key: "node", label: "Node" },
    { key: "memory", label: "RAM", render: (r) => size(Number(r.memory)) },
    {
      key: "cpu",
      label: "CPU",
      render: (r) => (r.cpu === 0 ? "Unlimited" : r.cpu + "%"),
    },
    { key: "disk", label: "Disk", render: (r) => size(Number(r.disk)) },
    {
      key: "status",
      label: "Status",
      render: (r) => <Badge state={String(r.status)} />,
    },
  ];
  const userCols: Column[] = [
    { key: "id", label: "ID" },
    { key: "username", label: "Username" },
    { key: "email", label: "Email" },
    { key: "name", label: "Nama" },
    {
      key: "role",
      label: "Role",
      render: (r) => (
        <span className={r.root_admin ? "protected-tag" : ""}>
          {String(r.role)}
        </span>
      ),
    },
    { key: "owned", label: "Servers" },
    {
      key: "created_at",
      label: "Dibuat",
      render: (r) => when(String(r.created_at)),
    },
  ];
  function navigate(v: string) {
    P(v);
    S([]);
    D(false);
    FN("all");
    FS("all");
    FR("all");
    FRo("all");
    GS("");
  }
  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["snapshot"] }),
      qc.invalidateQueries({ queryKey: ["session"] }),
      qc.invalidateQueries({ queryKey: ["runtime"] }),
      qc.invalidateQueries({ queryKey: ["logs"] }),
    ]);
  }
  async function action(fn: () => Promise<unknown>, success?: string) {
    B(true);
    E("");
    try {
      await fn();
      if (success) T(success);
      await invalidate();
    } catch (e) {
      E(e instanceof Error ? e.message : "Operasi gagal.");
    } finally {
      B(false);
    }
  }
  async function prepare(kind: Job["kind"], ids: number[]) {
    await action(async () => {
      const p = await api<Job & { targets: { id: number; name: string }[] }>(
        "jobs",
        { kind, ids },
        s.csrf,
      );
      Preview(p);
      Ph("");
    });
  }
  async function run(p: Job) {
    Preview(null);
    R(true);
    stop.current = false;
    E("");
    let current = p;
    J(current);
    try {
      while (!["complete", "cancelled"].includes(current.status)) {
        current = await api<Job>(
          "jobs/" + p.id,
          { phrase: p.phrase, cancel: stop.current },
          s.csrf,
        );
        J(current);
        if (current.kind === "scan")
          qc.setQueryData(["runtime", s.domain], current.runtime);
      }
      const failures = current.results.filter((item) => !item.ok).length;
      if (failures)
        E(
          `Pekerjaan berhenti/selesai dengan ${failures} item gagal atau tidak diketahui. Periksa hasil per item.`,
        );
      else
        T(
          current.status === "complete"
            ? "Pekerjaan selesai. Periksa hasil per item."
            : "Pekerjaan dibatalkan.",
        );
    } catch (e) {
      E(e instanceof Error ? e.message : "Pekerjaan terhenti.");
    } finally {
      R(false);
      await invalidate();
    }
  }
  const allRuntime =
    srvRows.length > 0 &&
    srvRows.every(
      (v) =>
        v.status !== "unknown" &&
        rs[v.id] &&
        tick - Date.parse(rs[v.id].checkedAt) < 30000,
    );
  const runningCount = srvRows.filter((v) => v.status === "running").length,
    stoppedCount = srvRows.filter((v) => v.status === "stopped").length;
  const searchResults = globalSearch.trim()
    ? [
        ...srvRows.map((row) => ({ type: "server", row })),
        ...userRows.map((row) => ({ type: "user", row })),
        ...nodeRows.map((row) => ({ type: "node", row })),
      ]
        .filter(({ row }) =>
          Object.values(row).some((v) =>
            String(v).toLowerCase().includes(globalSearch.toLowerCase()),
          ),
        )
        .slice(0, 10)
    : [];
  const sumRam = data?.servers.reduce((t, v) => t + v.limits.memory, 0) || 0,
    sumDisk = data?.servers.reduce((t, v) => t + v.limits.disk, 0) || 0;
  const filters = (
    <>
      <select
        aria-label="Filter node"
        value={filterNode}
        onChange={(e) => FN(e.target.value)}
      >
        <option value="all">Semua node</option>
        {data?.nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter status"
        value={filterStatus}
        onChange={(e) => FS(e.target.value)}
      >
        <option value="all">Semua status</option>
        {Object.entries(labels).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter RAM"
        value={filterRam}
        onChange={(e) => FR(e.target.value)}
      >
        <option value="all">Semua RAM</option>
        <option value="small">≤ 1 GB</option>
        <option value="large">&gt; 1 GB</option>
        <option value="unlimited">Unlimited</option>
      </select>
    </>
  );
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (drawer ? "is-open" : "")}>
        <Brand />
        <button
          className="drawer-close icon-btn"
          aria-label="Tutup navigasi"
          onClick={() => D(false)}
        >
          <X />
        </button>
        <div className="workspace-label">
          <span className="dot" /> PANEL WORKSPACE
        </div>
        <nav>
          {navigation.map(([key, label, Icon, group]) => (
            <div key={key}>
              {group && <p className="nav-group">{group}</p>}
              <button
                onClick={() => navigate(key)}
                className={page === key ? "active" : ""}
              >
                <Icon size={18} />
                {label}
                {page === key && <span className="nav-dot" />}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <ShieldCheck size={20} />
          <span>
            Sesi terenkripsi
            <small>
              Berakhir {new Date(s.expiresAt).toLocaleTimeString("id-ID")}
            </small>
          </span>
        </div>
        <button
          className="disconnect"
          disabled={busy || running}
          onClick={() =>
            action(async () => {
              await api("disconnect", {}, s.csrf);
              qc.clear();
              onDisconnect();
            })
          }
        >
          <LogOut size={17} /> Disconnect
        </button>
      </aside>
      {drawer && (
        <button
          className="drawer-backdrop"
          onClick={() => D(false)}
          aria-label="Tutup menu"
        />
      )}
      <div className="app-main">
        <header className="topbar">
          <button
            className="mobile-menu icon-btn"
            onClick={() => D(true)}
            aria-label="Buka navigasi"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <b>{navigation.find((n) => n[0] === page)?.[1]}</b>
          </div>
          <div className="global-search">
            <Search size={17} />
            <input
              aria-label="Pencarian global"
              placeholder="Cari di seluruh panel…"
              value={globalSearch}
              onChange={(e) => GS(e.target.value)}
            />
            {globalSearch && (
              <div className="search-results">
                {searchResults.length ? (
                  searchResults.map(({ type, row }) => (
                    <button
                      key={type + row.id}
                      onClick={() => {
                        Detail({ type, row });
                        GS("");
                      }}
                    >
                      <span>
                        {String(row.name || row.username)}
                        <small>
                          {type} #{row.id}
                        </small>
                      </span>
                      <ArrowUpRight size={16} />
                    </button>
                  ))
                ) : (
                  <p>Tidak ada hasil.</p>
                )}
              </div>
            )}
          </div>
          <span className="avatar">F</span>
        </header>
        <main className="workspace">
          <div className="page-heading">
            <div>
              <span className="eyebrow">FELIXIORITY / CONTROL CENTER</span>
              <h1>
                {page === "dashboard"
                  ? "Panel Overview."
                  : navigation.find((n) => n[0] === page)?.[1] + "."}
              </h1>
              <p className="muted">
                {s.domain.replace("https://", "")}{" "}
                <span className="inline-separator">/</span> Data asli. Kendali
                penuh.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={snapshot.isFetching || busy || running}
              onClick={() =>
                action(async () => {
                  const d = await api<Snapshot>("snapshot?force=1");
                  qc.setQueryData(["snapshot", s.domain], d);
                }, "Sinkronisasi selesai.")
              }
            >
              <RefreshCw
                size={17}
                className={snapshot.isFetching ? "spin" : ""}
              />{" "}
              Refresh
            </Button>
          </div>
          <div className="sync-bar">
            <span className={"sync-state " + (!fresh ? "warning" : "")}>
              <span className="dot" />
              {snapshot.isFetching
                ? "Syncing"
                : snapshot.isError
                  ? "Error"
                  : fresh
                    ? "Fresh"
                    : "Stale"}
            </span>
            <span>
              Polling setiap 15 detik · Sinkronisasi terakhir:{" "}
              {data ? when(data.syncedAt) : "belum tersedia"}
            </span>
            <span className="sync-end">
              <ShieldCheck size={15} /> Application API
            </span>
          </div>
          {(error || snapshot.error) && (
            <div className="notice error" role="alert">
              <AlertTriangle size={19} />
              <span>
                {error || snapshot.error?.message} Data sebelumnya tidak
                dianggap terbaru.
              </span>
              <button aria-label="Tutup pesan" onClick={() => E("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {data?.nodeError && (
            <div className="notice">
              <AlertTriangle size={18} /> Data node belum lengkap:{" "}
              {data.nodeError}
            </div>
          )}
          {job && (
            <section className="job-panel">
              <div className="section-title">
                <div>
                  <b>
                    {job.dryRun ? "DRY-RUN · " : ""}
                    {job.kind} · {job.status}
                  </b>
                  <p>
                    {job.cursor}/{job.ids.length} diproses ·{" "}
                    {job.results.filter((r) => r.ok).length} berhasil ·{" "}
                    {job.results.filter((r) => !r.ok).length} gagal/tidak
                    diketahui
                  </p>
                </div>
                {running ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      stop.current = true;
                      T("Berhenti setelah batch yang sedang berjalan.");
                    }}
                  >
                    Batalkan berikutnya
                  </Button>
                ) : job.status === "running" ? (
                  <Button size="sm" onClick={() => run(job)}>
                    Lanjutkan pemeriksaan hasil
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => J(null)}>
                    Tutup
                  </Button>
                )}
              </div>
              <progress max={job.ids.length || 1} value={job.cursor} />
              <details>
                <summary>Hasil per item</summary>
                <div className="result-list">
                  {job.results.map((r, i) => (
                    <p key={i} className={r.ok ? "" : "error"}>
                      #{r.id} — {r.message}
                    </p>
                  ))}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => download("hasil-operasi", job.results, "json")}
                >
                  Export hasil
                </Button>
              </details>
            </section>
          )}
          {!data && snapshot.isLoading ? (
            <div className="stats-grid">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="skeleton" key={i} />
              ))}
            </div>
          ) : !data ? (
            <div className="empty">
              <AlertTriangle />
              <h2>Data belum tersedia.</h2>
              <p>
                Periksa izin API membaca users dan servers, lalu lakukan
                refresh.
              </p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {page === "dashboard" && (
                  <>
                    <div className="overview-banner">
                      <div>
                        <span className="eyebrow">
                          YOUR INFRASTRUCTURE, IN FOCUS.
                        </span>
                        <h2>
                          Semua terhubung.
                          <br />
                          Semua terkendali.
                        </h2>
                        <p>Kelola resource panel dari satu ruang kerja.</p>
                        <Button
                          variant="outline"
                          onClick={() => navigate("servers")}
                        >
                          Kelola servers <ArrowUpRight size={18} />
                        </Button>
                      </div>
                      <div className="banner-art" aria-hidden="true">
                        <Server size={88} strokeWidth={1} />
                        <span>F / CONTROL</span>
                        <div className="orbit" />
                      </div>
                    </div>
                    <div className="stats-grid">
                      <Stat
                        label="Total Servers"
                        value={data.totals.servers}
                        icon={Server}
                      />
                      <Stat
                        label="Total Users"
                        value={data.totals.users}
                        icon={Users}
                      />
                      <Stat
                        label="Total Admins"
                        value={data.users.filter((u) => u.root_admin).length}
                        icon={ShieldCheck}
                      />
                      <Stat
                        label="Total Nodes"
                        value={data.totals.nodes ?? "—"}
                        icon={Network}
                      />
                      <Stat
                        label="Running Servers"
                        value={allRuntime ? runningCount : "—"}
                        icon={Play}
                        note={
                          allRuntime
                            ? "Status terverifikasi < 30 detik"
                            : `Cakupan runtime belum lengkap · ${runningCount} terverifikasi`
                        }
                      />
                      <Stat
                        label="Stopped Servers"
                        value={allRuntime ? stoppedCount : "—"}
                        icon={Pause}
                        note="Unknown tidak dihitung sebagai stopped"
                      />
                    </div>
                    <div className="dashboard-grid">
                      <section className="panel">
                        <div className="section-title">
                          <h3>Distribusi per node</h3>
                          <ChartNoAxesCombined size={20} />
                        </div>
                        <NodeChart rows={nodeRows} />
                        <p className="muted">
                          Jumlah server terdaftar, bukan proses yang berjalan.
                        </p>
                      </section>
                      <section className="panel">
                        <h3>Alokasi resource</h3>
                        <div className="resource-line">
                          <MemoryStick />
                          <span>RAM terbatas dialokasikan</span>
                          <b>{(sumRam / 1024).toFixed(1)} GB</b>
                        </div>
                        <div className="resource-line">
                          <HardDrive />
                          <span>Disk terbatas dialokasikan</span>
                          <b>{(sumDisk / 1024).toFixed(1)} GB</b>
                        </div>
                        <p className="muted">
                          Limit unlimited (0) tidak dijumlahkan. Bukan
                          penggunaan runtime.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate("resources")}
                        >
                          Buka analyzer <ArrowUpRight size={15} />
                        </Button>
                        <hr />
                        <div className="resource-line">
                          <Activity />
                          <span>Panel API</span>
                          <Badge
                            state={fresh ? "Terhubung" : "Perlu diperiksa"}
                          />
                        </div>
                        <p className="muted">
                          Koneksi Wings/node tidak disimpulkan dari daftar node.
                        </p>
                      </section>
                    </div>
                    <div className="section-title">
                      <h3>Server terbaru</h3>
                      <button
                        className="text-link"
                        onClick={() => navigate("servers")}
                      >
                        Lihat semua ↗
                      </button>
                    </div>
                    <DataTable
                      rows={[...srvRows]
                        .sort((a, b) =>
                          String(b.created_at).localeCompare(
                            String(a.created_at),
                          ),
                        )
                        .slice(0, 5)}
                      columns={serverCols.filter((c) =>
                        ["name", "owner", "node", "status"].includes(c.key),
                      )}
                      onOpen={(row) => Detail({ type: "server", row })}
                    />
                    <div className="dashboard-grid">
                      <section className="panel">
                        <h3>Pengguna terbaru</h3>
                        {[...userRows]
                          .sort((a, b) =>
                            String(b.created_at).localeCompare(
                              String(a.created_at),
                            ),
                          )
                          .slice(0, 5)
                          .map((u) => (
                            <button
                              className="recent-row"
                              key={u.id}
                              onClick={() => Detail({ type: "user", row: u })}
                            >
                              <span>
                                {String(u.username)}
                                <small>{String(u.email)}</small>
                              </span>
                              <ArrowUpRight size={16} />
                            </button>
                          ))}
                      </section>
                      <section className="panel">
                        <h3>Aktivitas tools terbaru</h3>
                        {audit.data?.slice(0, 5).map((l, i) => (
                          <div className="recent-row" key={i}>
                            <span>
                              {l.action}
                              <small>{when(l.at)}</small>
                            </span>
                            <span>{l.outcome}</span>
                          </div>
                        ))}
                        <p className="muted">
                          Aktivitas dari aplikasi ini, bukan seluruh audit
                          panel.
                        </p>
                      </section>
                    </div>
                  </>
                )}
                {["servers", "bulk"].includes(page) && (
                  <>
                    <div className="action-strip">
                      <span>{selected.length} server dipilih</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!selected.length || busy || running || !fresh}
                        onClick={() => prepare("suspend", selected)}
                      >
                        <Pause size={15} /> Suspend
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!selected.length || busy || running || !fresh}
                        onClick={() => prepare("unsuspend", selected)}
                      >
                        <Play size={15} /> Unsuspend
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={
                          !selected.length ||
                          busy ||
                          running ||
                          !fresh ||
                          (!s.bulkDelete && selected.length > 1)
                        }
                        onClick={() => prepare("delete-server", selected)}
                      >
                        <Trash2 size={15} /> Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!selected.length}
                        onClick={() =>
                          download(
                            "selected-servers",
                            srvRows.filter((r) => selected.includes(r.id)),
                          )
                        }
                      >
                        Export pilihan
                      </Button>
                    </div>
                    <DataTable
                      rows={filtered}
                      columns={serverCols}
                      selected={selected}
                      onSelect={S}
                      eligible={(r) => !r.protected}
                      onOpen={(row) => Detail({ type: "server", row })}
                      toolbar={filters}
                      exportName="servers"
                    />
                  </>
                )}
                {["users", "admins"].includes(page) && (
                  <>
                    {page === "admins" && (
                      <div className="admin-callout">
                        <ShieldCheck size={34} />
                        <div>
                          <h2>
                            {userRows.filter((u) => u.root_admin).length}{" "}
                            administrator terlindungi.
                          </h2>
                          <p>
                            Akun admin tidak bisa dipilih untuk cleanup atau
                            penghapusan di tools ini.
                          </p>
                        </div>
                      </div>
                    )}
                    {page === "users" && (
                      <div className="action-strip">
                        <select
                          aria-label="Filter role pengguna"
                          value={filterRole}
                          onChange={(e) => FRo(e.target.value)}
                        >
                          <option value="all">Semua pengguna</option>
                          <option value="user">User biasa</option>
                          <option value="admin">Administrator</option>
                          <option value="empty">Tanpa server</option>
                        </select>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={
                            !selected.length ||
                            !fresh ||
                            running ||
                            busy ||
                            (!s.bulkDelete && selected.length > 1)
                          }
                          onClick={() => prepare("delete-user", selected)}
                        >
                          Hapus terpilih ({selected.length})
                        </Button>
                      </div>
                    )}
                    <DataTable
                      rows={userRows.filter((u) =>
                        page === "admins"
                          ? u.root_admin
                          : filterRole === "user"
                            ? !u.root_admin
                            : filterRole === "admin"
                              ? u.root_admin
                              : filterRole === "empty"
                                ? u.owned === 0
                                : true,
                      )}
                      columns={userCols}
                      selected={selected}
                      onSelect={page === "users" ? S : undefined}
                      eligible={(r) => !r.root_admin && r.owned === 0}
                      onOpen={(row) => Detail({ type: "user", row })}
                      exportName={page}
                    />
                  </>
                )}
                {page === "nodes" && (
                  <>
                    <div className="notice">
                      <Network size={20} /> Status koneksi node tidak tersedia
                      dari list Application API. FQDN bukan bukti node online.
                    </div>
                    <DataTable
                      rows={nodeRows}
                      columns={[
                        { key: "id", label: "ID" },
                        { key: "name", label: "Node" },
                        { key: "location_id", label: "Location ID" },
                        { key: "fqdn", label: "FQDN" },
                        { key: "servers", label: "Servers" },
                        {
                          key: "ram",
                          label: "RAM dialokasikan",
                          render: (r) => Number(r.ram) + " MB",
                        },
                        {
                          key: "storage",
                          label: "Disk dialokasikan",
                          render: (r) => Number(r.storage) + " MB",
                        },
                        { key: "connection", label: "Koneksi" },
                      ]}
                      onOpen={(row) => Detail({ type: "node", row })}
                      exportName="nodes"
                    />
                  </>
                )}
                {page === "offline" && (
                  <>
                    <div className="tool-intro">
                      <div className="tool-icon">
                        <ScanLine size={36} />
                      </div>
                      <div>
                        <h2>Bersihkan dengan kepastian.</h2>
                        <p>
                          Hanya proses stopped yang terverifikasi. Status
                          diperiksa ulang sebelum setiap penghapusan.
                        </p>
                      </div>
                      <Button
                        disabled={!s.hasRuntime || busy || running || !fresh}
                        onClick={() => prepare("scan", [])}
                      >
                        <ScanLine size={17} /> Scan Servers
                      </Button>
                    </div>
                    {!s.hasRuntime && (
                      <div className="notice">
                        <AlertTriangle size={18} />
                        <span>
                          Status Tidak Tersedia. Tambahkan Client API di
                          Settings untuk mengaktifkan scanner.
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate("settings")}
                        >
                          Settings
                        </Button>
                      </div>
                    )}
                    <div className="action-strip">
                      <Button
                        variant="outline"
                        disabled={!s.hasRuntime || running}
                        onClick={() =>
                          S(
                            srvRows
                              .filter(
                                (r) => r.status === "stopped" && !r.protected,
                              )
                              .map((r) => r.id),
                          )
                        }
                      >
                        Select All Stopped
                      </Button>
                      <Button
                        variant="danger"
                        disabled={
                          !selected.length ||
                          running ||
                          busy ||
                          !fresh ||
                          (!s.bulkDelete && selected.length > 1)
                        }
                        onClick={() => prepare("offline", selected)}
                      >
                        Delete Selected Servers
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          download("offline-cleanup-preview", srvRows, "json")
                        }
                      >
                        Export preview
                      </Button>
                    </div>
                    <DataTable
                      rows={srvRows}
                      columns={[
                        ...serverCols.filter((c) =>
                          ["id", "name", "owner", "node", "status"].includes(
                            c.key,
                          ),
                        ),
                        {
                          key: "checkedAt",
                          label: "Terakhir diperiksa",
                          render: (r) =>
                            r.checkedAt
                              ? when(String(r.checkedAt))
                              : "Belum diperiksa",
                        },
                      ]}
                      selected={selected}
                      onSelect={S}
                      eligible={(r) =>
                        r.status === "stopped" && !r.protected && s.hasRuntime
                      }
                      onOpen={(row) => Detail({ type: "server", row })}
                    />
                    <p className="muted">
                      Hasil runtime kedaluwarsa setelah 30 detik. Error jaringan
                      selalu menjadi unknown, bukan stopped. Durasi minimum
                      adalah pengamatan berulang, bukan jaminan status di antara
                      pemeriksaan.
                    </p>
                  </>
                )}
                {page === "unused" && (
                  <>
                    <div className="tool-intro">
                      <div className="tool-icon">
                        <UserRoundX size={36} />
                      </div>
                      <div>
                        <h2>Rapikan akun tanpa server.</h2>
                        <p>
                          Seluruh halaman users dan servers diperiksa.
                          Administrator selalu dilindungi.
                        </p>
                      </div>
                      <Button
                        disabled={busy || running}
                        onClick={() =>
                          action(async () => {
                            const d = await api<Snapshot>("snapshot?force=1");
                            unusedUsers(d);
                            US(d);
                            S([]);
                          }, "Analisis pengguna selesai.")
                        }
                      >
                        Scan Unused Users
                      </Button>
                    </div>
                    <div className="notice">
                      <ShieldCheck size={18} /> Server stopped/suspended tetap
                      dihitung. Akses subuser belum dianalisis; tinjau akun
                      sebelum menghapus.
                    </div>
                    {unusedScan ? (
                      <>
                        <p className="muted">
                          Diperiksa {when(unusedScan.syncedAt)} · kelayakan
                          diperiksa lagi saat eksekusi.
                        </p>
                        <div className="action-strip">
                          <Button
                            variant="outline"
                            onClick={() =>
                              S(unusedUsers(unusedScan).map((u) => u.id))
                            }
                          >
                            Select All Eligible
                          </Button>
                          <Button
                            variant="danger"
                            disabled={
                              !selected.length ||
                              busy ||
                              running ||
                              !fresh ||
                              (!s.bulkDelete && selected.length > 1)
                            }
                            onClick={() => prepare("unused", selected)}
                          >
                            Delete Selected
                          </Button>
                        </div>
                        <DataTable
                          rows={unusedUsers(unusedScan).map((u) => ({
                            ...u,
                            name: u.first_name + " " + u.last_name,
                            owned: 0,
                            role: "User",
                          }))}
                          columns={userCols}
                          selected={selected}
                          onSelect={S}
                          exportName="unused-users"
                        />
                      </>
                    ) : (
                      <div className="empty">
                        <UserRoundX />
                        <h3>Mulai analisis pengguna.</h3>
                        <p>
                          Tekan Scan Unused Users untuk menghasilkan daftar yang
                          terverifikasi.
                        </p>
                      </div>
                    )}
                  </>
                )}
                {page === "resources" && (
                  <>
                    <div className="stats-grid">
                      <Stat
                        label="RAM terbatas dialokasikan"
                        value={(sumRam / 1024).toFixed(1) + " GB"}
                        icon={MemoryStick}
                      />
                      <Stat
                        label="Disk terbatas dialokasikan"
                        value={(sumDisk / 1024).toFixed(1) + " GB"}
                        icon={HardDrive}
                      />
                      <Stat
                        label="CPU terbatas dialokasikan"
                        value={
                          data.servers.reduce((t, v) => t + v.limits.cpu, 0) +
                          "%"
                        }
                        icon={Activity}
                      />
                    </div>
                    <div className="notice">
                      Ini limit konfigurasi, bukan pemakaian aktual. RAM
                      unlimited:{" "}
                      {data.servers.filter((v) => v.limits.memory === 0).length}{" "}
                      · Disk unlimited:{" "}
                      {data.servers.filter((v) => v.limits.disk === 0).length} ·
                      CPU unlimited:{" "}
                      {data.servers.filter((v) => v.limits.cpu === 0).length}.
                    </div>
                    <section className="panel">
                      <h3>Distribusi server & RAM per node</h3>
                      <NodeChart rows={nodeRows} />
                      {nodeRows.map((n) => (
                        <div className="resource-line" key={n.id}>
                          <span>{String(n.name)}</span>
                          <b>
                            {(Number(n.ram) / 1024).toFixed(1)} GB RAM terbatas
                          </b>
                        </div>
                      ))}
                    </section>
                    <h3 className="spaced-heading">
                      10 alokasi RAM terbatas terbesar
                    </h3>
                    <DataTable
                      rows={[...srvRows]
                        .filter((r) => Number(r.memory) > 0)
                        .sort((a, b) => Number(b.memory) - Number(a.memory))
                        .slice(0, 10)}
                      columns={serverCols}
                      onOpen={(row) => Detail({ type: "server", row })}
                    />
                  </>
                )}
                {page === "logs" && (
                  <>
                    <div className="notice">
                      Log aktivitas aplikasi · maksimal 1.000 entri per panel ·
                      retensi 30 hari · tanpa API key.
                    </div>
                    <DataTable
                      rows={(audit.data || []).map((l, i) => ({
                        id: i + 1,
                        ...l,
                      }))}
                      columns={[
                        {
                          key: "at",
                          label: "Waktu",
                          render: (r) => when(String(r.at)),
                        },
                        { key: "action", label: "Aktivitas" },
                        { key: "target", label: "Target ID" },
                        { key: "outcome", label: "Hasil" },
                      ]}
                      exportName="activity-logs"
                    />
                    {audit.error && (
                      <p className="error">{audit.error.message}</p>
                    )}
                  </>
                )}
                {page === "exports" && (
                  <>
                    <div className="notice">
                      <Download size={18} /> Export berisi metadata. File dan
                      backup server tidak termasuk.
                    </div>
                    <div className="feature-grid">
                      {[
                        ["Servers", srvRows],
                        ["Users", userRows],
                        [
                          "Administrators",
                          userRows.filter((u) => u.root_admin),
                        ],
                        ["Nodes", nodeRows],
                        [
                          "Cleanup Preview",
                          srvRows.filter(
                            (r) => r.status === "stopped" && !r.protected,
                          ),
                        ],
                        ["Activity Logs", audit.data || []],
                      ].map(([label, rows]) => (
                        <section className="feature" key={String(label)}>
                          <Download size={26} />
                          <h3>{String(label)}</h3>
                          <p>{(rows as object[]).length} entri tersedia</p>
                          <div className="button-row">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                download(String(label), rows as object[])
                              }
                            >
                              CSV
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                download(
                                  String(label),
                                  rows as object[],
                                  "json",
                                )
                              }
                            >
                              JSON
                            </Button>
                          </div>
                        </section>
                      ))}
                    </div>
                  </>
                )}
                {page === "settings" && (
                  <SettingsPanel
                    session={s}
                    busy={busy}
                    onSave={(v) =>
                      action(
                        () => api("settings", v, s.csrf),
                        "Settings disimpan.",
                      )
                    }
                    onReconnect={() =>
                      action(async () => {
                        await api("disconnect", {}, s.csrf);
                        qc.clear();
                        onDisconnect();
                      })
                    }
                    onRefresh={() =>
                      action(async () => {
                        const d = await api<Snapshot>("snapshot?force=1");
                        qc.setQueryData(["snapshot", s.domain], d);
                      }, "Izin baca users dan servers berhasil diverifikasi.")
                    }
                    snapshot={data}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
          <footer className="workspace-footer">
            <span>FELIXIORITY TOOLS</span>
            <span>Control with confidence.</span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav">
        {navigation
          .filter((n) =>
            ["dashboard", "servers", "users", "offline"].includes(n[0]),
          )
          .map(([key, label, I]) => (
            <button
              key={key}
              className={page === key ? "active" : ""}
              onClick={() => navigate(key)}
            >
              <I size={20} />
              <span>{label.replace(" Cleaner", "")}</span>
            </button>
          ))}
        <button onClick={() => D(true)}>
          <Menu size={20} />
          <span>Lainnya</span>
        </button>
      </nav>
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            className="toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <CheckCircle2 size={19} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <Modal
        open={!!preview}
        onClose={() => Preview(null)}
        title={
          preview?.kind === "scan"
            ? "Preview scan runtime"
            : "Konfirmasi operasi"
        }
        description={
          preview?.kind === "scan"
            ? "Pemeriksaan hanya membaca status. Tidak mengubah server."
            : "Periksa daftar target. Penghapusan dapat menghilangkan data secara permanen."
        }
      >
        {preview && (
          <>
            <div className="notice">
              {preview.dryRun ? "DRY-RUN AKTIF · Tidak ada mutasi. " : ""}
              {preview.kind} · {preview.ids.length} resource
              {preview.kind === "offline" &&
                ` · ${preview.settings.checks} pemeriksaan, interval ${preview.settings.interval}s, minimum ${preview.settings.minStopped}s`}
            </div>
            <div className="target-list">
              {preview.targets.map((t) => (
                <div key={t.id}>
                  <b>{t.name}</b>
                  <span>#{t.id}</span>
                </div>
              ))}
            </div>
            {preview.kind !== "scan" && (
              <label className="confirm-label">
                Ketik <b>{preview.phrase}</b>
                <input
                  value={phrase}
                  onChange={(e) => Ph(e.target.value)}
                  autoComplete="off"
                />
              </label>
            )}
            <Button
              className="full"
              variant={preview.kind === "scan" ? "default" : "danger"}
              disabled={preview.kind !== "scan" && phrase !== preview.phrase}
              onClick={() => run(preview)}
            >
              {preview.kind === "scan" ? "Mulai scan" : "Konfirmasi & jalankan"}
            </Button>
          </>
        )}
      </Modal>
      <Modal
        open={!!detail}
        onClose={() => Detail(null)}
        title={
          detail
            ? String(
                detail.row.name || detail.row.username || "Detail resource",
              )
            : ""
        }
      >
        {detail &&
          (detail.type === "server" ? (
            <ServerDetail
              row={detail.row}
              session={s}
              busy={busy || running}
              onAction={action}
              onJob={(kind, id) => {
                Detail(null);
                prepare(kind, [id]);
              }}
            />
          ) : (
            <dl className="detail-list">
              {Object.entries(detail.row).map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{String(v ?? "—")}</dd>
                </div>
              ))}
            </dl>
          ))}
        {detail?.type === "user" &&
          !detail.row.root_admin &&
          detail.row.owned === 0 && (
            <Button
              variant="danger"
              disabled={busy || running || !fresh}
              onClick={() => {
                const id = detail.row.id;
                Detail(null);
                prepare("delete-user", [id]);
              }}
            >
              Hapus pengguna
            </Button>
          )}
      </Modal>
    </div>
  );
}
function NodeChart({ rows }: { rows: Row[] }) {
  const max = Math.max(1, ...rows.map((n) => Number(n.servers)));
  return (
    <div className="node-chart">
      {rows.length ? (
        rows.map((n) => (
          <div key={n.id}>
            <div>
              <span>{String(n.name)}</span>
              <b>{String(n.servers)}</b>
            </div>
            <div className="bar-track">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(Number(n.servers) / max) * 100}%` }}
              />
            </div>
          </div>
        ))
      ) : (
        <p className="muted">Data node belum tersedia.</p>
      )}
    </div>
  );
}
function SettingsPanel({
  session: s,
  busy,
  onSave,
  onReconnect,
  onRefresh,
  snapshot,
}: {
  session: SessionView;
  busy: boolean;
  onSave: (v: unknown) => void;
  onReconnect: () => void;
  onRefresh: () => void;
  snapshot: Snapshot;
}) {
  const [key, K] = useState(""),
    [cfg, C] = useState(s.settings),
    [remove, RM] = useState(false);
  return (
    <div className="dashboard-grid">
      <section className="panel">
        <h3>Connection Manager</h3>
        <dl className="detail-list">
          <div>
            <dt>Panel</dt>
            <dd>{s.domain}</dd>
          </div>
          <div>
            <dt>API</dt>
            <dd>{s.apiVersion}</dd>
          </div>
          <div>
            <dt>Users / Servers read</dt>
            <dd>Berhasil pada {when(snapshot.syncedAt)}</dd>
          </div>
          <div>
            <dt>Nodes read</dt>
            <dd>{snapshot.nodeError || "Berhasil"}</dd>
          </div>
          <div>
            <dt>Write permissions</dt>
            <dd>Diperiksa saat operasi; tidak diasumsikan.</dd>
          </div>
          <div>
            <dt>Runtime adapter</dt>
            <dd>
              {s.hasRuntime
                ? "Client API terkonfigurasi · cakupan per server"
                : "Belum tersedia"}
            </dd>
          </div>
          <div>
            <dt>Sesi berakhir</dt>
            <dd>{when(s.expiresAt)}</dd>
          </div>
        </dl>
        <div className="button-row">
          <Button variant="outline" onClick={onRefresh} disabled={busy}>
            Periksa koneksi
          </Button>
          <Button variant="outline" onClick={onReconnect} disabled={busy}>
            Reconnect
          </Button>
        </div>
        <p className="muted">
          Reconnect mengakhiri sesi ini, lalu kembali ke form koneksi.
        </p>
        <hr />
        <h3>Protected Resources</h3>
        <p>{s.protectedIds.length} server terlindungi.</p>
        <p className="muted">
          Atur perlindungan dari detail server. Disimpan per domain panel dan
          tetap ada setelah disconnect.
        </p>
      </section>
      <form
        className="panel settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...cfg,
            ...(key ? { clientKey: key } : {}),
            removeRuntime: remove,
          });
          K("");
        }}
      >
        <h3>Runtime & cleanup</h3>
        <p className="muted">
          Client API hanya dapat memeriksa server yang diizinkan untuk key
          tersebut. Kredensial dihapus saat sesi berakhir.
        </p>
        <label>
          Client API key (opsional)
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => K(e.target.value)}
            placeholder="ptlc_…"
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={remove}
            onChange={(e) => RM(e.target.checked)}
          />{" "}
          Hapus kredensial runtime dari sesi
        </label>
        {[
          ["checks", "Jumlah pemeriksaan ulang", 1, 5],
          ["interval", "Interval pemeriksaan (detik)", 1, 5],
          ["minStopped", "Minimal pengamatan stopped (detik)", 0, 20],
        ].map(([key, label, min, max]) => (
          <label key={String(key)}>
            {label}
            <input
              type="number"
              min={Number(min)}
              max={Number(max)}
              required
              value={cfg[key as keyof Config] as number}
              onChange={(e) => C({ ...cfg, [key]: Number(e.target.value) })}
            />
          </label>
        ))}
        <label className="check-label">
          <input
            type="checkbox"
            checked={cfg.dryRun}
            onChange={(e) => C({ ...cfg, dryRun: e.target.checked })}
          />{" "}
          Dry-run untuk pekerjaan baru
        </label>
        <p className="muted">
          Dry-run memvalidasi tanpa mengirim delete/suspend. Tidak berlaku pada
          rename.
        </p>
        <Button disabled={busy}>Simpan settings</Button>
      </form>
    </div>
  );
}
function ServerDetail({
  row,
  session: s,
  busy,
  onAction,
  onJob,
}: {
  row: Row;
  session: SessionView;
  busy: boolean;
  onAction: (fn: () => Promise<unknown>, success?: string) => Promise<void>;
  onJob: (kind: Job["kind"], id: number) => void;
}) {
  const [name, N] = useState(String(row.name));
  const q = useQuery({
    queryKey: ["details", s.domain, row.id],
    queryFn: () =>
      api<{
        server: ServerType;
        allocation: { ip: string; port: number } | null;
        egg: { name: string } | null;
        notices: string[];
      }>("details?id=" + row.id),
    retry: false,
  });
  const protectedState = s.protectedIds.includes(row.id);
  return (
    <>
      <dl className="detail-list">
        {Object.entries(row).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{String(v ?? "—")}</dd>
          </div>
        ))}
        <div>
          <dt>Allocation / Port</dt>
          <dd>
            {q.data?.allocation
              ? `${q.data.allocation.ip}:${q.data.allocation.port}`
              : q.isLoading
                ? "Memuat…"
                : "Tidak tersedia / izin terbatas"}
          </dd>
        </div>
        <div>
          <dt>Egg</dt>
          <dd>{q.data?.egg?.name || (row.egg as React.ReactNode)}</dd>
        </div>
      </dl>
      {q.error && <p className="error">{q.error.message}</p>}
      {q.data?.notices.map((n, i) => (
        <p key={i} className="muted">
          {n}
        </p>
      ))}
      <div className="button-row">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onAction(
              () => navigator.clipboard.writeText(String(row.uuid)),
              "UUID disalin.",
            )
          }
        >
          <Copy size={15} /> UUID
        </Button>
        <a
          className="btn btn-outline btn-sm"
          href={`${s.domain}/server/${encodeURIComponent(String(row.identifier))}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={15} /> Pterodactyl
        </a>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            onAction(
              () =>
                api(
                  "protect",
                  { id: row.id, protected: !protectedState },
                  s.csrf,
                ),
              "Perlindungan diperbarui.",
            )
          }
        >
          <Shield size={15} />
          {protectedState ? "Lepas proteksi" : "Lindungi"}
        </Button>
      </div>
      <form
        className="rename-form"
        onSubmit={(e) => {
          e.preventDefault();
          onAction(
            () => api("rename", { id: row.id, name }, s.csrf),
            "Nama server diperbarui.",
          );
        }}
      >
        <label>
          Nama server
          <input
            value={name}
            maxLength={191}
            required
            onChange={(e) => N(e.target.value)}
          />
        </label>
        <Button variant="outline" size="sm" disabled={busy}>
          Simpan nama
        </Button>
      </form>
      <div className="button-row">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onJob("suspend", row.id)}
        >
          Suspend
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => onJob("unsuspend", row.id)}
        >
          Unsuspend
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={busy || protectedState}
          onClick={() => onJob("delete-server", row.id)}
        >
          Delete server
        </Button>
      </div>
    </>
  );
}
