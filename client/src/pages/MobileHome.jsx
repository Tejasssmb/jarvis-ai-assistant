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

 useEffect(() => {
  socket.connect();

  const handleReply = (data) => {
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: data.reply,
      },
    ]);
  };

  socket.on("jarvis_reply", handleReply);

  return () => {
    socket.off("jarvis_reply", handleReply);
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
  {messages.map((msg, index) => (
    <div
      key={index}
      style={{
        marginBottom: "12px",
      }}
    >
      <strong>
        {msg.role === "assistant" ? "JARVIS" : "YOU"}
      </strong>

      <div>{msg.content}</div>
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