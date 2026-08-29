const request = require("supertest");
const express = require("express");
const queryRouter = require("../src/routes/queryRouter");
const ShipmentReadModel = require("../src/models/readModel");
const { applyEventToReadModel } = require("../src/workers/projectionWorker");

// Initialize test express instance
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

    // 1. Process each event through the projection worker
    for (const evt of lifecycleEvents) {
      await applyEventToReadModel(evt);
    }

    // Verify all 3 events triggered read model updates
    expect(ShipmentReadModel.findOneAndUpdate).toHaveBeenCalledTimes(3);

    // 2. Mock the final read state for the query route
    ShipmentReadModel.findOne.mockResolvedValue({
      shipmentId: shipmentId,
      currentStatus: "DELIVERED",
      location: "Austin Facility",
      version: 3,
    });

    // 3. Query the fast-read endpoint
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
});