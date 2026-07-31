import api from "../api";

const TOKEN_KEY = "jarvisToken";

export const saveToken = (token) => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const getToken = () => {
  return localStorage.getItem(TOKEN_KEY);
};

export const removeToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export const refreshToken = async () => {
  try {
    const deviceId = localStorage.getItem("jarvisDeviceId");

    if (!deviceId) {
      return false;
    }

    const res = await api.post("/auth/refresh", {
      deviceId,
    });

    saveToken(res.data.token);

    return true;

  } catch {
    removeToken();
    localStorage.removeItem("jarvisDeviceId");
    return false;
  }
};

export const validateToken = async () => {
  try {
    const token = getToken();

   if (!token) {
  return await refreshToken();
}

    await api.get("/auth/validate", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return true;
  } catch {
    removeToken();
    return await refreshToken();
  }
};