const Memory = require("../models/Memory");
async function getStartupBriefing() {
  const projects = await Memory.find({
    type: "project"
  })
  .sort({ createdAt: -1 })
  .limit(3);

  const goals = await Memory.find({
    type: "goal"
  })
  .sort({ createdAt: -1 })
  .limit(3);

  return {
    projects,
    goals
  };
}

module.exports = {
  getStartupBriefing
};