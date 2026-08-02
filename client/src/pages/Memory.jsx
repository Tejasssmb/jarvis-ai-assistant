import { useEffect, useState } from "react";
import api from "../services/api";
import "./Memory.css";
import "../styles/Page.css";

export default function Memory() {

    const [memories, setMemories] = useState([]);

    async function loadMemories() {

        try {

            const res = await api.get("/memory/all");

            setMemories(res.data.memories);

        } catch (err) {

            console.log(err);

        }

    }

    async function deleteMemory(id) {

        try {

            await api.delete(`/memory/${id}`);

            loadMemories();

        } catch (err) {

            console.log(err);

        }

    }

    useEffect(() => {

        loadMemories();

    }, []);

    return (

    <div className="page">

        <div className="page-header">

            <h2>🧠 JARVIS Memory</h2>

            <p className="memory-subtitle">
                Stored conversations and learned information
            </p>

        </div>

        <div className="page-body">

            {memories.length === 0 && (

                <p>No memories found.</p>

            )}

            {memories.map(memory => (

                <div
                    key={memory._id}
                    className="device-card"
                >

                    <div className="device-top">

                        <h3>{memory.type.toUpperCase()}</h3>

                        <button
                            className="remove-btn"
                            onClick={() => deleteMemory(memory._id)}
                        >
                            Delete
                        </button>

                    </div>

                    <div className="memory-content">

                        {memory.content}

                    </div>

                    <p className="memory-date">
                        {new Date(memory.createdAt).toLocaleString()}
                    </p>

                </div>

            ))}

        </div>

    </div>

);
}