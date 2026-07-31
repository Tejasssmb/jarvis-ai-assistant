import { io } from "socket.io-client";
import { getToken } from "./auth/authService";

const socket = io("http://localhost:5000", {
  autoConnect: false,
});

socket.on("connect", () => {
  const token = getToken();

  if (token) {
    socket.emit("authenticate", token);
  }
});

export default socket;