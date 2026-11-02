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
let checkingReminders = false;

async function checkReminders() {
  if (checkingReminders) return;            // previous check still speaking
  checkingReminders = true;
  try {
    const now = new Date();
    const dueReminders = await Reminder.find({
      reminderTime: { $lte: now },
      triggered: false
    });

    for (const reminder of dueReminders) {
      console.log(`⏰ Reminder triggered: ${reminder.text}`);

      // Mark as triggered FIRST so a slow speech can never fire it twice
      reminder.triggered = true;
      await reminder.save();

      // Notify browser
      if (global.wakeCallback) {
        global.wakeCallback({
          trigger: 'reminder',
          message: '',
          reply: `⏰ Reminder: ${reminder.text}`
        });
      }

      const spoken = `Sir, you asked me to remind you: ${reminder.text}`;
      try {
        // Preferred: the voice loop mutes the mic and waits for its turn
        await axios.post('http://127.0.0.1:5002/say', { text: spoken }, { timeout: 120000 });
      } catch {
        try {
          await axios.post('http://127.0.0.1:5001/speak', { text: spoken });
        } catch {}
      }
    }
  } catch (err) {
    console.error('Reminder check failed:', err.message);
  } finally {
    checkingReminders = false;
  }
}

// Check reminders every 30 seconds
setInterval(checkReminders, 30000);

module.exports = router;