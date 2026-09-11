const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const queryRouter = require("../src/routes/queryRouter");
const ShipmentReadModel = require("../src/models/readModel");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

describe("Projection Replay and Disaster Recovery APIs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("POST /projection/rebuild/:id replays single shipment history correctly", async () => {
    const shipmentId = "TEST-SHIP-14";
    const sampleEvents = [
      { aggregateId: shipmentId, eventType: "SHIPMENT_CREATED", payload: { origin: "Hub A" }, version: 1 },
      { aggregateId: shipmentId, eventType: "SHIPMENT_MOVED", payload: { currentLocation: "Hub B" }, version: 2 },
      { aggregateId: shipmentId, eventType: "SHIPMENT_DELIVERED", payload: { destination: "Hub C" }, version: 3 },
    ];

    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(sampleEvents),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    ShipmentReadModel.deleteOne.mockResolvedValue({});
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({});
    ShipmentReadModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        shipmentId,
        currentStatus: "DELIVERED",
        location: "Hub C",
        version: 3,
      }),
    });

    const response = await request(app).post(`/projection/rebuild/${shipmentId}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain("Successfully replayed 3 events");
    expect(response.body.rebuiltState.currentStatus).toBe("DELIVERED");

    mongoose.model.mockRestore();
  });

  test("POST /projection/rebuild-all purges read store and replays all fleet events", async () => {
    const fleetEvents = [
      { aggregateId: "SHP-001", eventType: "SHIPMENT_CREATED", payload: { origin: "DC 1" }, version: 1 },
      { aggregateId: "SHP-002", eventType: "SHIPMENT_CREATED", payload: { origin: "DC 2" }, version: 1 },
    ];

    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(fleetEvents),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    ShipmentReadModel.deleteMany.mockResolvedValue({});
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({});
    ShipmentReadModel.countDocuments.mockResolvedValue(2);

    const response = await request(app).post("/projection/rebuild-all");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(ShipmentReadModel.deleteMany).toHaveBeenCalledWith({});
    expect(response.body.metrics.eventsReplayed).toBe(2);
    expect(response.body.metrics.readModelsGenerated).toBe(2);

    mongoose.model.mockRestore();
  });
});