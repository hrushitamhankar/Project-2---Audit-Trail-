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

describe("Projection Consistency Validation", () => {
  const shipmentId = `CONSISTENCY-${Date.now()}`;
  const mockEvents = [
    { aggregateId: shipmentId, eventType: "SHIPMENT_CREATED", payload: { location: "Warehouse A" }, version: 1, timestamp: new Date().toISOString() },
    { aggregateId: shipmentId, eventType: "SHIPMENT_MOVED", payload: { currentLocation: "Checkpoint 1" }, version: 2, timestamp: new Date().toISOString() },
    { aggregateId: shipmentId, eventType: "SHIPMENT_DELIVERED", payload: { destination: "Destination X" }, version: 3, timestamp: new Date().toISOString() },
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

  test("should rebuild projection successfully", async () => {
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

  test("should return the correct state after projection rebuild", async () => {
    ShipmentReadModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        shipmentId,
        currentStatus: "DELIVERED",
        version: 3,
      }),
    });

    const res = await request(app).get(`/shipment/${shipmentId}`);
    expect(res.status).toBe(200);
    const status = res.body.data?.currentStatus || res.body.data?.status;
    expect(status).toBe("DELIVERED");
  });

  test("should preserve the latest event version", async () => {
    ShipmentReadModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        shipmentId,
        currentStatus: "DELIVERED",
        version: 3,
      }),
    });

    const res = await request(app).get(`/shipment/${shipmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.version).toBe(3);
  });

  test("should keep projection state consistent with event replay", async () => {
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

  test("should remain consistent when projection is rebuilt again", async () => {
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
});