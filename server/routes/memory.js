const express = require('express');
const router = express.Router();
const Memory = require('../models/Memory');

// Save a memory
router.post('/save', async (req, res) => {
  const { content, type } = req.body;
  try {
    const memory = new Memory({ content, type: type || 'fact' });
    await memory.save();
    res.json({ status: 'saved', memory });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all memories
router.get('/all', async (req, res) => {
  try {
    const memories = await Memory.find().sort({ createdAt: -1 }).limit(20);
    res.json({ memories });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a memory
router.delete('/:id', async (req, res) => {
  try {
    await Memory.findByIdAndDelete(req.params.id);
    res.json({ status: 'deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;