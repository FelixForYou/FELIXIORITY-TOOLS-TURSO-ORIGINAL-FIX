"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { Button } from "./ui/button";
import { download } from "@/lib/client";
export type Row = { id: number; [key: string]: unknown };
export type Column = {
  key: string;
  label: string;
  render?: (r: Row) => React.ReactNode;
};
export function DataTable({
  rows,
  columns,
  selected = [],
  onSelect,
  eligible = () => true,
  onOpen,
  exportName = "data",
  toolbar,
}: {
  rows: Row[];
  columns: Column[];
  selected?: number[];
  onSelect?: (ids: number[]) => void;
  eligible?: (r: Row) => boolean;
  onOpen?: (r: Row) => void;
  exportName?: string;
  toolbar?: React.ReactNode;
}) {
  const [search, S] = useState(""),
    [sort, Q] = useState("id"),
    [desc, D] = useState(false),
    [page, P] = useState(0);
  const filtered = useMemo(
    () =>
      rows
        .filter((r) =>
          Object.values(r).some((v) =>
            String(v).toLowerCase().includes(search.toLowerCase()),
          ),
        )
        .sort((a, b) => {
          const x = a[sort],
            y = b[sort];
          return (
            (typeof x === "number" && typeof y === "number"
              ? x - y
              : String(x ?? "").localeCompare(String(y ?? ""))) *
            (desc ? -1 : 1)
          );
        }),
    [rows, search, sort, desc],
  );
  useEffect(() => P(0), [search, rows.length]);
  const pages = Math.max(1, Math.ceil(filtered.length / 15)),
    current = Math.min(page, pages - 1);
  const candidates = filtered.filter(eligible).map((x) => x.id);
  function toggle(id: number) {
    onSelect?.(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }
  return (
    <div className="table-card">
      <div className="table-toolbar">
        <div className="input-icon search-input">
          <Search size={17} />
          <input
            aria-label="Cari dalam daftar"
            placeholder="Cari nama, ID, email, UUID…"
            value={search}
            onChange={(e) => S(e.target.value)}
          />
        </div>
        {toolbar}
        <Button
          variant="outline"
          size="sm"
          onClick={() => download(exportName, filtered)}
        >
          <Download size={16} /> CSV
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => download(exportName, filtered, "json")}
        >
          JSON
        </Button>
      </div>
      {onSelect && (
        <div className="selection-bar">
          <label>
            <input
              type="checkbox"
              checked={
                candidates.length > 0 &&
                candidates.every((x) => selected.includes(x))
              }
              onChange={(e) =>
                onSelect(
                  e.target.checked
                    ? [...new Set([...selected, ...candidates])]
                    : selected.filter((x) => !candidates.includes(x)),
                )
              }
            />{" "}
            Pilih semua hasil ({candidates.length})
          </label>
          <span>{selected.length} dipilih</span>
          {selected.length > 0 && (
            <button onClick={() => onSelect([])}>Bersihkan</button>
          )}
        </div>
      )}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {onSelect && <th aria-label="Seleksi" />}
              {columns.map((c) => (
                <th key={c.key}>
                  <button
                    onClick={() => {
                      Q(c.key);
                      D(sort === c.key ? !desc : false);
                    }}
                  >
                    {c.label}
                    <ArrowUpDown size={12} />
                  </button>
                </th>
              ))}
              {onOpen && <th>Detail</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(current * 15, current * 15 + 15).map((r) => (
              <tr key={r.id}>
                {onSelect && (
                  <td>
                    <input
                      aria-label={
                        "Pilih " + String(r.name || r.username || r.id)
                      }
                      type="checkbox"
                      checked={selected.includes(r.id)}
                      disabled={!eligible(r)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key}>
                    {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                  </td>
                ))}
                {onOpen && (
                  <td>
                    <Button size="sm" variant="ghost" onClick={() => onOpen(r)}>
                      Lihat ↗
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-resource-cards">
        <div className="mobile-sort">
          <label>
            Urutkan{" "}
            <select value={sort} onChange={(e) => Q(e.target.value)}>
              {columns.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" variant="ghost" onClick={() => D(!desc)}>
            <ArrowUpDown size={14} />
            {desc ? "Turun" : "Naik"}
          </Button>
        </div>
        {filtered.slice(current * 15, current * 15 + 15).map((r) => (
          <article key={r.id}>
            <div className="mobile-card-heading">
              {onSelect && (
                <input
                  type="checkbox"
                  aria-label={"Pilih " + String(r.name || r.username || r.id)}
                  checked={selected.includes(r.id)}
                  disabled={!eligible(r)}
                  onChange={() => toggle(r.id)}
                />
              )}
              <b>{String(r.name || r.username || r.id)}</b>
              {onOpen && (
                <Button variant="ghost" size="sm" onClick={() => onOpen(r)}>
                  Detail ↗
                </Button>
              )}
            </div>
            <dl>
              {columns
                .filter((c) => !["name", "username"].includes(c.key))
                .map((c) => (
                  <div key={c.key}>
                    <dt>{c.label}</dt>
                    <dd>{c.render ? c.render(r) : String(r[c.key] ?? "—")}</dd>
                  </div>
                ))}
            </dl>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <div className="empty">
          <Search size={26} />
          <h3>Tidak ada hasil.</h3>
          <p>
            Coba kata pencarian atau filter lain. Data hanya tampil setelah
            sinkronisasi berhasil.
          </p>
        </div>
      )}
      <div className="table-footer">
        <span>
          {filtered.length} hasil · halaman {current + 1}/{pages}
        </span>
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={!current}
            aria-label="Halaman sebelumnya"
            onClick={() => P(current - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={current >= pages - 1}
            aria-label="Halaman berikutnya"
            onClick={() => P(current + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
