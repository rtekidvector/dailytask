import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./index.css";
import { getTheme, setTheme } from "./lib/theme";

setTheme(getTheme());

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true, retry: 1 } } });
if (location.hostname !== "localhost") registerSW({ immediate: true }); // local preview: no cache layer, a refresh always shows the latest build
createRoot(document.getElementById("root")!).render(<StrictMode><QueryClientProvider client={qc}><App /></QueryClientProvider></StrictMode>);
