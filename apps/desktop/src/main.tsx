import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Pet } from "./Pet";
import "./style.css";
import "./redesign.css";
import "./chat.css";
const pet = new URLSearchParams(location.search).get("view") !== "chat";
if (pet) {
  document.body.classList.add("pet-body");
  if (!("__TAURI_INTERNALS__" in window))
    document.body.classList.add("browser-preview");
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{pet ? <Pet /> : <App />}</React.StrictMode>,
);
