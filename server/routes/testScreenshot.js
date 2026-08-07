const express = require("express");
const router = express.Router();

const Device = require("../models/Device");

router.post("/", async (req, res) => {

  try {

    const desktop = await Device.findOne({
      deviceType: "desktop",
      online: true,
    });

    if (!desktop) {
      return res.status(404).json({
        message: "Desktop not online",
      });
    }

    req.io
      .to(desktop.socketId)
      .emit("execute_command", {
        command: "take_screenshot",
      });

    res.json({
      success: true,
      message: "Screenshot command sent",
    });

  } catch (err) {

    res.status(500).json({
      message: err.message,
    });

  }

});

module.exports = router;