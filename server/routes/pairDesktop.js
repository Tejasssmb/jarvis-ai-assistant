const express = require("express");
const router = express.Router();

const DesktopRegistration = require("../models/DesktopRegistration");
const Device = require("../models/Device");

const { generateToken } = require("../utils/jwt");
const { verifyUserToken } = require("../utils/userJwt");
const {
  getIO,
  pendingDesktopConnections,
} = require("../socket/socketManager");

router.post("/", async (req, res) => {
  try {

    const { registrationId } = req.body;

    // Verify logged-in user
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "Login required",
      });
    }

    const token = authHeader.split(" ")[1];

    const user = verifyUserToken(token);

    // Find desktop registration
    const registration = await DesktopRegistration.findOne({
      registrationId,
    });

    if (!registration) {
      return res.status(404).json({
        message: "Registration not found",
      });
    }

    if (registration.status !== "pending") {
      return res.status(400).json({
        message: "Registration already used",
      });
    }

    if (registration.expiresAt < new Date()) {
      return res.status(400).json({
        message: "Registration expired",
      });
    }

    // Create or update trusted device
    let device = await Device.findOne({
      deviceId: registration.deviceId,
    });

    if (!device) {
      device = new Device({
        deviceId: registration.deviceId,
        deviceName: "Desktop",
        deviceType: "desktop",
        platform: "Windows",
        trusted: true,
      });
    }

    // Generate Device JWT
    const deviceToken = generateToken(device);

    device.jwtToken = deviceToken;

    await device.save();
    
    const io = getIO();

const socketId =
  pendingDesktopConnections.get(registrationId);

if (socketId) {

  io.to(socketId).emit(
    "desktop_registered",
    {
      deviceToken,
    }
  );

  pendingDesktopConnections.delete(
    registrationId
  );

}

    // Mark registration as completed
    registration.status = "completed";

    await registration.save();

    res.json({
      success: true,
    });

  } catch (err) {

    res.status(500).json({
      message: err.message,
    });

  }
});

module.exports = router;