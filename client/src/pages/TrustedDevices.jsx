import { useEffect, useState } from "react";
import api from "../services/api";

function TrustedDevices() {
  const [devices, setDevices] = useState([]);

  const loadDevices = async () => {
    const res = await api.get("/auth/devices");
    setDevices(res.data);
  };

  const removeDevice = async (deviceId) => {
  try {
    const res = await api.delete(`/auth/device/${deviceId}`);

    console.log(res.data);

    await loadDevices();
  } catch (err) {
    console.log(err.response?.data || err);
  }
};

  useEffect(() => {
    loadDevices();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>Trusted Devices</h2>

      {devices.map((device) => (
        <div
          key={device.deviceId}
          style={{
            border: "1px solid gray",
            padding: "10px",
            marginBottom: "10px",
            borderRadius: "8px",
          }}
        >
          <h3>{device.deviceName}</h3>

          <p>Type : {device.deviceType}</p>

          <p>Platform : {device.platform}</p>

          <p>
            Status : {device.online ? "🟢 Online" : "⚪ Offline"}
          </p>

          <button
            onClick={() => removeDevice(device.deviceId)}
          >
            Remove Device
          </button>
        </div>
      ))}
    </div>
  );
}

export default TrustedDevices;