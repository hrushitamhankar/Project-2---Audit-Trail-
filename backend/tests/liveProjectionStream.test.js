const request = require("supertest");
const express = require("express");
const queryRouter = require("../src/routes/queryRouter");
const sseService = require("../src/services/sseService");
const cacheService = require("../src/services/cacheService");
const ShipmentReadModel = require("../src/models/readModel");
const { applyEventToReadModel } = require("../src/workers/projectionWorker");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

describe("E2E Live Event Ingestion -> Projection -> SSE Stream Cycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.clear();
  });

  test("full live cycle: event applied -> cache populated -> SSE broadcast executed", async () => {
    const broadcastSpy = jest.spyOn(sseService, "broadcastReadModelUpdate");

    const shipmentId = "SHP-STREAM-500";
    const sampleEvent = {
      aggregateId: shipmentId,
      eventType: "TEMPERATURE_SPIKE",
      payload: { temperature: 11.2 },
      version: 4,
      timestamp: new Date().toISOString(),
    };

    const projectedModel = {
      shipmentId,
      currentStatus: "ALERT",
      temperature: 11.2,
      location: "Cold Storage Unit 3",
      version: 4,
      lastUpdated: sampleEvent.timestamp,
    };

    ShipmentReadModel.findOne.mockResolvedValue({
      shipmentId,
      version: 3,
    });
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue(projectedModel);

    const applied = await applyEventToReadModel(sampleEvent);

    expect(applied).toBe(true);
    expect(broadcastSpy).toHaveBeenCalledWith(projectedModel);

    // Fast-path read cache must reflect latest projection
    const cached = cacheService.get(shipmentId);
    expect(cached).not.toBeNull();
    expect(cached.currentStatus).toBe("ALERT");
    expect(cached.temperature).toBe(11.2);

    broadcastSpy.mockRestore();
  });

  test("GET /shipment/:id serves directly from cache updated by live event projection", async () => {
    const shipmentId = "SHP-CACHED-LIVE";
    const freshModel = {
      shipmentId,
      currentStatus: "DELIVERED",
      location: "Final Destination Facility",
      version: 6,
    };

    // Pre-warm cache through projection worker update
    cacheService.set(shipmentId, freshModel);

    const res = await request(app).get(`/shipment/${shipmentId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.source).toBe("CACHE");
    expect(res.body.data.currentStatus).toBe("DELIVERED");
    expect(ShipmentReadModel.findOne).not.toHaveBeenCalled();
  });
});