import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AuraLanding from "@/components/AuraLanding";
import "@/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found in index.html");

createRoot(root).render(
  <StrictMode>
    <AuraLanding />
  </StrictMode>,
);
