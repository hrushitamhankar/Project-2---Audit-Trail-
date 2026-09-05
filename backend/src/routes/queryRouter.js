const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const ShipmentReadModel = require("../models/readModel");
const cacheService = require("../services/cacheService");
const { applyEventToReadModel } = require("../workers/projectionWorker");

/**
 * GET /shipments
 * List read-model shipments with pagination, status filter, and aggregate search
 */
router.get("/shipments", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) {
      filter.currentStatus = req.query.status;
    }
    if (req.query.search) {
      filter.shipmentId = { $regex: req.query.search, $options: "i" };
    }

    const [items, total] = await Promise.all([
      ShipmentReadModel.find(filter).sort({ lastUpdated: -1 }).skip(skip).limit(limit).lean(),
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
 * Returns raw chronological audit log for a shipment
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
 * Fast query path with in-memory cache check
 */
router.get("/shipment/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check in-memory cache first
    const cachedData = cacheService.get(id);
    if (cachedData) {
      return res.status(200).json({
        success: true,
        source: "CACHE",
        data: cachedData,
      });
    }

    const shipment = await ShipmentReadModel.findOne({ shipmentId: id });

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
 * Replays history and invalidates existing cache
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

    cacheService.invalidate(id);
    await ShipmentReadModel.deleteOne({ shipmentId: id });

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
        cachedEntriesCount: cacheService.size(),
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