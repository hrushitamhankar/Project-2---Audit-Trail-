const express = require("express");
const queryRouter = require("../src/routes/queryRouter");
const sseService = require("../src/services/sseService");
const ShipmentReadModel = require("../src/models/readModel");
const { applyEventToReadModel } = require("../src/workers/projectionWorker");

const app = express();
app.use(express.json());
app.use("/", queryRouter);

jest.mock("../src/models/readModel");

describe("Real-Time Projection SSE Stream Integration (P3)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("GET /shipments/live-stream initiates text/event-stream connection", async () => {
    const mockRes = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      on: jest.fn(),
    };

    const initialClients = sseService.activeClientCount();
    sseService.addClient(mockRes);

    expect(sseService.activeClientCount()).toBe(initialClients + 1);
  });

  test("broadcastReadModelUpdate transmits formatted SSE payload to active listeners", () => {
    const mockWrite = jest.fn();
    const mockRes = {
      write: mockWrite,
      on: jest.fn(),
    };

    sseService.addClient(mockRes);

    const updatePayload = {
      shipmentId: "SHP-SSE-999",
      currentStatus: "ALERT",
      location: "Cold Storage Dock 4",
      version: 5,
    };

    sseService.broadcastReadModelUpdate(updatePayload);

    expect(mockWrite).toHaveBeenCalledWith(
      `data: ${JSON.stringify(updatePayload)}\n\n`
    );
  });

  test("applyEventToReadModel triggers SSE broadcast when updating projection", async () => {
    const broadcastSpy = jest.spyOn(sseService, "broadcastReadModelUpdate");

    const mockUpdatedDoc = {
      shipmentId: "SHP-SSE-101",
      currentStatus: "IN_TRANSIT",
      location: "Bhopal Junction",
      version: 2,
    };

    ShipmentReadModel.findOne.mockResolvedValue(null);
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue(mockUpdatedDoc);

    const event = {
      aggregateId: "SHP-SSE-101",
      eventType: "SHIPMENT_MOVED",
      payload: { currentLocation: "Bhopal Junction" },
      version: 2,
      timestamp: new Date().toISOString(),
    };

    const result = await applyEventToReadModel(event);

    expect(result).toBe(true);
    expect(broadcastSpy).toHaveBeenCalledWith(mockUpdatedDoc);

    broadcastSpy.mockRestore();
  });
});