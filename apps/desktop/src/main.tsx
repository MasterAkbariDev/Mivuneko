import { TrayMenu } from "./TrayMenu";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Pet } from "./Pet";
import "./style.css";
import "./redesign.css";
import "./chat.css";
import "./studio.css";
const view = new URLSearchParams(location.search).get("view");
const tray = view === "tray";
const pet = !tray && view !== "chat";
if (tray) document.body.classList.add("tray-body");
if (pet) {
  document.body.classList.add("pet-body");
  if (!("__TAURI_INTERNALS__" in window))
    document.body.classList.add("browser-preview");
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {tray ? <TrayMenu /> : pet ? <Pet /> : <App />}
  </React.StrictMode>,
);
