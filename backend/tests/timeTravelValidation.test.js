const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../src/server");
const AuditEvent = require("../src/models/AuditEvent");

jest.setTimeout(30000);

describe("Time Travel API Validation", () => {
  const shipmentId = `TT-${Date.now()}`;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI);

    await AuditEvent.deleteMany({ aggregateId: shipmentId });

    await AuditEvent.create([
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_CREATED",
        payload: {
          location: "Delhi Facility",
        },
        timestamp: new Date("2026-01-01T10:00:00.000Z"),
        version: 1,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_MOVED",
        payload: {
          location: "Mumbai Port",
        },
        timestamp: new Date("2026-01-02T10:00:00.000Z"),
        version: 2,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_DELIVERED",
        payload: {
          location: "Mumbai Customer",
        },
        timestamp: new Date("2026-01-03T10:00:00.000Z"),
        version: 3,
      },
    ]);
  });

  afterAll(async () => {
    await AuditEvent.deleteMany({ aggregateId: shipmentId });
    await mongoose.connection.close();
  });

  test("should return CREATED state before shipment is moved", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-01-01T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe("CREATED");
    expect(response.body.data.state.location).toBe("Delhi Facility");
  });

  test("should return IN_TRANSIT state after movement", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-01-02T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe("IN_TRANSIT");
    expect(response.body.data.state.location).toBe("Mumbai Port");
  });

  test("should return DELIVERED state after delivery", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-01-03T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe("DELIVERED");
    expect(response.body.data.state.location).toBe("Mumbai Customer");
  });

  test("should return latest state when queried after all events", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-01-05T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe("DELIVERED");
    expect(response.body.data.state.location).toBe("Mumbai Customer");
  });

  test("should apply the correct number of historical events", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-01-02T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.eventsApplied).toBe(2);
  });

  test("should identify event replay as the source", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-01-02T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.source).toBe("EVENT_REPLAY");
  });
});