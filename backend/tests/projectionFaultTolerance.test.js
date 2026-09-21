const express = require("express");
const request = require("supertest");
const queryRouter = require("../src/routes/queryRouter");
const ShipmentReadModel = require("../src/models/readModel");
const cacheService = require("../src/services/cacheService");
const { applyEventToReadModel, applyBatchEvents, validateEventEnvelope } = require("../src/workers/projectionWorker");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

describe("Projection Engine Fault Tolerance & Envelope Validation (P3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.clear();
  });

  test("validateEventEnvelope rejects malformed event objects", () => {
    expect(validateEventEnvelope(null)).toBe(false);
    expect(validateEventEnvelope({})).toBe(false);
    expect(validateEventEnvelope({ aggregateId: 123, eventType: "MOVED", version: 1 })).toBe(false);
    expect(validateEventEnvelope({ aggregateId: "SHP-1", version: 1 })).toBe(false);
    expect(validateEventEnvelope({ aggregateId: "SHP-1", eventType: "MOVED", version: 0 })).toBe(false);
    expect(validateEventEnvelope({ aggregateId: "SHP-1", eventType: "MOVED", version: -2 })).toBe(false);
  });

  test("applyEventToReadModel gracefully returns false and quarantines corrupted payloads", async () => {
    const corruptedEvent = {
      aggregateId: "SHP-CORRUPT-01",
      eventType: "SHIPMENT_MOVED",
      // missing version property
    };

    const result = await applyEventToReadModel(corruptedEvent);

    expect(result).toBe(false);
    expect(ShipmentReadModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test("applyBatchEvents processes valid events while ignoring corrupted items in stream", async () => {
    const mixedBatch = [
      { aggregateId: "SHP-BATCH-1", eventType: "SHIPMENT_CREATED", payload: { origin: "Hub 1" }, version: 1 },
      { aggregateId: "SHP-BATCH-1" }, // Malformed
      { aggregateId: "SHP-BATCH-1", eventType: "SHIPMENT_MOVED", payload: { currentLocation: "Hub 2" }, version: 2 },
      null, // Corrupted entry
    ];

    ShipmentReadModel.findOne.mockResolvedValue(null);
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({ shipmentId: "SHP-BATCH-1", version: 2 });

    const processedCount = await applyBatchEvents(mixedBatch);

    expect(processedCount).toBe(2);
    expect(ShipmentReadModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  test("projection worker absorbs database write errors without unhandled rejection", async () => {
    ShipmentReadModel.findOne.mockResolvedValue(null);
    ShipmentReadModel.findOneAndUpdate.mockRejectedValue(new Error("Transient Mongo Network Blip"));

    const validEvent = {
      aggregateId: "SHP-FAIL-01",
      eventType: "SHIPMENT_CREATED",
      payload: { origin: "Delhi Hub" },
      version: 1,
      timestamp: new Date().toISOString(),
    };

    const result = await applyEventToReadModel(validEvent);

    expect(result).toBe(false);
    expect(cacheService.get("SHP-FAIL-01")).toBeNull();
  });
});