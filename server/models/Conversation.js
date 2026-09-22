const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
  },

  content: {
    type: String,
    required: true,
  },

  imageUrl: {
    type: String,
    default: null,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const ConversationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "New Chat",
    },

    messages: [MessageSchema],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "Conversation",
  ConversationSchema
);