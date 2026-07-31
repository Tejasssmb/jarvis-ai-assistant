import { useEffect, useState } from "react";
import { validateToken } from "../services/auth/authService";

export default function useAuth() {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const check = async () => {
      const valid = await validateToken();
      setAuthenticated(valid);
      setLoading(false);
    };

    check();
  }, []);

  return {
    loading,
    authenticated,
  };
}