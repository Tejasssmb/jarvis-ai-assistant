import { NavLink } from "react-router-dom";
export default function Sidebar() {
    return (
        <nav className="sidebar-nav">

            {
                <nav className="sidebar-nav">

    <div className="sidebar-logo">
        JARVIS
    </div>

   <NavLink
    to="/"
    className={({ isActive }) =>
        isActive ? "nav-item active" : "nav-item"
    }
>
    🏠 Dashboard
</NavLink>

   <NavLink
    to="/chat"
    className={({ isActive }) =>
        isActive ? "nav-item active" : "nav-item"
    }
>
    💬 Chat
</NavLink>

   <NavLink
    to="/devices"
    className={({ isActive }) =>
        isActive ? "nav-item active" : "nav-item"
    }
>
    🖥 Devices
</NavLink>

    <NavLink
    to="/memory"
    className={({ isActive }) =>
        isActive ? "nav-item active" : "nav-item"
    }
>
    🧠 Memory
</NavLink>
<NavLink
    to="/settings"
    className={({ isActive }) =>
        isActive ? "nav-item active" : "nav-item"
    }
>
    ⚙ Settings
</NavLink>


    <div className="version">
        VERSION 7
    </div>

</nav>}

        </nav>
    );
}