
jest.mock("../src/models/readModel");

const ShipmentReadModel = require("../src/models/readModel");

const {
  applyEventToReadModel,
} = require("../src/workers/projectionWorker");

describe("Optimistic Concurrency Control", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("should apply a newer event version", async () => {
    ShipmentReadModel.findOne.mockResolvedValue({
      shipmentId: "SHP-OCC-01",
      currentStatus: "CREATED",
      location: "Delhi",
      version: 1,
    });

    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({
      shipmentId: "SHP-OCC-01",
      currentStatus: "IN_TRANSIT",
      location: "Mumbai",
      version: 2,
    });

    const event = {
      aggregateId: "SHP-OCC-01",
      eventType: "SHIPMENT_MOVED",
      payload: {
        location: "Mumbai",
      },
      version: 2,
      timestamp: new Date(),
    };

    const result = await applyEventToReadModel(event);

    expect(result).not.toBe(false);

    expect(
      ShipmentReadModel.findOneAndUpdate
    ).toHaveBeenCalled();
  });

  test("should reject an old event version", async () => {
    ShipmentReadModel.findOne.mockResolvedValue({
      shipmentId: "SHP-OCC-02",
      currentStatus: "IN_TRANSIT",
      location: "Mumbai",
      version: 5,
    });

    const event = {
      aggregateId: "SHP-OCC-02",
      eventType: "SHIPMENT_MOVED",
      payload: {
        location: "Delhi",
      },
      version: 2,
      timestamp: new Date(),
    };

    const result = await applyEventToReadModel(event);

    expect(result).toBe(false);

    expect(
      ShipmentReadModel.findOneAndUpdate
    ).not.toHaveBeenCalled();
  });

  test("should reject a duplicate event version", async () => {
    ShipmentReadModel.findOne.mockResolvedValue({
      shipmentId: "SHP-OCC-03",
      currentStatus: "IN_TRANSIT",
      location: "Mumbai",
      version: 3,
    });

    const event = {
      aggregateId: "SHP-OCC-03",
      eventType: "SHIPMENT_MOVED",
      payload: {
        location: "Mumbai",
      },
      version: 3,
      timestamp: new Date(),
    };

    const result = await applyEventToReadModel(event);

    expect(result).toBe(false);

    expect(
      ShipmentReadModel.findOneAndUpdate
    ).not.toHaveBeenCalled();
  });

  test("should allow the next sequential version", async () => {
    ShipmentReadModel.findOne.mockResolvedValue({
      shipmentId: "SHP-OCC-04",
      currentStatus: "IN_TRANSIT",
      location: "Mumbai",
      version: 4,
    });

    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({
      shipmentId: "SHP-OCC-04",
      currentStatus: "IN_TRANSIT",
      location: "Pune",
      version: 5,
    });

    const event = {
      aggregateId: "SHP-OCC-04",
      eventType: "SHIPMENT_MOVED",
      payload: {
        location: "Pune",
      },
      version: 5,
      timestamp: new Date(),
    };

    const result = await applyEventToReadModel(event);

    expect(result).not.toBe(false);

    expect(
      ShipmentReadModel.findOneAndUpdate
    ).toHaveBeenCalled();
  });
});