const Device = require("../models/Device");

async function getStartupBriefing() {

  const desktop = await Device.findOne({
    deviceType: "desktop",
    online: true
  });

  const mobile = await Device.findOne({
    deviceType: "mobile",
    online: true
  });

  let briefing =
    `Good ${getTimeOfDay()}, sir.\n\n`;

  briefing += "All systems operational.\n";

  if (desktop) {
    briefing += "Desktop connected.\n";
  }

  if (mobile) {
    briefing += "Phone connected.\n";
  }

  briefing += "\nHow may I assist you today?";

  return { briefing };
}

function getTimeOfDay() {
  const hour = new Date().getHours();

  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

module.exports = {
  getStartupBriefing
};