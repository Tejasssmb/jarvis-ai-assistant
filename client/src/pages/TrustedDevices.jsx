import { useEffect, useState } from "react";
import api from "../services/api";
import "./TrustedDevices.css";
import DeviceCard from "../components/DeviceCard";

function TrustedDevices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadDevices = async () => {
    setLoading(true);
    const res = await api.get("/auth/devices");
    setDevices(res.data);
    setLoading(false);
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
  if (loading) {
    return (
        <div className="devices-page">
            <h2>Trusted Devices</h2>
            <p>Loading devices...</p>
        </div>
    );
}
if (devices.length === 0) {
    return (
        <div className="devices-page">
            <h2>Trusted Devices</h2>
            <p>No trusted devices found.</p>
        </div>
    );
}
  return (
    <div className="devices-page">
      <h2>Trusted Devices</h2>

      
       {devices.map((device) => (

    <DeviceCard
        key={device.deviceId}
        device={device}
        onRemove={removeDevice}
    />

))}
      
    </div>
  );
}

export default TrustedDevices;