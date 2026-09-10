const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const queryRouter = require("../src/routes/queryRouter");
const ShipmentReadModel = require("../src/models/readModel");
const { applyEventToReadModel } = require("../src/workers/projectionWorker");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

describe("End-to-End CQRS Event Projection & Query Lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("full lifecycle: CREATED -> MOVED -> DELIVERED updates read model properly", async () => {
    const shipmentId = "SHP-E2E-999";

    const lifecycleEvents = [
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_CREATED",
        payload: { origin: "Seattle Hub" },
        version: 1,
        timestamp: new Date().toISOString(),
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_MOVED",
        payload: { currentLocation: "Denver Distribution Hub" },
        version: 2,
        timestamp: new Date().toISOString(),
      },
      {
        aggregateId: shipmentId,
        eventType: "SHIPMENT_DELIVERED",
        payload: { destination: "Austin Facility" },
        version: 3,
        timestamp: new Date().toISOString(),
      },
    ];

    for (const evt of lifecycleEvents) {
      await applyEventToReadModel(evt);
    }

    expect(ShipmentReadModel.findOneAndUpdate).toHaveBeenCalledTimes(3);

    ShipmentReadModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        shipmentId: shipmentId,
        currentStatus: "DELIVERED",
        location: "Austin Facility",
        version: 3,
      }),
    });

    const response = await request(app).get(`/shipment/${shipmentId}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.currentStatus).toBe("DELIVERED");
    expect(response.body.data.location).toBe("Austin Facility");
    expect(response.body.data.version).toBe(3);
  });

  test("handles query for non-existent shipment gracefully", async () => {
    ShipmentReadModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const response = await request(app).get("/shipment/NON-EXISTENT");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toContain("not found in Read Model");
  });

  test("GET /shipment/analytics/summary returns aggregated counts per status", async () => {
    ShipmentReadModel.aggregate.mockResolvedValue([
      { _id: "IN_TRANSIT", count: 4 },
      { _id: "ALERT", count: 1 },
      { _id: "DELIVERED", count: 2 },
    ]);

    const response = await request(app).get("/shipment/analytics/summary");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.total).toBe(7);
    expect(response.body.data.IN_TRANSIT).toBe(4);
    expect(response.body.data.ALERT).toBe(1);
    expect(response.body.data.DELIVERED).toBe(2);
  });

  test("GET /shipments returns paginated and filtered read models", async () => {
    const mockShipments = [
      { shipmentId: "SHP-101", currentStatus: "ALERT", location: "Hub X", version: 2 },
      { shipmentId: "SHP-102", currentStatus: "ALERT", location: "Hub Y", version: 1 },
    ];

    const mockLean = jest.fn().mockResolvedValue(mockShipments);
    const mockLimit = jest.fn().mockReturnValue({ lean: mockLean });
    const mockSkip = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockSort = jest.fn().mockReturnValue({ skip: mockSkip });

    ShipmentReadModel.find.mockReturnValue({ sort: mockSort });
    ShipmentReadModel.countDocuments.mockResolvedValue(2);

    const response = await request(app).get("/shipments?status=ALERT&page=1&limit=10");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.pagination.page).toBe(1);
    expect(response.body.pagination.totalRecords).toBe(2);
    expect(response.body.pagination.totalPages).toBe(1);
  });

  test("GET /shipment/:id/verify returns deterministic SHA-256 state fingerprint", async () => {
    const mockShipment = {
      shipmentId: "SHP-AUDIT-101",
      currentStatus: "DELIVERED",
      location: "Terminal A",
      version: 4,
    };

    ShipmentReadModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockShipment),
    });

    const response = await request(app).get("/shipment/SHP-AUDIT-101/verify");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.verifiedVersion).toBe(4);
    expect(response.body.algorithm).toBe("SHA-256");
    expect(response.body.stateFingerprint).toBeDefined();
    expect(response.body.stateFingerprint).toHaveLength(64);
  });

  test("GET /projection/lag calculates sync latency between events and read models", async () => {
    const now = new Date();

    // Mock AuditEvent model to prevent hanging DB calls
    const mockAuditEvent = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            timestamp: now,
          }),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    ShipmentReadModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          lastUpdated: new Date(now.getTime() - 1000),
        }),
      }),
    });

    const response = await request(app).get("/projection/lag");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.status).toBe("OPTIMAL");
    expect(typeof response.body.data.lagMs).toBe("number");

    mongoose.model.mockRestore();
  });
});