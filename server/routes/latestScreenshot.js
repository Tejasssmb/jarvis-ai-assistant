const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

router.get("/", async (req, res) => {
  try {

    const screenshotDir =
      path.join(
        __dirname,
        "..",
        "uploads",
        "screenshots"
      );

    const files = fs
      .readdirSync(screenshotDir)
      .filter(file => file.endsWith(".png"));

    if (files.length === 0) {
      return res.status(404).json({
        message: "No screenshots found",
      });
    }

    const latestFile = files
      .map(file => ({
        file,
        time: fs.statSync(
          path.join(screenshotDir, file)
        ).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time)[0];

    res.json({
      success: true,
      file: latestFile.file,
      url:
        `/uploads/screenshots/${latestFile.file}`,
    });

  } catch (err) {

    res.status(500).json({
      message: err.message,
    });

  }
});

module.exports = router;