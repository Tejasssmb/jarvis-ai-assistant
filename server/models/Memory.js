const mongoose = require('mongoose');

const memorySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['fact', 'preference', 'conversation'],
    default: 'fact'
  },
  content: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Memory', memorySchema);