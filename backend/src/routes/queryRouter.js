const express = require("express");

const { getEvents } = require("../services/eventStore");
const AuditEvent = require("../models/AuditEvent");
const ShipmentReadModel = require("../models/readModel");
const { applyEventToReadModel } = require("../workers/projectionWorker");

const router = express.Router();

// =====================================================
// GET /events/:aggregateId
// Get all audit events for an aggregate
// =====================================================
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

// =====================================================
// GET /shipment/:id/events
// Returns the raw chronological audit log for a shipment
// =====================================================
router.get("/shipment/:id/events", async (req, res) => {
  try {
    const { id } = req.params;

    const events = await AuditEvent.find({
      aggregateId: id,
    })
      .sort({ timestamp: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      shipmentId: id,
      totalEvents: events.length,
      events,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =====================================================
// GET /shipment/:id
// Fast query path from the pre-computed Read Model
// =====================================================
router.get("/shipment/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const shipment = await ShipmentReadModel.findOne({
      shipmentId: id,
    });

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: `Shipment with ID ${id} not found in Read Model.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: shipment,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// =====================================================
// POST /projection/rebuild/:id
// Rebuild the read model by replaying historical events
// =====================================================
router.post("/projection/rebuild/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const events = await AuditEvent.find({
      aggregateId: id,
    })
      .sort({ timestamp: 1 })
      .lean();

    if (!events || events.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No events found to replay for aggregate ID: ${id}`,
      });
    }

    // Reset current projection
    await ShipmentReadModel.deleteOne({
      shipmentId: id,
    });

    // Sequentially apply all events
    for (const event of events) {
      await applyEventToReadModel(event);
    }

    const rebuiltModel = await ShipmentReadModel.findOne({
      shipmentId: id,
    });

    return res.status(200).json({
      success: true,
      message: `Successfully replayed ${events.length} events for ${id}`,
      rebuiltState: rebuiltModel,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;