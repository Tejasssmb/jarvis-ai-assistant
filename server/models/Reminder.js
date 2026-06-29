const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  text: { type: String, required: true },
  reminderTime: { type: Date, required: true },
  triggered: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Reminder', reminderSchema);