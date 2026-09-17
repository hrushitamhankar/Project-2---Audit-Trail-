const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const queryRouter = require("../src/routes/queryRouter");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

describe("Time Travel API Validation", () => {
  const shipmentId = "TT-TEST-100";
  const baseTime = new Date("2026-03-01T10:00:00.000Z").getTime();

  const allEvents = [
    {
      aggregateId: shipmentId,
      eventType: "SHIPMENT_CREATED",
      payload: { origin: "Kolkata Hub", location: "Kolkata Hub" },
      version: 1,
      timestamp: new Date(baseTime),
    },
    {
      aggregateId: shipmentId,
      eventType: "SHIPMENT_MOVED",
      payload: { currentLocation: "Asansol Transit", location: "Asansol Transit" },
      version: 2,
      timestamp: new Date(baseTime + 3600000),
    },
    {
      aggregateId: shipmentId,
      eventType: "SHIPMENT_DELIVERED",
      payload: { destination: "Durgapur Depot", location: "Durgapur Depot" },
      version: 3,
      timestamp: new Date(baseTime + 7200000),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should return CREATED state before shipment is moved", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([allEvents[0]]),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date(baseTime + 1800000).toISOString();
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=${at}`);

    expect(res.status).toBe(200);
    expect(res.body.data.state.currentStatus).toBe("CREATED");

    mongoose.model.mockRestore();
  });

  test("should return IN_TRANSIT state after movement", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([allEvents[0], allEvents[1]]),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date(baseTime + 5400000).toISOString();
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=${at}`);

    expect(res.status).toBe(200);
    expect(res.body.data.state.currentStatus).toBe("IN_TRANSIT");

    mongoose.model.mockRestore();
  });

  test("should return DELIVERED state after delivery", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(allEvents),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date(baseTime + 9000000).toISOString();
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=${at}`);

    expect(res.status).toBe(200);
    expect(res.body.data.state.currentStatus).toBe("DELIVERED");

    mongoose.model.mockRestore();
  });

  test("should return latest state when queried after all events", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(allEvents),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date(baseTime + 9999999).toISOString();
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=${at}`);

    expect(res.status).toBe(200);
    expect(res.body.data.state.version).toBe(3);

    mongoose.model.mockRestore();
  });

  test("should apply the correct number of historical events", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([allEvents[0], allEvents[1]]),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date(baseTime + 5400000).toISOString();
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=${at}`);

    expect(res.body.data.eventsApplied).toBe(2);

    mongoose.model.mockRestore();
  });

  test("should identify event replay as the source", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([allEvents[0]]),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date(baseTime + 1800000).toISOString();
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=${at}`);

    expect(res.body.data.source).toBe("EVENT_REPLAY");

    mongoose.model.mockRestore();
  });
});