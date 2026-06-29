const express = require('express');
const router = express.Router();
const Reminder = require('../models/Reminder');
const axios = require('axios');

// Save reminder
router.post('/save', async (req, res) => {
  try {
    const { text, reminderTime } = req.body;
    const reminder = new Reminder({ text, reminderTime });
    await reminder.save();
    res.json({ status: 'saved', reminder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check and trigger due reminders
async function checkReminders() {
  try {
    const now = new Date();
    const dueReminders = await Reminder.find({
      reminderTime: { $lte: now },
      triggered: false
    });

    for (const reminder of dueReminders) {
      console.log(`⏰ Reminder triggered: ${reminder.text}`);
      
      // Speak the reminder
      try {
        await axios.post('http://127.0.0.1:5001/speak', {
          text: `Sir, you asked me to remind you: ${reminder.text}`
        });
      } catch {}

      // Notify browser
      if (global.wakeCallback) {
        global.wakeCallback({
          trigger: 'reminder',
          message: '',
          reply: `⏰ Reminder: ${reminder.text}`
        });
      }

      // Mark as triggered
      reminder.triggered = true;
      await reminder.save();
    }
  } catch {}
}

// Check reminders every 30 seconds
setInterval(checkReminders, 30000);

module.exports = router;