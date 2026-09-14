const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../src/server");
const AuditEvent = require("../src/models/AuditEvent");

jest.setTimeout(30000);

describe("Time Travel Edge Case Validation", () => {
  const shipmentId = `EDGE-${Date.now()}`;

  beforeAll(async () => {
    await mongoose.connect(process.env.MONGO_URI);

    await AuditEvent.deleteMany({
      aggregateId: shipmentId,
    });

    await AuditEvent.create([
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_CREATED",
        payload: {
          location: "Delhi Facility",
        },
        timestamp: new Date("2026-02-01T10:00:00.000Z"),
        version: 1,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_MOVED",
        payload: {
          location: "Mumbai Port",
        },
        timestamp: new Date("2026-02-02T10:00:00.000Z"),
        version: 2,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_DELIVERED",
        payload: {
          location: "Mumbai Customer",
        },
        timestamp: new Date("2026-02-03T10:00:00.000Z"),
        version: 3,
      },
    ]);
  });

  afterAll(async () => {
    await AuditEvent.deleteMany({
      aggregateId: shipmentId,
    });

    await mongoose.connection.close();
  });

  test("should reject request when at parameter is missing", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state`
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Query parameter 'at' is required."
    );
  });

  test("should reject invalid timestamp", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=invalid-date`
    );

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Invalid timestamp provided."
    );
  });

  test("should return 404 for shipment with no historical events", async () => {
    const response = await request(app).get(
      `/shipment/NON-EXISTENT-SHIPMENT/state?at=2026-02-03T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test("should return 404 when timestamp is before first event", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-01-01T10:00:00.000Z`
    );

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test("should not apply events that occur after requested timestamp", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-02-02T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.eventsApplied).toBe(2);
    expect(response.body.data.state.currentStatus).toBe(
      "IN_TRANSIT"
    );
    expect(response.body.data.state.location).toBe(
      "Mumbai Port"
    );
  });
});