const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

const queryRouter = require("../src/routes/queryRouter");

const app = express();

app.use(express.json());
app.use("/", queryRouter);

// Mock AuditEvent database model
const mockEvents = [];

const mockAuditEvent = {
  find: jest.fn(),
};

mongoose.models.AuditEvent = mockAuditEvent;

describe("Historical Shipment State API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvents.length = 0;
  });

  test("should reject request when timestamp is missing", async () => {
    const response = await request(app)
      .get("/shipment/TEST-SHIP-13/state");

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Query parameter 'at' is required."
    );
  });

  test("should reject an invalid timestamp", async () => {
    const response = await request(app)
      .get(
        "/shipment/TEST-SHIP-13/state?at=invalid-date"
      );

    expect(response.statusCode).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Invalid timestamp provided."
    );
  });

  test("should return 404 when no historical events exist", async () => {
    mockAuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });

    const response = await request(app)
      .get(
        "/shipment/TEST-SHIP-13/state?at=2026-08-20T10:00:00Z"
      );

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test("should rebuild shipment state after creation", async () => {
    mockAuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            aggregateId: "TEST-SHIP-13",
            eventType: "SHIPMENT_CREATED",
            payload: {
              origin: "Delhi Warehouse",
            },
            version: 1,
            timestamp: new Date(
              "2026-08-20T08:00:00Z"
            ),
          },
        ]),
      }),
    });

    const response = await request(app)
      .get(
        "/shipment/TEST-SHIP-13/state?at=2026-08-20T09:00:00Z"
      );

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.state.currentStatus).toBe(
      "CREATED"
    );
    expect(response.body.data.state.location).toBe(
      "Delhi Warehouse"
    );
    expect(response.body.data.eventsApplied).toBe(1);
  });

  test("should rebuild state after shipment movement", async () => {
    mockAuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            aggregateId: "TEST-SHIP-13",
            eventType: "SHIPMENT_CREATED",
            payload: {
              origin: "Delhi Warehouse",
            },
            version: 1,
            timestamp: new Date(
              "2026-08-20T08:00:00Z"
            ),
          },
          {
            aggregateId: "TEST-SHIP-13",
            eventType: "SHIPMENT_MOVED",
            payload: {
              currentLocation: "Mumbai Port",
            },
            version: 2,
            timestamp: new Date(
              "2026-08-20T12:00:00Z"
            ),
          },
        ]),
      }),
    });

    const response = await request(app)
      .get(
        "/shipment/TEST-SHIP-13/state?at=2026-08-20T13:00:00Z"
      );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe(
      "IN_TRANSIT"
    );
    expect(response.body.data.state.location).toBe(
      "Mumbai Port"
    );
    expect(response.body.data.state.version).toBe(2);
    expect(response.body.data.eventsApplied).toBe(2);
  });

  test("should return the state before a later event", async () => {
    mockAuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            aggregateId: "TEST-SHIP-13",
            eventType: "SHIPMENT_CREATED",
            payload: {
              origin: "Delhi Warehouse",
            },
            version: 1,
            timestamp: new Date(
              "2026-08-20T08:00:00Z"
            ),
          },
        ]),
      }),
    });

    const response = await request(app)
      .get(
        "/shipment/TEST-SHIP-13/state?at=2026-08-20T10:00:00Z"
      );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe(
      "CREATED"
    );
    expect(response.body.data.state.location).toBe(
      "Delhi Warehouse"
    );
    expect(response.body.data.eventsApplied).toBe(1);
  });

  test("should mark shipment as ALERT for critical temperature", async () => {
    mockAuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            aggregateId: "TEST-SHIP-13",
            eventType: "SHIPMENT_CREATED",
            payload: {
              origin: "Delhi Warehouse",
            },
            version: 1,
            timestamp: new Date(
              "2026-08-20T08:00:00Z"
            ),
          },
          {
            aggregateId: "TEST-SHIP-13",
            eventType: "TEMPERATURE_SPIKE",
            payload: {
              temperature: 9.5,
            },
            version: 2,
            timestamp: new Date(
              "2026-08-20T14:00:00Z"
            ),
          },
        ]),
      }),
    });

    const response = await request(app)
      .get(
        "/shipment/TEST-SHIP-13/state?at=2026-08-20T15:00:00Z"
      );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe(
      "ALERT"
    );
    expect(response.body.data.state.temperature).toBe(9.5);
    expect(response.body.data.state.version).toBe(2);
  });

  test("should mark shipment as delivered", async () => {
    mockAuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            aggregateId: "TEST-SHIP-13",
            eventType: "SHIPMENT_CREATED",
            payload: {
              origin: "Delhi Warehouse",
            },
            version: 1,
            timestamp: new Date(
              "2026-08-20T08:00:00Z"
            ),
          },
          {
            aggregateId: "TEST-SHIP-13",
            eventType: "SHIPMENT_MOVED",
            payload: {
              currentLocation: "Mumbai Port",
            },
            version: 2,
            timestamp: new Date(
              "2026-08-20T12:00:00Z"
            ),
          },
          {
            aggregateId: "TEST-SHIP-13",
            eventType: "SHIPMENT_DELIVERED",
            payload: {
              destination: "Mumbai Customer",
            },
            version: 3,
            timestamp: new Date(
              "2026-08-20T18:00:00Z"
            ),
          },
        ]),
      }),
    });

    const response = await request(app)
      .get(
        "/shipment/TEST-SHIP-13/state?at=2026-08-20T19:00:00Z"
      );

    expect(response.statusCode).toBe(200);
    expect(response.body.data.state.currentStatus).toBe(
      "DELIVERED"
    );
    expect(response.body.data.state.location).toBe(
      "Mumbai Customer"
    );
    expect(response.body.data.state.version).toBe(3);
    expect(response.body.data.eventsApplied).toBe(3);
  });
});