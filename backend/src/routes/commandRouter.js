const express = require("express");
const { appendEvent } = require("../services/eventStore");

const router = express.Router();

// Create a new audit event
router.post("/events", async (req, res) => {
  try {
    const { aggregateId, eventType, payload, version } = req.body;

    if (!aggregateId || !eventType || !payload || version === undefined) {
      return res.status(400).json({
        message: "aggregateId, eventType, payload and version are required",
      });
    }

    const event = await appendEvent({
      aggregateId,
      eventType,
      payload,
      version,
    });

    return res.status(201).json(event);
  } catch (error) {
    console.error("Error creating audit event:", error.message);

    return res.status(500).json({
      message: "Failed to create audit event",
      error: error.message,
    });
  }
});

module.exports = router;