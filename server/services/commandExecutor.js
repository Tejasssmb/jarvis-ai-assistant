const axios = require("axios");

async function executeCommand(parsed) {
  try {

    // ===== PLAN EXECUTION =====
    if (parsed.type === "plan") {

      const results = [];

      for (const step of parsed.steps) {

        const execRes = await axios.post(
          "http://127.0.0.1:5001/execute",
          {
            parsed: step,
          }
        );

        results.push(
          execRes.data.action || `${step.action} completed`
        );
      }

      return {
        success: true,
        action: results.join(". "),
        imageUrl: null,
      };
    }

    // ===== DYNAMIC EXECUTION =====
    let execRes;

    if (parsed.type === "dynamic") {
      execRes = await axios.post(
        "http://127.0.0.1:5001/dynamic",
        {
          code: parsed.code,
          description: parsed.description,
        }
      );
    } else {
      execRes = await axios.post(
        "http://127.0.0.1:5001/execute",
        {
          parsed,
        }
      );
    }

    return {
      success: true,
      action: execRes.data.action || "Done sir",
      imageUrl: execRes.data.imageUrl || null,
    };

  } catch (err) {

    return {
      success: false,
      action: err.message,
    };

  }
}

module.exports = executeCommand;