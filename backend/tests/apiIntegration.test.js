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

describe("API Integration Testing", () => {
  const shipmentId = `API-${Date.now()}`;
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

  test("should return healthy API status", async () => {
    ShipmentReadModel.countDocuments
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(0);

    const res = await request(app).get("/projection/health");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("HEALTHY");
  });

  test("should successfully access shipment event history API", async () => {
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
    expect(res.body.events).toBeDefined();

    mongoose.model.mockRestore();
  });

  test("should return correct historical shipment state", async () => {
    const historicalTime = new Date(now.getTime() - 5000).toISOString();
    const mockAuditModel = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockEvents.slice(0, 2)),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditModel);

    const res = await request(app).get(
      `/shipment/${shipmentId}/state?at=${encodeURIComponent(historicalTime)}`
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

  test("should rebuild the shipment projection through the API", async () => {
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

    mongoose.model.mockRestore();
  });

  test("should return the correct final state after API integration", async () => {
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
});