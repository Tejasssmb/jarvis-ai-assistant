
// const {
//   getStartupBriefing
// } = startupService;
const express = require("express");
const router = express.Router();

const {
  getStartupBriefing
} = require("../services/startupBriefing");

console.log("🔥 startup route loaded");

router.get("/", async (req, res) => {
  try {
    const briefing = await getStartupBriefing();

    res.json(briefing);
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

module.exports = router;