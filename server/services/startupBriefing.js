const Memory = require("../models/Memory");
async function getStartupBriefing() {
  const memories = await Memory
  .find()
  .sort({ createdAt: -1 })
  .limit(50);

  const grouped = {};

memories.forEach(memory => {

  if (!grouped[memory.type]) {
    grouped[memory.type] = [];
  }

  grouped[memory.type].push(memory);

});

  return grouped;
  
}

module.exports = {
  getStartupBriefing
};