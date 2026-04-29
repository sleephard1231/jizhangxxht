import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider, useAuth } from "./store/AuthStore";
import { FinanceProvider } from "./store/FinanceStore";
import "./styles.css";

function AppProviders() {
  const { userStorageKey } = useAuth();

  return (
    <FinanceProvider key={userStorageKey} storageKey={userStorageKey}>
      <App />
    </FinanceProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppProviders />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
