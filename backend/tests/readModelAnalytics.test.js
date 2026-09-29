const request = require("supertest");
const express = require("express");
const queryRouter = require("../src/routes/queryRouter");
const ShipmentReadModel = require("../src/models/readModel");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

describe("Read-Model Query & Analytics Verification (P3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /shipments applies default pagination parameters and returns record list", async () => {
    const mockList = [
      { shipmentId: "SHP-101", currentStatus: "IN_TRANSIT", location: "Kolkata Hub", version: 2 },
      { shipmentId: "SHP-102", currentStatus: "DELIVERED", location: "Howrah Terminal", version: 3 },
    ];

    ShipmentReadModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockList),
          }),
        }),
      }),
    });

    ShipmentReadModel.countDocuments.mockResolvedValue(25);

    const res = await request(app).get("/shipments?page=1&limit=2");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination.page).toBe(1);
    expect(res.body.pagination.limit).toBe(2);
    expect(res.body.pagination.totalRecords).toBe(25);
    expect(res.body.pagination.totalPages).toBe(13);
  });

  test("GET /shipments applies status filter", async () => {
    ShipmentReadModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    ShipmentReadModel.countDocuments.mockResolvedValue(0);

    const res = await request(app).get("/shipments?status=ALERT");

    expect(res.status).toBe(200);
    expect(ShipmentReadModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ currentStatus: "ALERT" })
    );
  });

  test("GET /shipment/analytics/summary formats operational status aggregates", async () => {
    const mockAggregateResult = [
      { _id: "CREATED", count: 12 },
      { _id: "IN_TRANSIT", count: 28 },
      { _id: "DELIVERED", count: 50 },
      { _id: "ALERT", count: 4 },
    ];

    ShipmentReadModel.aggregate.mockResolvedValue(mockAggregateResult);

    const res = await request(app).get("/shipment/analytics/summary");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(94);
    expect(res.body.data.CREATED).toBe(12);
    expect(res.body.data.IN_TRANSIT).toBe(28);
    expect(res.body.data.DELIVERED).toBe(50);
    expect(res.body.data.ALERT).toBe(4);
  });
});