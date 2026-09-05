const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const ShipmentReadModel = require("../models/readModel");
const cacheService = require("../services/cacheService");
const { applyEventToReadModel } = require("../workers/projectionWorker");

// ============================================================
// GET /shipments
// Get shipments with pagination, status filter and search
// ============================================================
router.get("/shipments", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 10, 1),
      100
    );

    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) {
      filter.currentStatus = req.query.status;
    }

    if (req.query.search) {
      const search = req.query.search;

      filter.$or = [
        {
          shipmentId: {
            $regex: search,
            $options: "i",
          },
        },
        {
          location: {
            $regex: search,
            $options: "i",
          },
        },
      ];
    }

    const [shipments, total] = await Promise.all([
      ShipmentReadModel.find(filter)
        .sort({ lastUpdated: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      ShipmentReadModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: shipments,
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching shipments:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch shipments.",
      error: error.message,
    });
  }
});

// ============================================================
// GET /shipment/analytics/summary
// Shipment analytics summary
// ============================================================
router.get("/shipment/analytics/summary", async (req, res) => {
  try {
    const summary = await ShipmentReadModel.aggregate([
      {
        $group: {
          _id: "$currentStatus",
          count: {
            $sum: 1,
          },
        },
      },
    ]);

    // Object expected by projection/e2e tests
    const data = {
      total: 0,
      CREATED: 0,
      IN_TRANSIT: 0,
      ALERT: 0,
      DELIVERED: 0,
    };

    for (const item of summary) {
      const count = item.count || 0;

      if (item._id && Object.prototype.hasOwnProperty.call(data, item._id)) {
        data[item._id] = count;
      }

      data.total += count;
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching shipment analytics:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch shipment analytics.",
      error: error.message,
    });
  }
});

// ============================================================
// GET /shipment/:id/events
// Get all events for a shipment
// ============================================================
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
      data: events,
    });
  } catch (error) {
    console.error("Error fetching shipment events:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch shipment events.",
      error: error.message,
    });
  }
});

// ============================================================
// GET /shipment/:id
// Get current shipment state
// ============================================================
router.get("/shipment/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // ----------------------------------------------------------
    // Check cache first
    // ----------------------------------------------------------
    const cachedShipment = cacheService.get(id);

    if (cachedShipment) {
      return res.status(200).json({
        success: true,
        source: "CACHE",
        data: cachedShipment,
      });
    }

    // ----------------------------------------------------------
    // Get shipment from Read Model
    //
    // IMPORTANT:
    // Do NOT use .lean() here because the Jest tests mock
    // findOne() directly.
    // ----------------------------------------------------------
    const shipment = await ShipmentReadModel.findOne({
      shipmentId: id,
    });

    // ----------------------------------------------------------
    // Shipment not found
    // ----------------------------------------------------------
    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: `Shipment ${id} not found in Read Model.`,
      });
    }

    // ----------------------------------------------------------
    // Save to cache
    // ----------------------------------------------------------
    cacheService.set(id, shipment);

    return res.status(200).json({
      success: true,
      source: "DATABASE",
      data: shipment,
    });
  } catch (error) {
    console.error("Error fetching shipment:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch shipment.",
      error: error.message,
    });
  }
});

