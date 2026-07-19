const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
    },

    deviceName: {
      type: String,
      required: true,
    },

    deviceType: {
      type: String,
      enum: ["laptop", "mobile", "tablet", "desktop", "watch"],
      required: true,
    },

    platform: {
      type: String,
      required: true,
    },

    trusted: {
      type: Boolean,
      default: false,
    },

    jwtToken: {
      type: String,
      default: null,
    },

    socketId: {
      type: String,
      default: null,
    },

    online: {
      type: Boolean,
      default: false,
    },

    lastSeen: {
      type: Date,
      default: Date.now,
    },

    permissions: {
      type: [String],
      default: ["chat", "voice", "notifications"],
    },

    pairingCode: {
      type: String,
      default: null,
    },

    pairingExpires: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Device", deviceSchema);