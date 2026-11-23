import { useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import HomePage from "./pages/HomePage";
import JobPage from "./pages/JobPage";

export default function App() {
  const [mode, setMode] = useState<string>("");
  const loc = useLocation();

  useEffect(() => {
    api
      .health()
      .then((h) => setMode(h.llm_mode))
      .catch(() => setMode("offline"));
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="logo">R</span>
          <span>
            RepoTour <b>码途</b>
          </span>
        </Link>
        <span className="spacer" />
        {loc.pathname !== "/" && (
          <Link to="/" className="ghost-link">
            新建导览
          </Link>
        )}
        <span className={`mode-pill${mode === "live" ? " live" : ""}`}>
          {mode === "offline" ? "后端未连接" : mode ? `LLM: ${mode}` : "…"}
        </span>
      </header>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/job/:jobId" element={<JobPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

