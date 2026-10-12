import "./Core.css";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import Reactor3D from "../components/reactor/Reactor3D";

export default function Core() {
  const navigate = useNavigate();
  
  const [reactorState, setReactorState] =
    useState("listening");

  return (
    <div className="core-container">

      <div className="hero-reactor">
        <Reactor3D
          reactorState={reactorState}
        />
      </div>

      {/* TEMP TEST BUTTONS */}
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
        <button
          onClick={() =>
            setReactorState("listening")
          }
        >
          Listening
        </button>

        <button
          onClick={() =>
            setReactorState("thinking")
          }
        >
          Thinking
        </button>

        <button
          onClick={() =>
            setReactorState("speaking")
          }
        >
          Speaking
        </button>
      </div>

      <button
        className="dashboard-btn"
        onClick={() => navigate("/dashboard")}
      >
        Dashboard →
      </button>
      
    </div>
  );
}