import Sidebar from "./Sidebar";
import Header from "./Header";
import { Outlet } from "react-router-dom";
import "./DesktopLayout.css";

export default function DesktopLayout() {

    return (

        <div className="desktop-layout">

            <Sidebar />

            <div className="desktop-main">

                <Header />

                <main className="page-content">

                    <Outlet />

                </main>

            </div>

        </div>

    );

}