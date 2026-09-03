const request = require("supertest");
const express = require("express");
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

    ShipmentReadModel.findOne.mockResolvedValue({
      shipmentId: shipmentId,
      currentStatus: "DELIVERED",
      location: "Austin Facility",
      version: 3,
    });

    const response = await request(app).get(`/shipment/${shipmentId}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.currentStatus).toBe("DELIVERED");
    expect(response.body.data.location).toBe("Austin Facility");
    expect(response.body.data.version).toBe(3);
  });

  test("handles query for non-existent shipment gracefully", async () => {
    ShipmentReadModel.findOne.mockResolvedValue(null);

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
});