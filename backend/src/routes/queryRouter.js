const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const ShipmentReadModel = require("../models/readModel");
const { applyEventToReadModel } = require("../workers/projectionWorker");

/**
 * GET /shipment/analytics/summary
 * Aggregates read-model metrics across all tracked shipments
 */
router.get("/shipment/analytics/summary", async (req, res) => {
  try {
    const summary = await ShipmentReadModel.aggregate([
      {
        $group: {
          _id: "$currentStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    const formattedSummary = {
      total: 0,
      CREATED: 0,
      IN_TRANSIT: 0,
      DELIVERED: 0,
      ALERT: 0,
    };

    summary.forEach((item) => {
      if (item._id && formattedSummary[item._id] !== undefined) {
        formattedSummary[item._id] = item.count;
      }
      formattedSummary.total += item.count;
    });

    return res.status(200).json({
      success: true,
      data: formattedSummary,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /shipment/:id/events
 * Returns the raw chronological audit log for a shipment.
 */
router.get("/shipment/:id/events", async (req, res) => {
  try {
    const { id } = req.params;

    const AuditEvent =
      mongoose.models.AuditEvent ||
      mongoose.model(
        "AuditEvent",
        new mongoose.Schema({}, { strict: false })
      );

    const events = await AuditEvent.find({
      aggregateId: id,
    })
      .sort({ version: 1 })
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

/**
 * GET /shipment/:id
 * Fast query path using the pre-computed Read Model.
 */
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

/**
 * GET /shipment/:id/state
 *
 * Returns the shipment state at a specific point in time.
 *
 * Example:
 * GET /shipment/SHP-202/state?at=2026-08-20T10:00:00Z
 */
router.get("/shipment/:id/state", async (req, res) => {
  try {
    const { id } = req.params;
    const { at } = req.query;

    // Validate timestamp parameter.
    if (!at) {
      return res.status(400).json({
        success: false,
        message: "Query parameter 'at' is required.",
      });
    }

    const requestedTime = new Date(at);

    if (Number.isNaN(requestedTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid timestamp provided.",
      });
    }

    const AuditEvent =
      mongoose.models.AuditEvent ||
      mongoose.model(
        "AuditEvent",
        new mongoose.Schema({}, { strict: false })
      );

    // Get only events that existed at the requested time.
    const events = await AuditEvent.find({
      aggregateId: id,
      timestamp: {
        $lte: requestedTime,
      },
    })
      .sort({
        timestamp: 1,
        version: 1,
      })
      .lean();

    if (events.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No events found for shipment ${id} at the requested time.`,
      });
    }

    /*
     * Rebuild historical state in memory.
     *
     * This intentionally does NOT call applyEventToReadModel()
     * because that function writes to the current Read Model.
     * Historical queries should not modify the current state.
     */
    const historicalState = {
      shipmentId: id,
      currentStatus: "UNKNOWN",
      location: null,
      temperature: null,
      version: 0,
      lastUpdated: null,
    };

    for (const event of events) {
      const payload = event.payload || {};

      switch (event.eventType) {
        case "SHIPMENT_CREATED":
          historicalState.currentStatus = "CREATED";
          historicalState.location =
            payload.origin || "Origin Facility";
          historicalState.version = event.version || 1;
          historicalState.lastUpdated =
            event.timestamp || historicalState.lastUpdated;
          break;

        case "SHIPMENT_MOVED":
          historicalState.location =
            payload.currentLocation ||
            payload.destination ||
            "In Transit";

          historicalState.currentStatus = "IN_TRANSIT";
          historicalState.version = event.version || historicalState.version;
          historicalState.lastUpdated =
            event.timestamp || historicalState.lastUpdated;
          break;

        case "TEMPERATURE_SPIKE": {
          const temperature = payload.temperature;

          historicalState.temperature = temperature;

          // Same threshold used by projectionWorker.js.
          const isCritical = temperature > 8.0;

          historicalState.currentStatus = isCritical
            ? "ALERT"
            : "IN_TRANSIT";

          historicalState.version =
            event.version || historicalState.version;

          historicalState.lastUpdated =
            event.timestamp || historicalState.lastUpdated;

          break;
        }

        case "SHIPMENT_DELIVERED":
          historicalState.currentStatus = "DELIVERED";
          historicalState.location =
            payload.destination || "DestinationFacility";
          historicalState.version = event.version || historicalState.version;
          historicalState.lastUpdated =
            event.timestamp || historicalState.lastUpdated;
          break;

        default:
          // Ignore event types that do not affect the shipment state.
          break;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        aggregateId: id,
        asOf: requestedTime.toISOString(),
        eventsApplied: events.length,
        state: historicalState,
      },
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
 *
 * Rebuilds the Read Model by replaying all historical events.
 */
router.post("/projection/rebuild/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const AuditEvent =
      mongoose.models.AuditEvent ||
      mongoose.model(
        "AuditEvent",
        new mongoose.Schema({}, { strict: false })
      );

    const events = await AuditEvent.find({
      aggregateId: id,
    })
      .sort({ version: 1 })
      .lean();

    if (!events || events.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No events found to replay for aggregate ID: ${id}`,
      });
    }

    // Remove the existing projection.
    await ShipmentReadModel.deleteOne({
      shipmentId: id,
    });

    // Replay events in chronological/version order.
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

/**
 * GET /projection/health
 *
 * Reports Read Model synchronization status.
 */
router.get("/projection/health", async (req, res) => {
  try {
    const totalReadModels =
      await ShipmentReadModel.countDocuments();

    const alertCount =
      await ShipmentReadModel.countDocuments({
        currentStatus: "ALERT",
      });

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