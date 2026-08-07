import { useEffect, useState } from "react";
import axios from "axios";

export default function DesktopView() {
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const loadLatestScreenshot = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/latest-screenshot"
      );

      setImageUrl(
        `http://localhost:5000${res.data.url}`
      );
    } catch (err) {
      console.error(err);
    }
  };

  const takeScreenshot = async () => {
    try {
      setLoading(true);

      await axios.post(
        "http://localhost:5000/api/test-screenshot"
      );

      setTimeout(() => {
        loadLatestScreenshot();
        setLoading(false);
      }, 3000);

    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLatestScreenshot();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>Desktop View</h1>

      <button onClick={takeScreenshot}>
        {loading
          ? "Capturing..."
          : "Take Screenshot"}
      </button>

      <br />
      <br />

      {imageUrl && (
        <img
          src={imageUrl}
          alt="Desktop Screenshot"
          style={{
            width: "100%",
            maxWidth: "1000px",
            border: "1px solid #444",
          }}
        />
      )}
    </div>
  );
}