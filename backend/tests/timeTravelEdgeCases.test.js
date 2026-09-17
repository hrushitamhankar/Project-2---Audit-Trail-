const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const queryRouter = require("../src/routes/queryRouter");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

describe("Time Travel Edge Case Validation", () => {
  const shipmentId = "EDGE-TEST-001";
  const baseTime = new Date("2026-03-01T15:00:00.000Z").getTime();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should reject request when at parameter is missing", async () => {
    const res = await request(app).get(`/shipment/${shipmentId}/state`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Query parameter 'at' is required");
  });

  test("should reject invalid timestamp", async () => {
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=not-a-date`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("Invalid timestamp provided");
  });

  test("should return 404 for shipment with no historical events", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date().toISOString();
    const res = await request(app).get(`/shipment/GHOST-SHIPMENT/state?at=${at}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("No historical events found");

    mongoose.model.mockRestore();
  });

  test("should return 404 when timestamp is before first event", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date(baseTime - 5000).toISOString();
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=${at}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);

    mongoose.model.mockRestore();
  });

  test("should not apply events that occur after requested timestamp", async () => {
    const sampleEvents = [
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_CREATED",
        payload: { location: "Facility Alpha", origin: "Facility Alpha" },
        version: 1,
        timestamp: new Date(baseTime),
      },
    ];

    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(sampleEvents),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const at = new Date(baseTime + 5000).toISOString();
    const res = await request(app).get(`/shipment/${shipmentId}/state?at=${at}`);

    expect(res.status).toBe(200);
    expect(res.body.data.eventsApplied).toBe(1);
    expect(res.body.data.state.currentStatus).toBe("CREATED");
    expect(res.body.data.state.location).toBe("Facility Alpha");

    mongoose.model.mockRestore();
  });
});