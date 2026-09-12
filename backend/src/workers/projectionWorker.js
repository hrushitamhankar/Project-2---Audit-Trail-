require("dotenv").config();

const mongoose = require("mongoose");
const ShipmentReadModel = require("../models/readModel");
const cacheService = require("../services/cacheService");

/**
 * Validates domain event structural integrity
 */
function validateEventEnvelope(event) {
  if (!event || typeof event !== "object") return false;
  if (!event.aggregateId || typeof event.aggregateId !== "string") return false;
  if (!event.eventType || typeof event.eventType !== "string") return false;
  if (typeof event.version !== "number" || event.version < 1) return false;

  return true;
}

/**
 * Event Projection Engine (P3 Ownership)
 * Applies domain events to maintain the materialized Read Model.
 */
async function applyEventToReadModel(event) {
  if (!validateEventEnvelope(event)) {
    console.error(
      "[P3 Worker] Quarantined malformed event:",
      JSON.stringify(event)
    );
    return false;
  }

  const {
    aggregateId,
    eventType,
    payload,
    version,
    timestamp,
  } = event;

  try {
    // Version Guard:
    // Prevent duplicate or stale events from changing the Read Model.
    const existing = await ShipmentReadModel.findOne({
      shipmentId: aggregateId,
    });

    if (
      existing &&
      existing.version >= version &&
      eventType !== "SHIPMENT_CREATED"
    ) {
      console.warn(
        `[P3 Worker] Skipping duplicate/stale version ${version} for ${aggregateId} (current: ${existing.version})`
      );
      return false;
    }

    let updatedDoc = null;

    switch (eventType) {
      case "SHIPMENT_CREATED":
        updatedDoc = await ShipmentReadModel.findOneAndUpdate(
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
        updatedDoc = await ShipmentReadModel.findOneAndUpdate(
          { shipmentId: aggregateId },
          {
            location:
              payload?.currentLocation ||
              payload?.location ||
              payload?.destination ||
              "In Transit",
            currentStatus: "IN_TRANSIT",
            version,
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
        updatedDoc = await ShipmentReadModel.findOneAndUpdate(
          { shipmentId: aggregateId },
          {
            currentStatus: "DELIVERED",
            location:
              payload?.destination ||
              payload?.location ||
              "Destination Facility",
            version,
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

        updatedDoc = await ShipmentReadModel.findOneAndUpdate(
          { shipmentId: aggregateId },
          {
            temperature: payload?.temperature,
            currentStatus: isCritical ? "ALERT" : "IN_TRANSIT",
            version,
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
        return false;
    }

    if (updatedDoc) {
      cacheService.set(aggregateId, updatedDoc);
    } else {
      cacheService.invalidate(aggregateId);
    }

    return true;
  } catch (error) {
    console.error(
      `[P3 Worker] Error projecting event for ${aggregateId}:`,
      error.message
    );
    return false;
  }
}

/**
 * Applies multiple events in version order.
 */
async function applyBatchEvents(events) {
  if (!Array.isArray(events)) return 0;

  const validEvents = events.filter(validateEventEnvelope);

  const sortedEvents = [...validEvents].sort(
    (a, b) => a.version - b.version
  );

  let processedCount = 0;

  for (const evt of sortedEvents) {
    const success = await applyEventToReadModel(evt);

    if (success) {
      processedCount++;
    }
  }

  return processedCount;
}

/**
 * Listens for new events in MongoDB.
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

    changeStream.on("error", (err) => {
      console.error(
        "[P3 Worker] Change Stream error:",
        err.message
      );
    });
  } catch {
    console.warn(
      "[P3 Worker] Change Streams require replica set. Falling back to direct worker processing."
    );
  }
}

/**
 * Starts the projection worker.
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
 * Start worker when this file is executed directly.
 */
if (require.main === module) {
  startProjectionWorker();
}

module.exports = {
  applyEventToReadModel,
  applyBatchEvents,
  validateEventEnvelope,
  startProjectionWorker,
};