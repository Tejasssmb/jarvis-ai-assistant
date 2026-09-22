const express = require("express");
const router = express.Router();

const Conversation = require("../models/Conversation");

// Create new conversation
router.post("/new", async (req, res) => {
  try {
    const conversation = await Conversation.create({
      title: "New Chat",
      messages: [],
    });

    res.json(conversation);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// Get all conversations
router.get("/", async (req, res) => {
  try {
    const conversations = await Conversation.find()
      .sort({ updatedAt: -1 })
      .select("title updatedAt");

    res.json(conversations);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

// Get single conversation
router.get("/:id", async (req, res) => {
  try {
    const conversation =
      await Conversation.findById(req.params.id);

    res.json(conversation);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.post("/:id/message", async (req, res) => {
  try {
    const { role, content, imageUrl } = req.body;

    const conversation =
      await Conversation.findById(req.params.id);

    conversation.messages.push({
      role,
      content,
      imageUrl: imageUrl || null,
    });

    await conversation.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;