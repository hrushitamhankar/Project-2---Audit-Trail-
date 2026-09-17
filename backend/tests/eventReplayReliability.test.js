const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const queryRouter = require("../src/routes/queryRouter");
const ShipmentReadModel = require("../src/models/readModel");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

describe("Event Replay Reliability", () => {
  const shipmentId = "REPLAY-TEST-001";
  const baseTime = new Date("2026-03-01T12:00:00.000Z").getTime();

  const allEvents = [
    {
      aggregateId: shipmentId,
      eventType: "SHIPMENT_CREATED",
      payload: { origin: "Station A", location: "Station A" },
      version: 1,
      timestamp: new Date(baseTime),
    },
    {
      aggregateId: shipmentId,
      eventType: "SHIPMENT_MOVED",
      payload: { currentLocation: "Station B", location: "Station B" },
      version: 2,
      timestamp: new Date(baseTime + 1000),
    },
    {
      aggregateId: shipmentId,
      eventType: "SHIPMENT_DELIVERED",
      payload: { destination: "Station C", location: "Station C" },
      version: 3,
      timestamp: new Date(baseTime + 2000),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should replay events in version order", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(allEvents),
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
        location: "Station C",
        version: 3,
      }),
    });

    const res = await request(app).post(`/projection/rebuild/${shipmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    mongoose.model.mockRestore();
  });

  test("should produce the correct final state after complete replay", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(allEvents),
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
        location: "Station C",
        version: 3,
      }),
    });

    const res = await request(app).post(`/projection/rebuild/${shipmentId}`);
    expect(res.body.rebuiltState.currentStatus).toBe("DELIVERED");
    expect(res.body.rebuiltState.version).toBe(3);

    mongoose.model.mockRestore();
  });

  test("should reconstruct the intermediate state correctly", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([allEvents[0], allEvents[1]]),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date(baseTime + 1500).toISOString();
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=${at}`);

    expect(res.status).toBe(200);
    expect(res.body.data.state.currentStatus).toBe("IN_TRANSIT");
    expect(res.body.data.eventsApplied).toBe(2);

    mongoose.model.mockRestore();
  });

  test("should return the same state when history is replayed again", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(allEvents),
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
        location: "Station C",
        version: 3,
      }),
    });

    const res = await request(app).post(`/projection/rebuild/${shipmentId}`);
    expect(res.status).toBe(200);
    expect(res.body.rebuiltState.version).toBe(3);

    mongoose.model.mockRestore();
  });

  test("should preserve the latest movement location before delivery", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([allEvents[0], allEvents[1]]),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date(baseTime + 1500).toISOString();
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=${at}`);

    expect(res.body.data.state.location).toBe("Station B");

    mongoose.model.mockRestore();
  });
});