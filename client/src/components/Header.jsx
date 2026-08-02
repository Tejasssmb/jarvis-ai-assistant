import "./Header.css";
export default function Header() {

    return (

        <header className="chat-header">

            <div className="top-bar">

                <div className="top-left">

                    <div className="header-dot"></div>

                    <div>

                        <h1>J.A.R.V.I.S</h1>

                        <p>Just A Rather Very Intelligent System</p>

                    </div>

                </div>

                <div className="top-right">

                    <div className="status-chip">
                        🟢 ONLINE
                    </div>

                    <div className="status-chip">
                        Desktop
                    </div>

                    <div className="status-chip">
                        Phone
                    </div>

                    <div className="status-chip clock">
                        {new Date().toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit"
                        })}
                    </div>

                </div>

            </div>

        </header>

    );

}