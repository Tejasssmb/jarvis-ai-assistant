const express = require("express");
const multer = require("multer");

const router = express.Router();

const storage = multer.diskStorage({

  destination(req, file, cb) {

    cb(null, "uploads/screenshots/");
  },

  filename(req, file, cb) {

    cb(
      null,
      Date.now() + "-" + file.originalname
    );
  },
});

const upload = multer({
  storage,
});

router.post(
  "/",
  upload.single("screenshot"),
  async (req, res) => {

    res.json({
      success: true,
      file: req.file.filename,
    });

  }
);

module.exports = router;