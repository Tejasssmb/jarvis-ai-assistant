import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import PairDevice from "./pages/PairDevice";
import MobileHome from "./pages/MobileHome";
import TrustedDevices from "./pages/TrustedDevices";
import DesktopLayout from "./components/DesktopLayout";
import Memory from "./pages/Memory";
import Settings from "./pages/Settings";
import Chat from "./pages/Chat";

import useAuth from "./hooks/useAuth";

function App() {
  const { loading, authenticated } = useAuth();

  if (loading) {
    return <h2>Starting JARVIS...</h2>;
  }

 return (
  <BrowserRouter>
    <Routes>

      {/* Desktop Layout */}
      <Route
        element={
          authenticated ? (
            <DesktopLayout />
          ) : (
            <Navigate to="/pair" replace />
          )
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="/devices" element={<TrustedDevices />} />
        <Route path="/memory" element={<Memory />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      {/* Pair Device */}
      <Route
        path="/pair"
        element={
          authenticated ? (
            <Navigate to="/" replace />
          ) : (
            <PairDevice />
          )
        }
      />

      {/* Mobile */}
      <Route
        path="/mobile"
        element={
          authenticated ? (
            <MobileHome />
          ) : (
            <Navigate to="/pair" replace />
          )
        }
      />

    </Routes>
  </BrowserRouter>
);
}

export default App;