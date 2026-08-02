export default function DeviceCard({ device, onRemove }) {

    const icon =
        device.deviceType === "mobile" ? "📱" : "💻";

    return (

        <div className="device-card">

            <div className="device-top">

                <div className="device-left">

                    <div className="device-icon">
                        {icon}
                    </div>

                    <div>

                        <h3>{device.deviceName}</h3>

                        <p>
    {device.platform.length > 35
        ? device.platform.substring(0, 35) + "..."
        : device.platform}
</p>

                    </div>

                </div>

                <div
                    className={
                        device.online
                            ? "status online"
                            : "status offline"
                    }
                >
                    {device.online ? "ONLINE" : "OFFLINE"}
                </div>

            </div>

            <div className="device-info">

                <div>

                    <span>Type</span>

                    <strong>{device.deviceType}</strong>

                </div>

                <div>

                    <span>Platform</span>

                    <strong>{device.platform}</strong>

                </div>

            </div>

            <div className="device-actions">

                <button className="details-btn">
                    Details
                </button>

                <button
                    className="remove-btn"
                    onClick={() => onRemove(device.deviceId)}
                >
                    Remove
                </button>

            </div>

        </div>

    );

}