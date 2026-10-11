export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function errorMessage(e: unknown) {
  return e instanceof AppError
    ? e.message
    : "Operasi gagal. Periksa koneksi dan coba lagi.";
}
