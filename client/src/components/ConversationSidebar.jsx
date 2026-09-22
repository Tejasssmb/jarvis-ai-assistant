import { useEffect, useState } from "react";
import axios from "axios";

function ConversationSidebar({ onSelectConversation }) {
  const [conversations, setConversations] = useState([]);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/conversations"
      );

      setConversations(res.data);
    } catch (err) {
      console.error(err);
    }
  };
  const createNewConversation = async () => {
  try {
    const res = await axios.post(
      "http://localhost:5000/api/conversations/new"
    );

    onSelectConversation(res.data._id);

    loadConversations();
  } catch (err) {
    console.error(err);
  }
};

  return (
    <div
      style={{
        width: "280px",
    height: "100%",
    maxHeight: "calc(100vh - 220px)",
    borderRight: "1px solid #333",
    padding: "10px",
    overflowY: "auto",
    flexShrink: 0,
      }}
    >
      <button
  onClick={createNewConversation}
  style={{
    width: "100%",
    padding: "12px",
    marginBottom: "15px",
    background: "#1f2937",
    color: "white",
    border: "1px solid #374151",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "600"
  }}
>
  + New Chat
</button>
      <h3>Chats</h3>



      {conversations.map((chat) => (
        <div
          key={chat._id}
          onClick={() => onSelectConversation(chat._id)}
          style={{
            padding: "10px",
            marginBottom: "8px",
            cursor: "pointer",
            border: "1px solid #444",
            borderRadius: "8px",
          }}
        >
          {chat.title}
        </div>
      ))
               }
    </div>
    
  );
}

export default ConversationSidebar;