const express = require("express");
const { getEvents } = require("../services/eventStore");

const router = express.Router();

// Get all events for an aggregate
router.get("/events/:aggregateId", async (req, res) => {
  try {
    const { aggregateId } = req.params;

    if (!aggregateId) {
      return res.status(400).json({
        message: "aggregateId is required",
      });
    }

    const events = await getEvents(aggregateId);

    return res.status(200).json({
      count: events.length,
      events,
    });
  } catch (error) {
    console.error("Error fetching audit events:", error.message);

    return res.status(500).json({
      message: "Failed to fetch audit events",
      error: error.message,
    });
  }
});

module.exports = router;