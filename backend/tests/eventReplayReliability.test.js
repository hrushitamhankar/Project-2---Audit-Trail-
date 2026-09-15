const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../src/server");
const AuditEvent = require("../src/models/AuditEvent");

jest.setTimeout(30000);

describe("Event Replay Reliability", () => {
  const shipmentId = `REPLAY-${Date.now()}`;

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
        timestamp: new Date("2026-03-01T10:00:00.000Z"),
        version: 1,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_MOVED",
        payload: {
          location: "Jaipur Hub",
        },
        timestamp: new Date("2026-03-02T10:00:00.000Z"),
        version: 2,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_MOVED",
        payload: {
          location: "Mumbai Port",
        },
        timestamp: new Date("2026-03-03T10:00:00.000Z"),
        version: 3,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_DELIVERED",
        payload: {
          location: "Mumbai Customer",
        },
        timestamp: new Date("2026-03-04T10:00:00.000Z"),
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

  test("should replay events in version order", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-03-04T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.eventsApplied).toBe(4);
    expect(response.body.data.state.version).toBe(4);
  });

  test("should produce the correct final state after complete replay", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-03-04T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe(
      "DELIVERED"
    );
    expect(response.body.data.state.location).toBe(
      "Mumbai Customer"
    );
  });

  test("should reconstruct the intermediate state correctly", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-03-03T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.eventsApplied).toBe(3);
    expect(response.body.data.state.currentStatus).toBe(
      "IN_TRANSIT"
    );
    expect(response.body.data.state.location).toBe(
      "Mumbai Port"
    );
    expect(response.body.data.state.version).toBe(3);
  });

  test("should return the same state when history is replayed again", async () => {
    const firstResponse = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-03-04T12:00:00.000Z`
    );

    const secondResponse = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-03-04T12:00:00.000Z`
    );

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(200);

    expect(secondResponse.body.data.state).toEqual(
      firstResponse.body.data.state
    );
  });

  test("should preserve the latest movement location before delivery", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-03-03T23:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe(
      "IN_TRANSIT"
    );
    expect(response.body.data.state.location).toBe(
      "Mumbai Port"
    );
  });
});