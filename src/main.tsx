import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { Web3Provider } from "./providers/Web3Provider";
import { Toaster } from "sonner";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Web3Provider>
      <App />
      <Toaster theme="dark" position="bottom-right" richColors />
    </Web3Provider>
  </React.StrictMode>
);
