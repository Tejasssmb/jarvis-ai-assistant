const User = require("../models/User");
const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const Otp = require("../models/Otp");
const { verifyUserToken } = require("../utils/userJwt");
const { generateUserToken } = require("../utils/userJwt");
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
router.post("/send-otp", async (req, res) => {
  try {
    const { email } = req.body;

    const otp = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    await Otp.deleteMany({ email });

    await Otp.create({
      email,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await transporter.sendMail({
  from: `"JARVIS AI" <${process.env.EMAIL_USER}>`,
  to: email,
  subject: "Your JARVIS Login OTP",
  html: `
    <h2>JARVIS Login</h2>
    <p>Your OTP is:</p>
    <h1>${otp}</h1>
    <p>This OTP expires in 5 minutes.</p>
  `,
});

    res.json({
      message: "OTP Generated",
    });

  } catch (err) {

    res.status(500).json({
      message: err.message,
    });

  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const record = await Otp.findOne({ email });

    if (!record) {
      return res.status(400).json({
        message: "OTP not found",
      });
    }

    if (record.expiresAt < new Date()) {
      await Otp.deleteOne({ _id: record._id });

      return res.status(400).json({
        message: "OTP expired",
      });
    }

    if (record.otp !== otp) {
      return res.status(400).json({
        message: "Invalid OTP",
      });
    }

    await Otp.deleteOne({ _id: record._id });

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        emailVerified: true,
      });
    }

    const token = generateUserToken(user);

res.json({
  message: "OTP Verified",
  token,
  user: {
    id: user._id,
    email: user.email,
    name: user.name,
  },
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
    
    const decoded = verifyUserToken(token);
    

    const user = await User.findById(decoded.userId);
    

    if (!user) {
      return res.status(401).json({ valid: false });
    }

    res.json({
      valid: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    });

  } catch (err) {
    

    res.status(401).json({
      valid: false,
      error: err.message,
    });
  }
});
module.exports = router;