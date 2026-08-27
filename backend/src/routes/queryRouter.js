const express = require("express");
const router = express.Router();
const ShipmentReadModel = require("../models/readModel");

/**
 * GET /shipment/:id/events
 * Unblocks P2 Frontend Timeline UI by returning raw chronological event list
 */
router.get("/shipment/:id/events", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch from EventStore or provide initial structured events stream
    // In Week 2/3 this hooks directly into P1's append-only EventStore collection
    const sampleEvents = [
      {
        aggregateId: id,
        eventType: "SHIPMENT_CREATED",
        payload: { origin: "Hub A", destination: "Warehouse 4" },
        version: 1,
        timestamp: new Date(Date.now() - 3600 * 1000 * 24).toISOString(),
      },
      {
        aggregateId: id,
        eventType: "SHIPMENT_MOVED",
        payload: { currentLocation: "Transit Hub - Midwest", destination: "Warehouse 4" },
        version: 2,
        timestamp: new Date(Date.now() - 3600 * 1000 * 12).toISOString(),
      },
    ];

    return res.status(200).json({
      success: true,
      shipmentId: id,
      totalEvents: sampleEvents.length,
      events: sampleEvents,
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
 * Fast read path querying the pre-computed Read Model
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

module.exports = router;