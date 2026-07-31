import { useState } from "react";
import api from "../services/api";
import { saveToken } from "../services/auth/authService";


function PairDevice() {
 
  const [pairCode, setPairCode] = useState("");
  const [message, setMessage] = useState("");

  const pairDevice = async () => {
    try {
      const res = await api.post("/auth/pair/verify", {
       
        pairCode,
        deviceId: localStorage.getItem("jarvisDeviceId"),
        deviceName: "Tejas Phone",
        deviceType: "mobile",
        platform: navigator.userAgent,
      });
     

      
      saveToken(res.data.token);

localStorage.setItem(
  "jarvisDeviceId",
  res.data.deviceId
);

      window.location.href = "/";
    } catch (err) {
      setMessage("❌ Invalid Pair Code");
    }
  };

  return (
    <div style={{ padding: 40 }}>
      <h2>Pair Your Phone</h2>

      <input
        type="text"
        placeholder="Enter Pair Code"
        value={pairCode}
        onChange={(e) => setPairCode(e.target.value)}
      />

      <br /><br />

      <button onClick={pairDevice}>
        Pair Device
      </button>

      <p>{message}</p>
    </div>
  );
}

export default PairDevice;