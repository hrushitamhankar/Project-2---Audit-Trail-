const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const ShipmentReadModel = require("../models/readModel");
const { applyEventToReadModel } = require("../workers/projectionWorker");

/**
 * GET /shipment/:id/events
 * Returns the raw chronological audit log for a shipment
 */
router.get("/shipment/:id/events", async (req, res) => {
  try {
    const { id } = req.params;
    const AuditEvent = mongoose.models.AuditEvent || mongoose.model("AuditEvent", new mongoose.Schema({}, { strict: false }));
    
    const events = await AuditEvent.find({ aggregateId: id }).sort({ version: 1 }).lean();

    return res.status(200).json({
      success: true,
      shipmentId: id,
      totalEvents: events.length,
      events: events,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /shipment/:id
 * Fast query path from the pre-computed Read Model
 */
router.get("/shipment/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const shipment = await ShipmentReadModel.findOne({ shipmentId: id });

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

/**
 * POST /projection/rebuild/:id
 * Rebuilds the read model for a specific shipment by replaying all historical events
 */
router.post("/projection/rebuild/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const AuditEvent = mongoose.models.AuditEvent || mongoose.model("AuditEvent", new mongoose.Schema({}, { strict: false }));

    const events = await AuditEvent.find({ aggregateId: id }).sort({ version: 1 }).lean();

    if (!events || events.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No events found to replay for aggregate ID: ${id}`,
      });
    }

    // Reset current projection
    await ShipmentReadModel.deleteOne({ shipmentId: id });

    // Sequentially apply all events
    for (const event of events) {
      await applyEventToReadModel(event);
    }

    const rebuiltModel = await ShipmentReadModel.findOne({ shipmentId: id });

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

/**
 * GET /projection/health
 * Reports synchronization status and total projected records
 */
router.get("/projection/health", async (req, res) => {
  try {
    const totalReadModels = await ShipmentReadModel.countDocuments();
    const alertCount = await ShipmentReadModel.countDocuments({ currentStatus: "ALERT" });

    return res.status(200).json({
      success: true,
      status: "HEALTHY",
      metrics: {
        totalShipmentsProjected: totalReadModels,
        criticalAlertsActive: alertCount,
        workerSyncMode: "Live Change Streams / Polling",
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      status: "DEGRADED",
      error: error.message,
    });
  }
});

module.exports = router;