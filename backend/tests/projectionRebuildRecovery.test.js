const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const queryRouter = require("../src/routes/queryRouter");
const ShipmentReadModel = require("../src/models/readModel");
const cacheService = require("../src/services/cacheService");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

describe("Projection Rebuild & Disaster Recovery Endpoints (P3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.clear();
  });

  test("POST /projection/rebuild/:id returns 404 when no events exist for aggregate", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const res = await request(app).post("/projection/rebuild/UNKNOWN-SHIPMENT");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("No events found to replay");

    mongoose.model.mockRestore();
  });

  test("POST /projection/rebuild-all returns 404 when audit event store is empty", async () => {
    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    const res = await request(app).post("/projection/rebuild-all");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("No audit events found to rebuild projections");

    mongoose.model.mockRestore();
  });

  test("POST /projection/rebuild-all wipes read store, clears cache, and replays all events", async () => {
    const events = [
      {
        aggregateId: "SHP-REC-1",
        eventType: "SHIPMENT_CREATED",
        payload: { location: "Hub Alpha" },
        version: 1,
        timestamp: new Date().toISOString(),
      },
      {
        aggregateId: "SHP-REC-2",
        eventType: "SHIPMENT_CREATED",
        payload: { location: "Hub Beta" },
        version: 1,
        timestamp: new Date().toISOString(),
      },
    ];

    const mockAuditEvent = {
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(events),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    ShipmentReadModel.deleteMany.mockResolvedValue({});
    ShipmentReadModel.countDocuments.mockResolvedValue(2);
    ShipmentReadModel.findOne.mockResolvedValue(null);
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({ status: "CREATED" });

    cacheService.set("STALE-KEY", { dummy: true });

    const res = await request(app).post("/projection/rebuild-all");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.metrics.eventsReplayed).toBe(2);
    expect(res.body.metrics.readModelsGenerated).toBe(2);
    expect(cacheService.size()).toBe(2); // Repopulated by replay

    mongoose.model.mockRestore();
  });
});