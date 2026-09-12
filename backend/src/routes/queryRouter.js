const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const crypto = require("crypto");

const ShipmentReadModel = require("../models/readModel");
const cacheService = require("../services/cacheService");
const {
  applyEventToReadModel,
  applyBatchEvents,
} = require("../workers/projectionWorker");

function computeStateFingerprint(shipmentId, status, location, version) {
  const payload = `${shipmentId}|${status}|${location}|${version}`;
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/**
 * GET /projection/lag
 */
router.get("/projection/lag", async (req, res) => {
  try {
    const AuditEvent =
      mongoose.models.AuditEvent ||
      mongoose.model(
        "AuditEvent",
        new mongoose.Schema({}, { strict: false })
      );

    let latestEventQuery = AuditEvent.findOne().sort({
      timestamp: -1,
    });

    if (
      latestEventQuery &&
      typeof latestEventQuery.lean === "function"
    ) {
      latestEventQuery = latestEventQuery.lean();
    }

    const latestEvent = await latestEventQuery;

    let latestReadQuery = ShipmentReadModel.findOne().sort({
      lastUpdated: -1,
    });

    if (
      latestReadQuery &&
      typeof latestReadQuery.lean === "function"
    ) {
      latestReadQuery = latestReadQuery.lean();
    }

    const latestReadModel = await latestReadQuery;

    const eventTime = latestEvent?.timestamp
      ? new Date(latestEvent.timestamp).getTime()
      : null;

    const projectionTime = latestReadModel?.lastUpdated
      ? new Date(latestReadModel.lastUpdated).getTime()
      : null;

    const lagMs =
      eventTime && projectionTime
        ? Math.max(0, eventTime - projectionTime)
        : 0;

    return res.status(200).json({
      success: true,
      data: {
        status: lagMs < 5000 ? "OPTIMAL" : "CATCHING_UP",
        lagMs,
        lastEventTimestamp: latestEvent?.timestamp || null,
        lastProjectedTimestamp:
          latestReadModel?.lastUpdated || null,
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
 * POST /projection/rebuild-all
 *
 * Disaster recovery route:
 * Deletes all read models and replays every audit event.
 */
router.post("/projection/rebuild-all", async (req, res) => {
  try {
    const AuditEvent =
      mongoose.models.AuditEvent ||
      mongoose.model(
        "AuditEvent",
        new mongoose.Schema({}, { strict: false })
      );

    let query = AuditEvent.find().sort({
      version: 1,
    });

    if (query && typeof query.lean === "function") {
      query = query.lean();
    }

    const allEvents = await query;

    if (!allEvents || allEvents.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No audit events found to rebuild projections.",
      });
    }

    cacheService.clear();

    await ShipmentReadModel.deleteMany({});

    const processedCount = await applyBatchEvents(allEvents);

    const totalRebuilt =
      await ShipmentReadModel.countDocuments();

    return res.status(200).json({
      success: true,
      message: `Full system rebuild completed. Replayed ${processedCount} events across ${totalRebuilt} shipment records.`,
      metrics: {
        eventsReplayed: processedCount,
        readModelsGenerated: totalRebuilt,
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
 * GET /shipment/:id/state
 *
 * Reconstruct shipment state at a specific point in time.
 */
router.get("/shipment/:id/state", async (req, res) => {
  try {
    const { id } = req.params;
    const { at } = req.query;

    if (!at) {
      return res.status(400).json({
        success: false,
        message: "Query parameter 'at' is required.",
      });
    }

    const targetDate = new Date(at);

    if (Number.isNaN(targetDate.getTime())) {
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

    let query = AuditEvent.find({
      aggregateId: id,
      timestamp: {
        $lte: targetDate,
      },
    }).sort({
      version: 1,
    });

    if (query && typeof query.lean === "function") {
      query = query.lean();
    }

    const events = await query;

    if (!events || events.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No historical events found for shipment ${id} at or before ${targetDate.toISOString()}`,
      });
    }

    const state = {
      shipmentId: id,
      currentStatus: "CREATED",
      location: "Origin Facility",
      temperature: null,
      version: 0,
      lastUpdated: null,
    };

    /*
     * Replay every event up to the requested timestamp.
     */
    for (const event of events) {
      let payload = event.payload || {};

      /*
       * Support payload stored as a JSON string.
       */
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          payload = {};
        }
      }

      state.version =
        event.version !== undefined &&
        event.version !== null
          ? event.version
          : state.version + 1;

      state.lastUpdated = event.timestamp;

      switch (event.eventType) {
        case "SHIPMENT_CREATED":
          state.currentStatus = "CREATED";

          state.location =
            payload.origin ||
            payload.location ||
            payload.currentLocation ||
            "Origin Facility";

          break;

        case "SHIPMENT_MOVED":
          state.currentStatus = "IN_TRANSIT";

          /*
           * Support all common movement payload formats.
           * payload.location is especially important for
           * the historical/time-travel tests.
           */
          state.location =
            payload.location ||
            payload.currentLocation ||
            payload.destination ||
            payload.to ||
            "In Transit";

          break;

        case "SHIPMENT_DELIVERED":
          state.currentStatus = "DELIVERED";

          state.location =
            payload.destination ||
            payload.location ||
            payload.currentLocation ||
            state.location;

          break;

        case "TEMPERATURE_SPIKE":
          state.temperature = payload.temperature;

          if (Number(payload.temperature) > 8.0) {
            state.currentStatus = "ALERT";
          }

          break;

        default:
          break;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        shipmentId: id,
        requestedAt: targetDate.toISOString(),

        // Historical state was reconstructed by replaying events.
        source: "EVENT_REPLAY",

        eventsApplied: events.length,
        state,
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
 * GET /shipments
 */
router.get("/shipments", async (req, res) => {
  try {
    const page = Math.max(
      1,
      parseInt(req.query.page, 10) || 1
    );

    const limit = Math.max(
      1,
      Math.min(
        100,
        parseInt(req.query.limit, 10) || 10
      )
    );

    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status) {
      filter.currentStatus = req.query.status;
    }

    if (req.query.search) {
      filter.shipmentId = {
        $regex: req.query.search,
        $options: "i",
      };
    }

    let query = ShipmentReadModel.find(filter)
      .sort({
        lastUpdated: -1,
      })
      .skip(skip)
      .limit(limit);

    if (query && typeof query.lean === "function") {
      query = query.lean();
    }

    const [items, total] = await Promise.all([
      query,
      ShipmentReadModel.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: items,
      pagination: {
        page,
        limit,
        totalRecords: total,
        totalPages: Math.ceil(total / limit) || 1,
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
 * GET /shipment/analytics/summary
 */
router.get(
  "/shipment/analytics/summary",
  async (req, res) => {
    try {
      const summary =
        await ShipmentReadModel.aggregate([
          {
            $group: {
              _id: "$currentStatus",
              count: {
                $sum: 1,
              },
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

      if (Array.isArray(summary)) {
        summary.forEach((item) => {
          if (
            item._id &&
            formattedSummary[item._id] !== undefined
          ) {
            formattedSummary[item._id] = item.count;
          }

          formattedSummary.total += item.count;
        });
      }

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
  }
);

/**
 * GET /shipment/:id/verify
 *
 * Computes deterministic SHA-256 state fingerprint.
 */
router.get("/shipment/:id/verify", async (req, res) => {
  try {
    const { id } = req.params;

    let query = ShipmentReadModel.findOne({
      shipmentId: id,
    });

    if (query && typeof query.lean === "function") {
      query = query.lean();
    }

    const shipment = await query;

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: `Shipment ${id} not found for audit verification.`,
      });
    }

    const fingerprint = computeStateFingerprint(
      shipment.shipmentId,
      shipment.currentStatus,
      shipment.location,
      shipment.version
    );

    return res.status(200).json({
      success: true,
      shipmentId: id,
      verifiedVersion: shipment.version,
      stateFingerprint: fingerprint,
      algorithm: "SHA-256",
      timestamp: new Date().toISOString(),
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
 *
 * Returns raw chronological audit log.
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

    let query = AuditEvent.find({
      aggregateId: id,
    }).sort({
      version: 1,
    });

    if (query && typeof query.lean === "function") {
      query = query.lean();
    }

    const events = await query;

    return res.status(200).json({
      success: true,
      shipmentId: id,
      totalEvents: events ? events.length : 0,
      events: events || [],
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
 *
 * Fast query path with cache.
 */
router.get("/shipment/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const cachedData = cacheService.get(id);

    if (cachedData) {
      return res.status(200).json({
        success: true,
        source: "CACHE",
        data: cachedData,
      });
    }

    let query = ShipmentReadModel.findOne({
      shipmentId: id,
    });

    if (query && typeof query.lean === "function") {
      query = query.lean();
    }

    const shipment = await query;

    if (!shipment) {
      return res.status(404).json({
        success: false,
        message: `Shipment with ID ${id} not found in Read Model.`,
      });
    }

    cacheService.set(id, shipment);

    return res.status(200).json({
      success: true,
      source: "DATABASE",
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
 *
 * Replays history and invalidates cache for a single aggregate.
 */
router.post(
  "/projection/rebuild/:id",
  async (req, res) => {
    try {
      const { id } = req.params;

      const AuditEvent =
        mongoose.models.AuditEvent ||
        mongoose.model(
          "AuditEvent",
          new mongoose.Schema({}, { strict: false })
        );

      let query = AuditEvent.find({
        aggregateId: id,
      }).sort({
        version: 1,
      });

      if (query && typeof query.lean === "function") {
        query = query.lean();
      }

      const events = await query;

      if (!events || events.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No events found to replay for aggregate ID: ${id}`,
        });
      }

      cacheService.invalidate(id);

      await ShipmentReadModel.deleteOne({
        shipmentId: id,
      });

      for (const event of events) {
        await applyEventToReadModel(event);
      }

      let rebuiltQuery = ShipmentReadModel.findOne({
        shipmentId: id,
      });

      if (
        rebuiltQuery &&
        typeof rebuiltQuery.lean === "function"
      ) {
        rebuiltQuery = rebuiltQuery.lean();
      }

      const rebuiltModel = await rebuiltQuery;

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
  }
);

/**
 * GET /projection/health
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
        cachedEntriesCount: cacheService.size(),
        workerSyncMode:
          "Live Change Streams / Polling",
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