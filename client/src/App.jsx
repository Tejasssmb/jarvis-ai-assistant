import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import Chat from "./components/Chat";
import PairDevice from "./pages/PairDevice";

import useAuth from "./hooks/useAuth";
import MobileHome from "./pages/MobileHome";
import TrustedDevices from "./pages/TrustedDevices";

function App() {
  const { loading, authenticated } = useAuth();

  if (loading) {
    return <h2>Starting JARVIS...</h2>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            authenticated ? (
              <Chat />
            ) : (
              <Navigate to="/pair" replace />
            )
          }
        />

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
<Route
  path="/devices"
  element={
    authenticated ? (
      <TrustedDevices />
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