import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { refreshAccount } from "../state/appAccountStore";
import { ClipGallery } from "./ClipGallery";
import "../main.css";

const queryClient = new QueryClient();
void refreshAccount();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ClipGallery />
  </QueryClientProvider>,
);
