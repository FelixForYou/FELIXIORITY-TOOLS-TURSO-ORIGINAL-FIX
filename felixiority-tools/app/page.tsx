"use client";
import { useState } from "react";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { Connect } from "@/components/connect";
import { Dashboard, type SessionView } from "@/components/dashboard";
import { api, ApiError } from "@/lib/client";
import { Button } from "@/components/ui/button";
function App() {
  const qc = useQueryClient();
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => api<SessionView>("session"),
    retry: false,
    refetchInterval: 30000,
  });
  if (session.isPending)
    return (
      <div className="boot">
        <span className="brand-mark">F.</span>
        <p>Memeriksa sesi…</p>
      </div>
    );
  if (
    session.error &&
    (!(session.error instanceof ApiError) || session.error.status !== 401)
  )
    return (
      <div className="boot">
        <h1>Layanan belum siap.</h1>
        <p>{session.error.message}</p>
        <p>
          Administrator perlu memeriksa konfigurasi Turso, SESSION_SECRET, dan
          APP_ORIGIN.
        </p>
        <Button onClick={() => session.refetch()}>Coba lagi</Button>
      </div>
    );
  if (!session.data || session.error)
    return (
      <Connect
        onConnected={() => {
          qc.clear();
          void session.refetch();
        }}
      />
    );
  return (
    <Dashboard
      session={session.data}
      onDisconnect={() => {
        qc.clear();
        void session.refetch();
      }}
    />
  );
}
export default function Page() {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchOnWindowFocus: true,
            retry: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </QueryClientProvider>
  );
}
