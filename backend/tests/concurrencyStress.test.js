const { applyBatchEvents, applyEventToReadModel } = require("../src/workers/projectionWorker");
const ShipmentReadModel = require("../src/models/readModel");

jest.mock("../src/models/readModel");

describe("Read Model Concurrency & Batch Ingestion", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("correctly sorts and applies out-of-order batches", async () => {
    ShipmentReadModel.findOne.mockResolvedValue(null);
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({});

    const shuffledBatch = [
      { aggregateId: "SHP-CONC-01", eventType: "SHIPMENT_DELIVERED", payload: { destination: "Warehouse 3" }, version: 3 },
      { aggregateId: "SHP-CONC-01", eventType: "SHIPMENT_CREATED", payload: { origin: "Factory 1" }, version: 1 },
      { aggregateId: "SHP-CONC-01", eventType: "SHIPMENT_MOVED", payload: { currentLocation: "Transit Hub" }, version: 2 },
    ];

    const processed = await applyBatchEvents(shuffledBatch);

    expect(processed).toBe(3);
    expect(ShipmentReadModel.findOneAndUpdate).toHaveBeenCalledTimes(3);

    // Verify first execution corresponds to version 1
    const firstCallArgs = ShipmentReadModel.findOneAndUpdate.mock.calls[0][1];
    expect(firstCallArgs.version).toBe(1);
    expect(firstCallArgs.currentStatus).toBe("CREATED");
  });

  test("handles high-volume concurrent event dispatches idempotently", async () => {
    let currentVersion = 0;
    
    // Simulate DB state updates
    ShipmentReadModel.findOne.mockImplementation(async () => {
      return currentVersion > 0 ? { shipmentId: "SHP-CONC-02", version: currentVersion } : null;
    });

    ShipmentReadModel.findOneAndUpdate.mockImplementation(async (query, update) => {
      currentVersion = Math.max(currentVersion, update.version || 0);
      return {};
    });

    const eventList = Array.from({ length: 10 }, (_, i) => ({
      aggregateId: "SHP-CONC-02",
      eventType: i === 0 ? "SHIPMENT_CREATED" : "SHIPMENT_MOVED",
      payload: { currentLocation: `Stop #${i + 1}` },
      version: i + 1,
      timestamp: new Date(),
    }));

    // Dispatch concurrently
    await Promise.all(eventList.map((evt) => applyEventToReadModel(evt)));

    expect(currentVersion).toBe(10);
  });
});