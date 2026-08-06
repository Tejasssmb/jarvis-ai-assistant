import { useNavigate } from "react-router-dom";
import "./Settings.css";
import "../styles/Page.css";
import { removeToken } from "../services/auth/authService";

export default function Settings() {

    const navigate = useNavigate();

    function logout() {
         removeToken();

        localStorage.removeItem("jarvisDeviceId");

         window.location.href = "/login";

    }

    return (

    <div className="page">

        <div className="page-header">

            <h2>⚙ JARVIS Settings</h2>

            <p className="settings-subtitle">
                Configure your JARVIS experience
            </p>

        </div>

        <div className="page-body">

            <div className="settings-grid">

                <div className="device-card">

                    <h3>AI Model</h3>

                    <p className="setting-value">
                        llama3-8b-8192 (Groq)
                    </p>

                </div>

                <div className="device-card">

                    <h3>Voice Assistant</h3>

                    <p className="setting-value">
                        Enabled
                    </p>

                </div>

                <div className="device-card">

                    <h3>Notifications</h3>

                    <p className="setting-value">
                        Coming in V8
                    </p>

                </div>

                <div className="device-card">

                    <h3>Account</h3>

                    <button
                        className="remove-btn logout-btn"
                        onClick={logout}
                    >
                        Logout
                    </button>

                </div>

            </div>

        </div>

    </div>

);
}