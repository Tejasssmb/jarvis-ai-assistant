import { useEffect, useState } from "react";
import socket from "../services/socket";

function MobileHome() {

 const [command, setCommand] = useState("");

const [messages, setMessages] = useState([
  {
    role: "assistant",
    content: "Hello Sir. JARVIS Mobile Online.",
  },
]);
const [notifications, setNotifications] = useState([]);

 useEffect(() => {
  console.log("MOBILEHOME MOUNTED");
  socket.connect();

  const handleReply = (data) => {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.reply,
        imageUrl: data.imageUrl || null,
      },
    ]);
  };
  const handleNotification = (data) => {

  setNotifications((prev) => [
    {
      message: data.message,
      time: new Date().toLocaleTimeString()
    },
    ...prev
  ]);

};

  socket.on("jarvis_reply", handleReply);
  socket.on("jarvis_notification", handleNotification);
  socket.on("screenshot_received", (data) => {
  setMessages((prev) => [
    ...prev,
    {
      role: "assistant",
      content: (
        <img
          src={data.imageUrl}
          alt="Desktop Screenshot"
          style={{
            width: "100%",
            maxWidth: "500px",
            border: "1px solid #444",
          }}
        />
      ),
    },
  ]);
});
socket.on("connect", () => {
  console.log("PHONE SOCKET CONNECTED");
});
  return () => {
    socket.off("jarvis_reply", handleReply);
    socket.off("screenshot_received");
    socket.off(
  "jarvis_notification",
  handleNotification
);
  };
}, []);

  const sendCommand = () => {
    if (!command.trim()) return;

    setMessages((prev) => [
  ...prev,
  {
    role: "user",
    content: command,
  },
]);

socket.emit("mobile_command", {
  command,
});

setCommand("");
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>JARVIS Mobile</h2>
      <div
  style={{
    height: "350px",
    overflowY: "auto",
    border: "1px solid #333",
    marginBottom: "20px",
    padding: "10px",
  }}
>
  <h3>Notifications</h3>

<div
  style={{
    border: "1px solid #333",
    padding: "10px",
    marginBottom: "20px",
    maxHeight: "150px",
    overflowY: "auto"
  }}
>
  {notifications.map((n, index) => (
    <div key={index}>
      🔔 {n.message}
    </div>
  ))}
</div>
  {messages.map((msg, index) => (
    <div
      key={index}
      style={{
        marginBottom: "12px",
      }}
    >
      <strong>
        {
  msg.role === "assistant"
    ? "JARVIS"
    : "YOU"
}
      </strong>

      <div>{msg.content}</div>
      {msg.imageUrl && (
  <img
    src={`http://localhost:5000${msg.imageUrl}`}
    alt="Desktop Screenshot"
    style={{
      width: "100%",
      maxWidth: "500px",
      marginTop: "10px",
      border: "1px solid #444",
    }}
  />
)}
    </div>
  ))}
</div>

      <input
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        placeholder="Enter command..."
      />

      <button onClick={sendCommand}>
        Send
      </button>
    </div>
  );
}

export default MobileHome;