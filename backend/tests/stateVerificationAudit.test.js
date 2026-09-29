const request = require("supertest");
const express = require("express");
const crypto = require("crypto");
const queryRouter = require("../src/routes/queryRouter");
const ShipmentReadModel = require("../src/models/readModel");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

describe("Cryptographic State Fingerprint & Verification (P3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /shipment/:id/verify returns 404 when shipment does not exist", async () => {
    ShipmentReadModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const res = await request(app).get("/shipment/MISSING-SHIPMENT/verify");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain("not found for audit verification");
  });

  test("GET /shipment/:id/verify generates deterministic SHA-256 state fingerprint", async () => {
    const shipmentRecord = {
      shipmentId: "SHP-AUDIT-99",
      currentStatus: "IN_TRANSIT",
      location: "Nagpur Sorting Center",
      version: 4,
    };

    ShipmentReadModel.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(shipmentRecord),
    });

    // Compute expected hash matching queryRouter algorithm
    const rawPayload = `${shipmentRecord.shipmentId}|${shipmentRecord.currentStatus}|${shipmentRecord.location}|${shipmentRecord.version}`;
    const expectedFingerprint = crypto
      .createHash("sha256")
      .update(rawPayload)
      .digest("hex");

    const res = await request(app).get(`/shipment/${shipmentRecord.shipmentId}/verify`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.shipmentId).toBe(shipmentRecord.shipmentId);
    expect(res.body.verifiedVersion).toBe(4);
    expect(res.body.algorithm).toBe("SHA-256");
    expect(res.body.stateFingerprint).toBe(expectedFingerprint);
  });

  test("state fingerprint changes when version or status mutates", async () => {
    const originalRecord = {
      shipmentId: "SHP-AUDIT-99",
      currentStatus: "IN_TRANSIT",
      location: "Nagpur Sorting Center",
      version: 4,
    };

    const mutatedRecord = {
      ...originalRecord,
      currentStatus: "DELIVERED",
      version: 5,
    };

    ShipmentReadModel.findOne
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(originalRecord) })
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(mutatedRecord) });

    const res1 = await request(app).get(`/shipment/${originalRecord.shipmentId}/verify`);
    const res2 = await request(app).get(`/shipment/${mutatedRecord.shipmentId}/verify`);

    expect(res1.body.stateFingerprint).not.toBe(res2.body.stateFingerprint);
  });
});