const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const Device = require("../models/Device");
const { generateToken } = require("../utils/jwt");

let currentPairCode = null;
let expiresAt = null;

// Generate Pair Code
router.post("/login/init", (req, res) => {
  currentPairCode = crypto.randomInt(100000, 999999).toString();
  expiresAt = Date.now() + 5 * 60 * 1000;

  console.log("\n======================");
  console.log("JARVIS MOBILE PAIRING");
  console.log("======================");
  console.log("Pair Code :", currentPairCode);
  console.log("======================\n");

  res.json({
    pairCode: currentPairCode,
    expiresAt,
  });
});

// Verify Pair Code
router.post("/login/verify", async (req, res) => {
  try {
    const { pairCode, deviceName, deviceType, platform } = req.body;
   
    if (
      pairCode !== currentPairCode ||
      Date.now() > expiresAt
    ) {
      return res.status(400).json({
        message: "Invalid or Expired Pair Code",
      });
    }

    const existingDevice = await Device.findOne({
  deviceId: req.body.deviceId,
});

    let device;

if (existingDevice) {
  device = existingDevice;
} else {
  device = new Device({
    deviceId:  req.body.deviceId || uuidv4(),
    deviceName,
    deviceType,
    platform,
    trusted: true,
  });
}

const token = generateToken(device);

device.jwtToken = token;

await device.save();

    currentPairCode = null;
    expiresAt = null;

    res.json({
      message: "Device Paired Successfully",
      token,
      deviceId: device.deviceId,
    });
  } catch (err) {
    
    res.status(500).json({
      message: err.message,
    });
  }
});
router.get("/validate", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        valid: false,
      });
    }

    const token = authHeader.split(" ")[1];

    const { verifyToken } = require("../utils/jwt");

    const decoded = verifyToken(token);

    const device = await Device.findOne({
      deviceId: decoded.deviceId,
      jwtToken: token,
      trusted: true,
    });

    if (!device) {
      return res.status(401).json({
        valid: false,
      });
    }

    res.json({
      valid: true,
      deviceName: device.deviceName,
      deviceType: device.deviceType,
    });

  } catch (err) {

    res.status(401).json({
      valid: false,
    });

  }
});

router.post("/refresh", async (req, res) => {
  const { deviceId } = req.body;
  const device = await Device.findOne({
  deviceId,
  trusted: true,
});
if (!device) {
  return res.status(401).json({
    message: "Device not trusted",
  });
}
const token = generateToken(device);

device.jwtToken = token;

await device.save();
res.json({
  token,
});

});

router.get("/devices", async (req, res) => {
  try {
    const devices = await Device.find({ trusted: true });
    res.json(devices);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

router.delete("/device/:deviceId", async (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = await Device.findOne({ deviceId });

    if (!device) {
      return res.status(404).json({
        message: "Device not found",
      });
    }

    await Device.deleteOne({ deviceId });

    res.json({
      message: "Device removed successfully",
    });

  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
});

module.exports = router;