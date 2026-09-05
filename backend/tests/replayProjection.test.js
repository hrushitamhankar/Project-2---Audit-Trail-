const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

const queryRouter = require("../src/routes/queryRouter");
const ShipmentReadModel = require("../src/models/readModel");

const app = express();

app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

const mockEvents = [];

const mockAuditEvent = {
  find: jest.fn(),
};

mongoose.models.AuditEvent = mockAuditEvent;

describe("Projection Replay API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEvents.length = 0;
  });

  test("should return 404 when no events exist", async () => {
    mockAuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });

    const response = await request(app).post(
      "/projection/rebuild/TEST-SHIP-14"
    );

    expect(response.statusCode).toBe(404);
    expect(response.body.success).toBe(false);
  });

  test("should replay shipment creation event", async () => {
    mockAuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            aggregateId: "TEST-SHIP-14",
            eventType: "SHIPMENT_CREATED",
            payload: {
              origin: "Delhi Warehouse",
            },
            version: 1,
            timestamp: new Date(
              "2026-08-21T08:00:00Z"
            ),
          },
        ]),
      }),
    });

    ShipmentReadModel.deleteOne.mockResolvedValue({});

    ShipmentReadModel.findOne.mockResolvedValue({
      shipmentId: "TEST-SHIP-14",
      currentStatus: "CREATED",
      location: "Delhi Warehouse",
      version: 1,
    });

    const response = await request(app).post(
      "/projection/rebuild/TEST-SHIP-14"
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.message).toContain(
      "Successfully replayed 1 events"
    );
  });

  test("should replay complete shipment lifecycle", async () => {
    mockAuditEvent.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            aggregateId: "TEST-SHIP-14",
            eventType: "SHIPMENT_CREATED",
            payload: {
              origin: "Delhi Warehouse",
            },
            version: 1,
            timestamp: new Date(
              "2026-08-21T08:00:00Z"
            ),
          },
          {
            aggregateId: "TEST-SHIP-14",
            eventType: "SHIPMENT_MOVED",
            payload: {
              currentLocation: "Mumbai Port",
            },
            version: 2,
            timestamp: new Date(
              "2026-08-21T12:00:00Z"
            ),
          },
          {
            aggregateId: "TEST-SHIP-14",
            eventType: "SHIPMENT_DELIVERED",
            payload: {
              destination: "Mumbai Customer",
            },
            version: 3,
            timestamp: new Date(
              "2026-08-21T18:00:00Z"
            ),
          },
        ]),
      }),
    });

    ShipmentReadModel.deleteOne.mockResolvedValue({});

    ShipmentReadModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        shipmentId: "TEST-SHIP-14",
        currentStatus: "CREATED",
        location: "Delhi Warehouse",
        version: 1,
      })
      .mockResolvedValueOnce({
        shipmentId: "TEST-SHIP-14",
        currentStatus: "IN_TRANSIT",
        location: "Mumbai Port",
        version: 2,
      })
      .mockResolvedValueOnce({
        shipmentId: "TEST-SHIP-14",
        currentStatus: "DELIVERED",
        location: "Mumbai Customer",
        version: 3,
      });

    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({});

    const response = await request(app).post(
      "/projection/rebuild/TEST-SHIP-14"
    );

    expect(response.statusCode).toBe(200);
    expect(response.body.success).toBe(true);

    expect(response.body.message).toContain(
      "Successfully replayed 3 events"
    );

    expect(ShipmentReadModel.deleteOne).toHaveBeenCalledWith({
      shipmentId: "TEST-SHIP-14",
    });
  });
});