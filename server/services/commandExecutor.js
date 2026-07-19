const axios = require("axios");

async function executeCommand(parsed) {
  try {
    let execRes;

    if (parsed.type === "dynamic") {
      execRes = await axios.post("http://127.0.0.1:5001/dynamic", {
        code: parsed.code,
        description: parsed.description,
      });
    } else {
      execRes = await axios.post("http://127.0.0.1:5001/execute", {
        parsed,
      });
    }

    return {
      success: true,
      action: execRes.data.action || "Done sir",
    };
  } catch (err) {
    return {
      success: false,
      action: "Done sir",
    };
  }
}

module.exports = executeCommand;