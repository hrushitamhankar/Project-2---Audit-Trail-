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

describe("Projection Monitoring & Operational Metrics (P3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.clear();
  });

  test("GET /projection/health returns operational metrics and cache count", async () => {
    ShipmentReadModel.countDocuments
      .mockResolvedValueOnce(45) // Total projected shipments
      .mockResolvedValueOnce(3);  // Shipments in ALERT status

    cacheService.set("SHP-MOCK-1", { status: "IN_TRANSIT" });
    cacheService.set("SHP-MOCK-2", { status: "ALERT" });

    const res = await request(app).get("/projection/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe("HEALTHY");
    expect(res.body.metrics.totalShipmentsProjected).toBe(45);
    expect(res.body.metrics.criticalAlertsActive).toBe(3);
    expect(res.body.metrics.cachedEntriesCount).toBe(2);
  });

  test("GET /projection/lag calculates optimal replication status when lag < 5000ms", async () => {
    const now = Date.now();

    const mockAuditEvent = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            timestamp: new Date(now),
          }),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    ShipmentReadModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          lastUpdated: new Date(now - 1200), // 1.2s lag
        }),
      }),
    });

    const res = await request(app).get("/projection/lag");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("OPTIMAL");
    expect(res.body.data.lagMs).toBeLessThanOrEqual(1500);

    mongoose.model.mockRestore();
  });

  test("GET /projection/lag flags CATCHING_UP when read projection lags behind event store", async () => {
    const now = Date.now();

    const mockAuditEvent = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            timestamp: new Date(now),
          }),
        }),
      }),
    };
    jest.spyOn(mongoose, "model").mockReturnValue(mockAuditEvent);

    ShipmentReadModel.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          lastUpdated: new Date(now - 15000), // 15s lag
        }),
      }),
    });

    const res = await request(app).get("/projection/lag");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("CATCHING_UP");
    expect(res.body.data.lagMs).toBeGreaterThanOrEqual(10000);

    mongoose.model.mockRestore();
  });
});