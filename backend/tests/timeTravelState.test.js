const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

jest.mock("../src/models/readModel");

const ShipmentReadModel = require("../src/models/readModel");

const app = express();

app.use(express.json());

const queryRouter = require("../src/routes/queryRouter");

app.use("/", queryRouter);

describe("Time Travel Historical Shipment State", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mongoose.models.AuditEvent = {
      find: jest.fn(),
    };
  });

  test("should return 400 when timestamp is missing", async () => {
    const response = await request(app)
      .get("/shipment/SHP-TT-01/state");

    expect(response.status).toBe(400);

    expect(response.body.success).toBe(false);

    expect(response.body.message).toBe(
      "Query parameter 'at' is required."
    );
  });

  test("should return 400 when timestamp is invalid", async () => {
    const response = await request(app)
      .get("/shipment/SHP-TT-01/state")
      .query({
        at: "invalid-date",
      });

    expect(response.status).toBe(400);

    expect(response.body.success).toBe(false);

    expect(response.body.message).toBe(
      "Invalid timestamp provided."
    );
  });

  test("should return 404 when no historical events exist", async () => {
    mongoose.models.AuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });

    const response = await request(app)
      .get("/shipment/SHP-TT-01/state")
      .query({
        at: "2026-01-01T12:00:00.000Z",
      });

    expect(response.status).toBe(404);

    expect(response.body.success).toBe(false);

    expect(response.body.message).toContain(
      "No historical events found"
    );
  });

  test("should rebuild CREATED state at historical timestamp", async () => {
    const events = [
      {
        aggregateId: "SHP-TT-01",
        eventType: "SHIPMENT_CREATED",
        payload: {
          origin: "Delhi Facility",
        },
        version: 1,
        timestamp: new Date("2026-01-01T10:00:00.000Z"),
      },
    ];

    mongoose.models.AuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(events),
      }),
    });

    const response = await request(app)
      .get("/shipment/SHP-TT-01/state")
      .query({
        at: "2026-01-01T12:00:00.000Z",
      });

    expect(response.status).toBe(200);

    expect(response.body.success).toBe(true);

    expect(response.body.data.shipmentId).toBe(
      "SHP-TT-01"
    );

    expect(response.body.data.source).toBe(
      "EVENT_REPLAY"
    );

    expect(response.body.data.state.currentStatus).toBe(
      "CREATED"
    );

    expect(response.body.data.state.location).toBe(
      "Delhi Facility"
    );

    expect(response.body.data.eventsApplied).toBe(1);
  });

  test("should rebuild shipment state after movement", async () => {
    const events = [
      {
        aggregateId: "SHP-TT-02",
        eventType: "SHIPMENT_CREATED",
        payload: {
          origin: "Delhi Facility",
        },
        version: 1,
        timestamp: new Date("2026-01-01T10:00:00.000Z"),
      },
      {
        aggregateId: "SHP-TT-02",
        eventType: "SHIPMENT_MOVED",
        payload: {
          location: "Mumbai Port",
        },
        version: 2,
        timestamp: new Date("2026-01-01T11:00:00.000Z"),
      },
    ];

    mongoose.models.AuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(events),
      }),
    });

    const response = await request(app)
      .get("/shipment/SHP-TT-02/state")
      .query({
        at: "2026-01-01T12:00:00.000Z",
      });

    expect(response.status).toBe(200);

    expect(response.body.data.state.currentStatus).toBe(
      "IN_TRANSIT"
    );

    expect(response.body.data.state.location).toBe(
      "Mumbai Port"
    );

    expect(response.body.data.state.version).toBe(2);

    expect(response.body.data.eventsApplied).toBe(2);
  });

  test("should rebuild DELIVERED state at historical timestamp", async () => {
    const events = [
      {
        aggregateId: "SHP-TT-03",
        eventType: "SHIPMENT_CREATED",
        payload: {
          origin: "Delhi Facility",
        },
        version: 1,
        timestamp: new Date("2026-01-01T10:00:00.000Z"),
      },
      {
        aggregateId: "SHP-TT-03",
        eventType: "SHIPMENT_MOVED",
        payload: {
          location: "Mumbai Port",
        },
        version: 2,
        timestamp: new Date("2026-01-01T11:00:00.000Z"),
      },
      {
        aggregateId: "SHP-TT-03",
        eventType: "SHIPMENT_DELIVERED",
        payload: {
          destination: "Bangalore Facility",
        },
        version: 3,
        timestamp: new Date("2026-01-01T12:00:00.000Z"),
      },
    ];

    mongoose.models.AuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(events),
      }),
    });

    const response = await request(app)
      .get("/shipment/SHP-TT-03/state")
      .query({
        at: "2026-01-01T13:00:00.000Z",
      });

    expect(response.status).toBe(200);

    expect(response.body.data.state.currentStatus).toBe(
      "DELIVERED"
    );

    expect(response.body.data.state.location).toBe(
      "Bangalore Facility"
    );

    expect(response.body.data.state.version).toBe(3);

    expect(response.body.data.eventsApplied).toBe(3);
  });

  test("should not modify the current Read Model", async () => {
    const events = [
      {
        aggregateId: "SHP-TT-04",
        eventType: "SHIPMENT_CREATED",
        payload: {
          origin: "Delhi Facility",
        },
        version: 1,
        timestamp: new Date("2026-01-01T10:00:00.000Z"),
      },
    ];

    mongoose.models.AuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(events),
      }),
    });

    await request(app)
      .get("/shipment/SHP-TT-04/state")
      .query({
        at: "2026-01-01T12:00:00.000Z",
      });

    expect(
      ShipmentReadModel.findOne
    ).not.toHaveBeenCalled();

    expect(
      ShipmentReadModel.findOneAndUpdate
    ).not.toHaveBeenCalled();

    expect(
      ShipmentReadModel.updateOne
    ).not.toHaveBeenCalled();

    expect(
      ShipmentReadModel.deleteOne
    ).not.toHaveBeenCalled();
  });
});