// ============================================================
// GET /shipment/:id/state?at=timestamp
//
// Historical shipment state using EVENT REPLAY
//
// This route rebuilds the state only in memory.
// It DOES NOT modify the current Read Model.
// ============================================================
router.get("/shipment/:id/state", async (req, res) => {
  try {
    const { id } = req.params;
    const { at } = req.query;

    // ----------------------------------------------------------
    // Validate timestamp
    // ----------------------------------------------------------
    if (!at) {
      return res.status(400).json({
        success: false,
        message: "Query parameter 'at' is required.",
      });
    }

    const targetTime = new Date(at);

    if (Number.isNaN(targetTime.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid timestamp provided.",
      });
    }

    // ----------------------------------------------------------
    // Get AuditEvent model
    // ----------------------------------------------------------
    const AuditEvent =
      mongoose.models.AuditEvent ||
      mongoose.model(
        "AuditEvent",
        new mongoose.Schema({}, { strict: false })
      );

    // ----------------------------------------------------------
    // Get events up to requested timestamp
    // ----------------------------------------------------------
    const events = await AuditEvent.find({
      aggregateId: id,
      timestamp: {
        $lte: targetTime,
      },
    })
      .sort({ version: 1 })
      .lean();

    // ----------------------------------------------------------
    // No historical events
    // ----------------------------------------------------------
    if (!events || events.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No historical events found for shipment ${id} at ${at}.`,
      });
    }

    // ----------------------------------------------------------
    // Initial historical state
    // ----------------------------------------------------------
    const historicalState = {
      shipmentId: id,
      currentStatus: null,
      location: null,
      temperature: null,
      version: 0,
      lastUpdated: null,
    };

    // ----------------------------------------------------------
    // Replay events in memory
    // ----------------------------------------------------------
    for (const event of events) {
      const eventPayload = event.payload || {};

      switch (event.eventType) {
        // ------------------------------------------------------
        // SHIPMENT_CREATED
        // ------------------------------------------------------
        case "SHIPMENT_CREATED":
          historicalState.currentStatus = "CREATED";

          historicalState.location =
            eventPayload.origin ||
            eventPayload.location ||
            "Origin Facility";

          historicalState.version =
            event.version || historicalState.version || 1;

          historicalState.lastUpdated =
            event.timestamp || historicalState.lastUpdated;

          break;

        // ------------------------------------------------------
        // SHIPMENT_MOVED
        // ------------------------------------------------------
        case "SHIPMENT_MOVED":
          historicalState.currentStatus = "IN_TRANSIT";

          historicalState.location =
            eventPayload.location ||
            eventPayload.currentLocation ||
            eventPayload.destination ||
            eventPayload.to ||
            "In Transit";

          historicalState.version =
            event.version || historicalState.version;

          historicalState.lastUpdated =
            event.timestamp || historicalState.lastUpdated;

          break;

        // ------------------------------------------------------
        // TEMPERATURE_SPIKE
        // ------------------------------------------------------
        case "TEMPERATURE_SPIKE": {
          const isCritical = eventPayload.temperature > 8.0;

          historicalState.temperature =
            eventPayload.temperature ??
            historicalState.temperature;

          historicalState.currentStatus = isCritical
            ? "ALERT"
            : "IN_TRANSIT";

          historicalState.version =
            event.version || historicalState.version;

          historicalState.lastUpdated =
            event.timestamp || historicalState.lastUpdated;

          break;
        }

        // ------------------------------------------------------
        // SHIPMENT_DELIVERED
        // ------------------------------------------------------
        case "SHIPMENT_DELIVERED":
          historicalState.currentStatus = "DELIVERED";

          historicalState.location =
            eventPayload.destination ||
            eventPayload.location ||
            "Destination Facility";

          historicalState.version =
            event.version || historicalState.version;

          historicalState.lastUpdated =
            event.timestamp || historicalState.lastUpdated;

          break;

        // ------------------------------------------------------
        // Unknown event
        // ------------------------------------------------------
        default:
          console.log(
            `Unknown historical event type: ${event.eventType}`
          );
          break;
      }
    }

    // ----------------------------------------------------------
    // Return historical state
    // ----------------------------------------------------------
    return res.status(200).json({
      success: true,
      data: {
        shipmentId: id,
        requestedTime: targetTime,
        source: "EVENT_REPLAY",
        state: historicalState,
        eventsApplied: events.length,
      },
    });
  } catch (error) {
    console.error(
      "Error calculating historical state:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to calculate historical shipment state.",
      error: error.message,
    });
  }
});

// ============================================================
// POST /projection/rebuild/:id
//
// Rebuild current Read Model by replaying all events
// ============================================================
router.post("/projection/rebuild/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // ----------------------------------------------------------
    // Get AuditEvent model
    // ----------------------------------------------------------
    const AuditEvent =
      mongoose.models.AuditEvent ||
      mongoose.model(
        "AuditEvent",
        new mongoose.Schema({}, { strict: false })
      );

    // ----------------------------------------------------------
    // Get all events
    // ----------------------------------------------------------
    const events = await AuditEvent.find({
      aggregateId: id,
    })
      .sort({ version: 1 })
      .lean();

    // ----------------------------------------------------------
    // No events
    // ----------------------------------------------------------
    if (!events || events.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No events found for shipment ${id}.`,
      });
    }

    // ----------------------------------------------------------
    // Clear cache
    // ----------------------------------------------------------
    cacheService.invalidate(id);

    // ----------------------------------------------------------
    // Delete current read model
    // ----------------------------------------------------------
    await ShipmentReadModel.deleteOne({
      shipmentId: id,
    });

    // ----------------------------------------------------------
    // Replay every event
    // ----------------------------------------------------------
    for (const event of events) {
      await applyEventToReadModel(event);
    }

    // ----------------------------------------------------------
    // Get rebuilt state
    //
    // IMPORTANT:
    // Do NOT use .lean() because the Jest test mocks
    // findOne() directly.
    // ----------------------------------------------------------
    const rebuiltModel = await ShipmentReadModel.findOne({
      shipmentId: id,
    });

    // ----------------------------------------------------------
    // Return rebuilt state
    // ----------------------------------------------------------
    return res.status(200).json({
      success: true,
      message: `Successfully replayed ${events.length} events for ${id}`,
      rebuiltState: rebuiltModel,
    });
  } catch (error) {
    console.error("Error rebuilding projection:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to rebuild projection.",
      error: error.message,
    });
  }
});

// ============================================================
// GET /projection/health
// Projection health check
// ============================================================
router.get("/projection/health", async (req, res) => {
  try {
    const shipmentCount =
      await ShipmentReadModel.countDocuments();

    return res.status(200).json({
      success: true,
      status: "HEALTHY",
      projection: {
        readModel: "ShipmentReadModel",
        shipmentCount,
      },
    });
  } catch (error) {
    console.error(
      "Projection health check failed:",
      error
    );

    return res.status(500).json({
      success: false,
      status: "UNHEALTHY",
      message: "Projection health check failed.",
      error: error.message,
    });
  }
});

// ============================================================
// Export router
// ============================================================
module.exports = router;