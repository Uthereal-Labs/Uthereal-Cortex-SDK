import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const Screen = lazy(() =>
  new URLSearchParams(location.search).has("replay")
    ? import("./Replay.tsx").then(({ Replay }) => ({ default: Replay }))
    : import("./App.tsx").then(({ App }) => ({ default: App }))
);
import "./style.css";
const client = new QueryClient();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <Suspense fallback={<p role="status">Loading…</p>}>
        <Screen />
      </Suspense>
    </QueryClientProvider>
  </StrictMode>,
);
