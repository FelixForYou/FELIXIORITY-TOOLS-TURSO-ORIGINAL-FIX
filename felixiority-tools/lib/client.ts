export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter = 15,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  csrf?: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 240000);
  try {
    const r = await fetch("/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      headers:
        body === undefined
          ? {}
          : { "Content-Type": "application/json", "X-CSRF-Token": csrf || "" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await r
      .json()
      .catch(() => ({ error: { message: "Respons layanan tidak valid." } }));
    if (!r.ok)
      throw new ApiError(
        data.error?.message || "Permintaan gagal.",
        r.status,
        data.error?.retryAfter || 15,
      );
    return data;
  } finally {
    clearTimeout(timer);
  }
}
export function download(
  name: string,
  rows: object[],
  format: "csv" | "json" = "csv",
) {
  const safe = (v: unknown) => {
    const s = String(v ?? "");
    return (
      '"' +
      (/^[\s]*[=+\-@\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') +
      '"'
    );
  };
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const text =
    format === "json"
      ? JSON.stringify(rows, null, 2)
      : "\uFEFF" +
        [
          keys.map(safe).join(","),
          ...rows.map((r) =>
            keys.map((k) => safe((r as Record<string, unknown>)[k])).join(","),
          ),
        ].join("\r\n");
  const u = URL.createObjectURL(
    new Blob([text], {
      type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = name + "." + format;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
