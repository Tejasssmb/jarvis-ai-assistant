import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import socket from "../services/socket";
import { useAuth } from "./AuthContext";

/**
 * VoiceContext — the link between the always-on voice loop (wake.py) and the UI.
 *
 *  - "Hey Jarvis" (from ANY app) does NOT pull this window forward: Jarvis talks in the
 *    background and the small corner reactor (overlay.py) shows his state.
 *  - voiceState (idle | listening | thinking | speaking) drives the reactor here too.
 *  - caption = the short spoken line (never code / long text).
 *  - A long answer or code (reply.longform) opens the Chat page, where it is shown as text.
 *  - fetchFeed(since) returns what was said by voice while the Chat page was closed.
 *  - live / setLiveMode = hands-free LIVE conversation mode.
 */
const VoiceContext = createContext(null);

const SERVER = "http://localhost:5000";
const CONTROL = "http://127.0.0.1:5002";

export function VoiceProvider({ children }) {
  const navigate = useNavigate();
  const { authenticated } = useAuth();

  const [voiceState, setVoiceState] = useState("idle");
  const [live, setLive] = useState(false);
  const [caption, setCaption] = useState(null);

  const listeners = useRef(new Set());
  const captionTimer = useRef(null);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  useEffect(() => {
    if (!authenticated) return;

    // A window opened by "Hey Jarvis" starts AFTER the first events were sent:
    // ask the server what the current state is.
    axios
      .get(`${SERVER}/api/chat/voice-state`)
      .then(({ data }) => {
        setVoiceState(data.state || "idle");
        setLive(!!data.live);
      })
      .catch(() => {});

    const onEvent = (data) => {
      if (data.state) setVoiceState(data.state);
      if (typeof data.live === "boolean") setLive(data.live);

      if (data.trigger === "wake") {
        clearTimeout(captionTimer.current);
        setCaption(null);
      }
      if (data.message) setCaption({ who: "you", text: data.message });
      if (data.reply) setCaption({ who: "jarvis", text: data.speech || data.reply });
      if (data.longform) navigate("/chat");   // code / long information -> shown as text in Chat
      if (data.trigger === "end") {
        clearTimeout(captionTimer.current);
        captionTimer.current = setTimeout(() => setCaption(null), 4000);
      }

      listeners.current.forEach((fn) => fn(data));
    };

    socket.on("jarvis_wake", onEvent);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off("jarvis_wake", onEvent);
      clearTimeout(captionTimer.current);
    };
  }, [authenticated, navigate]);

  const setLiveMode = useCallback(async (on) => {
    try {
      const { data } = await axios.post(`${CONTROL}/live`, { on });
      setLive(!!data.live);
    } catch {
      alert("The voice loop is not running. Start it with jarvis_launcher.py (or: python voice-service/wake.py).");
    }
  }, []);

  const fetchFeed = useCallback(async (since) => {
    try {
      const { data } = await axios.get(`${SERVER}/api/chat/voice-feed`, { params: { since } });
      return data.items || [];
    } catch {
      return [];
    }
  }, []);

  const wake = useCallback(() => {
    axios.post(`${CONTROL}/wake`).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ voiceState, live, caption, subscribe, fetchFeed, setLiveMode, wake }),
    [voiceState, live, caption, subscribe, fetchFeed, setLiveMode, wake]
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used inside <VoiceProvider>");
  return ctx;
}
