const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../src/server");
const AuditEvent = require("../src/models/AuditEvent");

jest.setTimeout(30000);

describe("API Integration Testing", () => {
  const shipmentId = `API-${Date.now()}`;

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
        timestamp: new Date("2026-05-01T10:00:00.000Z"),
        version: 1,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_MOVED",
        payload: {
          location: "Jaipur Hub",
        },
        timestamp: new Date("2026-05-02T10:00:00.000Z"),
        version: 2,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_MOVED",
        payload: {
          location: "Mumbai Port",
        },
        timestamp: new Date("2026-05-03T10:00:00.000Z"),
        version: 3,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_DELIVERED",
        payload: {
          location: "Mumbai Customer",
        },
        timestamp: new Date("2026-05-04T10:00:00.000Z"),
        version: 4,
      },
    ]);
  });

  afterAll(async () => {
    await AuditEvent.deleteMany({
      aggregateId: shipmentId,
    });

    await mongoose.connection.close();
  });

  test("should return healthy API status", async () => {
    const response = await request(app).get("/health");

    expect(response.statusCode).toBe(200);
    expect(response.body.status).toBe("OK");
  });

  test("should successfully access shipment event history API", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/events`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toBeDefined();
  });

  test("should return correct historical shipment state", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-05-03T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.eventsApplied).toBe(3);
    expect(response.body.data.state.currentStatus).toBe("IN_TRANSIT");
    expect(response.body.data.state.location).toBe("Mumbai Port");
    expect(response.body.data.state.version).toBe(3);
  });

  test("should rebuild the shipment projection through the API", async () => {
    const response = await request(app).post(
      `/projection/rebuild/${shipmentId}`
    );

    expect([200, 201]).toContain(response.statusCode);
  });

  test("should return the correct final state after API integration", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-05-05T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe("DELIVERED");
    expect(response.body.data.state.location).toBe("Mumbai Customer");
    expect(response.body.data.state.version).toBe(4);
  });
});