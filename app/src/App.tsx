import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth-context";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { LibraryPage } from "./pages/LibraryPage";
import { BookDetailPage } from "./pages/BookDetailPage";
import { ManualAddPage } from "./pages/ManualAddPage";
import { BulkAddPage } from "./pages/BulkAddPage";
import { AppShell } from "./components/AppShell";

// Lazy-loaded: pulls in the @zxing barcode-reading library, which is sizable
// and only needed once someone actually opens the camera scan flow.
const ScanAddPage = lazy(() => import("./pages/ScanAddPage").then((m) => ({ default: m.ScanAddPage })));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="centered-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell>
              <Routes>
                <Route path="/" element={<LibraryPage />} />
                <Route path="/books/:id" element={<BookDetailPage />} />
                <Route
                  path="/add/scan"
                  element={
                    <Suspense fallback={<div className="centered-loading">Loading scanner…</div>}>
                      <ScanAddPage />
                    </Suspense>
                  }
                />
                <Route path="/add/manual" element={<ManualAddPage />} />
                <Route path="/bulk-add" element={<BulkAddPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  );
}
