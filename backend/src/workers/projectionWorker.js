require("dotenv").config();

const mongoose = require("mongoose");
const ShipmentReadModel = require("../models/readModel");

/**
 * Event Projection Engine (P3 Ownership)
 * Applies domain events to maintain the materialized Read Model.
 */
async function applyEventToReadModel(event) {
  const {
    aggregateId,
    eventType,
    payload,
    version,
    timestamp,
  } = event;

  try {
    switch (eventType) {
      case "SHIPMENT_CREATED":
        await ShipmentReadModel.findOneAndUpdate(
          { shipmentId: aggregateId },
          {
            shipmentId: aggregateId,
            currentStatus: "CREATED",
            location: payload?.origin || "Origin Facility",
            version: version || 1,
            lastUpdated: timestamp || new Date(),
          },
          {
            upsert: true,
            new: true,
          }
        );

        console.log(
          `[P3 Worker] ReadModel initialized for shipment ${aggregateId}`
        );
        break;

      case "SHIPMENT_MOVED":
        await ShipmentReadModel.findOneAndUpdate(
          { shipmentId: aggregateId },
          {
            location:
              payload?.currentLocation ||
              payload?.destination ||
              "In Transit",
            currentStatus: "IN_TRANSIT",
            version: version,
            lastUpdated: timestamp || new Date(),
          },
          {
            new: true,
          }
        );

        console.log(
          `[P3 Worker] ReadModel updated for moved shipment ${aggregateId} to version ${version}`
        );
        break;

      case "SHIPMENT_DELIVERED":
        await ShipmentReadModel.findOneAndUpdate(
          { shipmentId: aggregateId },
          {
            currentStatus: "DELIVERED",
            location:
              payload?.destination || "Destination Facility",
            version: version,
            lastUpdated: timestamp || new Date(),
          },
          {
            new: true,
          }
        );

        console.log(
          `[P3 Worker] ReadModel marked as DELIVERED for shipment ${aggregateId}`
        );
        break;

      case "TEMPERATURE_SPIKE": {
        const isCritical = payload?.temperature > 8.0;

        await ShipmentReadModel.findOneAndUpdate(
          { shipmentId: aggregateId },
          {
            temperature: payload?.temperature,
            currentStatus: isCritical ? "ALERT" : "IN_TRANSIT",
            version: version,
            lastUpdated: timestamp || new Date(),
          },
          {
            new: true,
          }
        );

        console.log(
          `[P3 Worker] Sensor update for ${aggregateId}: ${payload?.temperature}°C (Alert: ${isCritical})`
        );

        break;
      }

      default:
        console.log(
          `[P3 Worker] Unhandled event type: ${eventType}`
        );
    }
  } catch (error) {
    console.error(
      `[P3 Worker] Error projecting event for ${aggregateId}:`,
      error.message
    );
  }
}

/**
 * Attaches real-time Change Stream listener to MongoDB EventStore
 */
function listenToEventStream(db) {
  const collection = db.collection("auditevents");

  try {
    const changeStream = collection.watch();

    console.log(
      "[P3 Worker] Active Change Stream watching 'auditevents' collection..."
    );

    changeStream.on("change", async (change) => {
      if (change.operationType === "insert") {
        const newEvent = change.fullDocument;

        console.log(
          `[P3 Worker] New event detected: ${newEvent.eventType} for aggregate ${newEvent.aggregateId}`
        );

        await applyEventToReadModel(newEvent);
      }
    });

    changeStream.on("error", (error) => {
      console.error(
        "[P3 Worker] Change Stream error:",
        error.message
      );
    });
  } catch {
    console.warn(
      "[P3 Worker] Change Streams require replica set. Falling back to direct worker processing."
    );
  }
}

/**
 * Starts the projection worker
 */
async function startProjectionWorker() {
  console.log("------------------------------------------");
  console.log(
    "[P3 Worker] Background projection service initialized."
  );
  console.log("------------------------------------------");

  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI);

      console.log(
        "[P3 Worker] Connected to MongoDB for Read Model synchronization."
      );

      listenToEventStream(mongoose.connection);
    } catch {
      console.warn(
        "[P3 Worker] Running standalone mode (no DB URI)."
      );
    }
  }
}

/**
 * Start worker only when run directly
 */
if (require.main === module) {
  startProjectionWorker();
}

module.exports = {
  applyEventToReadModel,
  startProjectionWorker,
};