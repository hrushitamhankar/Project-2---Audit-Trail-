const request = require("supertest");
const mongoose = require("mongoose");

const app = require("../src/server");
const AuditEvent = require("../src/models/AuditEvent");

jest.setTimeout(30000);

describe("Projection Consistency Validation", () => {
  const shipmentId = `CONSISTENCY-${Date.now()}`;

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
        timestamp: new Date("2026-04-01T10:00:00.000Z"),
        version: 1,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_MOVED",
        payload: {
          location: "Jaipur Hub",
        },
        timestamp: new Date("2026-04-02T10:00:00.000Z"),
        version: 2,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_MOVED",
        payload: {
          location: "Mumbai Port",
        },
        timestamp: new Date("2026-04-03T10:00:00.000Z"),
        version: 3,
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_DELIVERED",
        payload: {
          location: "Mumbai Customer",
        },
        timestamp: new Date("2026-04-04T10:00:00.000Z"),
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

  test("should rebuild projection successfully", async () => {
    const response = await request(app).post(
      `/projection/rebuild/${shipmentId}`
    );

    expect([200, 201]).toContain(response.statusCode);
  });

  test("should return the correct state after projection rebuild", async () => {
    await request(app).post(`/projection/rebuild/${shipmentId}`);

    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-04-04T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe("DELIVERED");
    expect(response.body.data.state.location).toBe("Mumbai Customer");
  });

  test("should preserve the latest event version", async () => {
    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-04-04T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.version).toBe(4);
  });

  test("should keep projection state consistent with event replay", async () => {
    await request(app).post(`/projection/rebuild/${shipmentId}`);

    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-04-04T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);

    const state = response.body.data.state;

    expect(state.currentStatus).toBe("DELIVERED");
    expect(state.location).toBe("Mumbai Customer");
    expect(state.version).toBe(4);
  });

  test("should remain consistent when projection is rebuilt again", async () => {
    await request(app).post(`/projection/rebuild/${shipmentId}`);
    await request(app).post(`/projection/rebuild/${shipmentId}`);

    const response = await request(app).get(
      `/shipment/${shipmentId}/state?at=2026-04-04T12:00:00.000Z`
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe("DELIVERED");
    expect(response.body.data.state.location).toBe("Mumbai Customer");
    expect(response.body.data.state.version).toBe(4);
  });
});