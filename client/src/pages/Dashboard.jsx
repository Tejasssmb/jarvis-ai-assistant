
import "../styles/Page.css";

export default function Dashboard() {

    const hour = new Date().getHours();

    let greeting = "Good Evening";

    if (hour < 12) {
        greeting = "Good Morning";
    } else if (hour < 17) {
        greeting = "Good Afternoon";
    }

    return (

    <div className="page">

        <div className="page-body">

            <div className="welcome-panel">

                <div className="ai-orb"></div>

                <h2>{greeting}, Tejas</h2>

                <p>🟢 All systems operational • AI Ready • Secure Connection</p>

                <div className="quick-actions">

                    <div className="action-card">
                        <span className="action-icon">💻</span>
                        <span>VS Code</span>
                    </div>

                    <div className="action-card">
                        <span className="action-icon">🌐</span>
                        <span>Chrome</span>
                    </div>

                    <div className="action-card">
                        <span className="action-icon">📁</span>
                        <span>Files</span>
                    </div>

                    <div className="action-card">
                        <span className="action-icon">🎤</span>
                        <span>Listen</span>
                    </div>

                </div>

            </div>

        </div>

    </div>

);

}