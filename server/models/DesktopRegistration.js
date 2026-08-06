const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    registrationId: {
      type: String,
      required: true,
      unique: true,
    },

    deviceId: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "completed", "expired"],
      default: "pending",
    },

    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "DesktopRegistration",
  registrationSchema
);