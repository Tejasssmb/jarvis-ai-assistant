const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const Device = require("../models/Device");
const { generateToken } = require("../utils/jwt");

let currentPairCode = null;
let expiresAt = null;

// Generate Pair Code
router.post("/pair/init", (req, res) => {
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
router.post("/pair/verify", async (req, res) => {
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

    const device = new Device({
      deviceId: uuidv4(),
      deviceName,
      deviceType,
      platform,
      trusted: true,
    });

    const token = generateToken(device);

    device.jwtToken = token;

    await device.save();

    currentPairCode = null;
    expiresAt = null;

    res.json({
      message: "Device Paired Successfully",
      token,
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
      return res.status(401).json({ valid: false });
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
      return res.status(401).json({ valid: false });
    }

    res.json({
      valid: true,
      deviceName: device.deviceName,
    });

  } catch (err) {
    res.status(401).json({
      valid: false,
    });
  }
});

module.exports = router;