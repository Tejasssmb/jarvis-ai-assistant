import api from "../api";

const USER_TOKEN_KEY = "jarvisUserToken";

export const saveToken = (token) => {
  localStorage.setItem(USER_TOKEN_KEY, token);
};

export const getToken = () => {
  return localStorage.getItem(USER_TOKEN_KEY);
};

export const removeToken = () => {
  localStorage.removeItem(USER_TOKEN_KEY);
};

// export const refreshToken = async () => {
//   try {
//     const deviceId = localStorage.getItem("jarvisDeviceId");

//     if (!deviceId) {
//       return false;
//     }

//     const res = await api.post("/auth/refresh", {
//       deviceId,
//     });

//     saveToken(res.data.token);

//     return true;

//   } catch {
//     removeToken();
//     localStorage.removeItem("jarvisDeviceId");
//     return false;
//   }
// };

export const validateToken = async () => {
  try {
    const token = getToken();

    if (!token) {
      return false;
    }

    await api.get("/user/validate", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return true;

  } catch (err) {

    removeToken();
    return false;

  }
};