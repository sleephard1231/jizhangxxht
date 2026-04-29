import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FinanceProvider } from "./store/FinanceStore";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <FinanceProvider>
        <App />
      </FinanceProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
