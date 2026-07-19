const jwt = require("jsonwebtoken");

const generateToken = (device) => {
    return jwt.sign(
        {
            deviceId: device.deviceId,
            deviceType: device.deviceType,
        },
        process.env.JWT_SECRET,
        {
            expiresIn: "30d",
        }
    );
};

const verifyToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = {
    generateToken,
    verifyToken,
};