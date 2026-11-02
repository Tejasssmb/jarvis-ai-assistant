import "./Core.css";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Reactor3D from "../components/reactor/Reactor3D";
import { useVoice } from "../context/VoiceContext";

const SHOW_TEST_BUTTONS = false; // set to true to try the reactor states by hand

const LABELS = {
  idle: "SAY \u201CHEY JARVIS\u201D",
  listening: "LISTENING",
  thinking: "PROCESSING",
  speaking: "SPEAKING",
};

export default function Core() {
  const navigate = useNavigate();
  const { voiceState, live, caption } = useVoice();

  // manual override from the test buttons; cleared as soon as the voice state changes
  const [manual, setManual] = useState(null);
  useEffect(() => {
    setManual(null);
  }, [voiceState]);

  const reactorState = manual ?? voiceState;

  return (
    <div className="core-container">

      <div className="hero-reactor">
        <Reactor3D
          reactorState={reactorState}
        />
      </div>

      {/* status + live captions (like the subtitles in the demo video) */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 90,
          textAlign: "center",
          pointerEvents: "none",
          zIndex: 5,
        }}
      >
        <div
          style={{
            color: "#7fb4e8",
            letterSpacing: 4,
            fontSize: 13,
            opacity: 0.8,
            marginBottom: 14,
          }}
        >
          {live ? "LIVE \u2022 " : ""}
          {LABELS[reactorState] || LABELS.idle}
        </div>

        {caption && (
          <div
            style={{
              margin: "0 auto",
              maxWidth: "62%",
              fontSize: 20,
              lineHeight: 1.4,
              color: caption.who === "you" ? "#d6e6ff" : "#ffffff",
              opacity: caption.who === "you" ? 0.75 : 1,
              textShadow: "0 0 12px rgba(0,0,0,0.9)",
            }}
          >
            {caption.text.length > 220 ? caption.text.slice(0, 220) + "\u2026" : caption.text}
          </div>
        )}
      </div>

      {/* TEMP TEST BUTTONS */}
      {SHOW_TEST_BUTTONS && (
        <div
          style={{
            position: "fixed",
            top: 20,
            right: 20,
            display: "flex",
            gap: "10px",
            zIndex: 999
          }}
        >
          <button onClick={() => setManual("listening")}>
            Listening
          </button>

          <button onClick={() => setManual("thinking")}>
            Thinking
          </button>

          <button onClick={() => setManual("speaking")}>
            Speaking
          </button>
        </div>
      )}

      <button
        className="dashboard-btn"
        onClick={() => navigate("/dashboard")}
      >
        Dashboard →
      </button>

    </div>
  );
}
