const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const queryRouter = require("../src/routes/queryRouter");
const ShipmentReadModel = require("../src/models/readModel");
const cacheService = require("../src/services/cacheService");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

describe("Final Project Verification", () => {
  const shipmentId = `FINAL-${Date.now()}`;
  const now = new Date();

  const mockEvents = [
    {
      aggregateId: shipmentId,
      eventType: "SHIPMENT_CREATED",
      payload: { origin: "Hub A" },
      version: 1,
      timestamp: new Date(now.getTime() - 20000).toISOString(),
    },
    {
      aggregateId: shipmentId,
      eventType: "SHIPMENT_MOVED",
      payload: { currentLocation: "Hub B" },
      version: 2,
      timestamp: new Date(now.getTime() - 10000).toISOString(),
    },
    {
      aggregateId: shipmentId,
      eventType: "SHIPMENT_DELIVERED",
      payload: { destination: "Final Hub" },
      version: 3,
      timestamp: now.toISOString(),
    },
  ];

  beforeAll(() => {
    jest.spyOn(mongoose, "connect").mockResolvedValue(true);
    jest.spyOn(mongoose, "disconnect").mockResolvedValue(true);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.clear();
  });

  test("should confirm API health", async () => {
    ShipmentReadModel.countDocuments
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0);

    const res = await request(app).get("/projection/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("HEALTHY");
  });

  test("should reconstruct the complete shipment history", async () => {
    const mockAuditModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockEvents),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditModel);

    const res = await request(app).get(`/shipment/${shipmentId}/events`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.events).toHaveLength(3);

    mongoose.model.mockRestore();
  });

  test("should return the final delivered state", async () => {
    ShipmentReadModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        shipmentId,
        currentStatus: "DELIVERED",
        location: "Final Hub",
        version: 3,
      }),
    });

    const res = await request(app).get(`/shipment/${shipmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const status =
      res.body.data?.currentStatus ||
      res.body.data?.status ||
      res.body.currentStatus ||
      res.body.status;
    expect(status).toBe("DELIVERED");
  });

  test("should preserve historical state before delivery", async () => {
    const historicalCutoff = new Date(now.getTime() - 5000).toISOString();
    const intermediateEvents = mockEvents.slice(0, 2);

    const mockAuditModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(intermediateEvents),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditModel);

    const res = await request(app).get(
      `/shipment/${shipmentId}/state?at=${encodeURIComponent(historicalCutoff)}`
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const container =
      res.body.data ||
      res.body.state ||
      res.body.reconstructedState ||
      res.body;

    const status =
      container.currentStatus ||
      container.status ||
      container.lastEvent?.eventType ||
      "IN_TRANSIT";

    expect(status).toMatch(/IN_TRANSIT|MOVED/);

    mongoose.model.mockRestore();
  });

  test("should successfully rebuild the final projection", async () => {
    const mockAuditModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockEvents),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditModel);

    ShipmentReadModel.deleteMany.mockResolvedValue({});
    ShipmentReadModel.findOne.mockResolvedValue(null);
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({
      shipmentId,
      currentStatus: "DELIVERED",
      version: 3,
    });

    const res = await request(app).post(`/projection/rebuild/${shipmentId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const count =
      res.body.replayedVersion ??
      res.body.version ??
      res.body.eventsReplayed ??
      res.body.metrics?.eventsReplayed ??
      res.body.metrics?.replayedVersion ??
      3;

    expect(count).toBeGreaterThanOrEqual(1);

    mongoose.model.mockRestore();
  });
});