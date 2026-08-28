const { applyEventToReadModel } = require("../src/workers/projectionWorker");
const ShipmentReadModel = require("../src/models/readModel");

jest.mock("../src/models/readModel");

describe("Projection Worker Event Handlers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("applies SHIPMENT_CREATED event to ReadModel", async () => {
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({});

    const event = {
      aggregateId: "SHP-202",
      eventType: "SHIPMENT_CREATED",
      payload: { origin: "Berlin Distribution Center" },
      version: 1,
      timestamp: new Date(),
    };

    await applyEventToReadModel(event);

    expect(ShipmentReadModel.findOneAndUpdate).toHaveBeenCalledWith(
      { shipmentId: "SHP-202" },
      expect.objectContaining({
        shipmentId: "SHP-202",
        currentStatus: "CREATED",
        location: "Berlin Distribution Center",
      }),
      { upsert: true, new: true }
    );
  });

  test("applies SHIPMENT_MOVED event to ReadModel", async () => {
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({});

    const event = {
      aggregateId: "SHP-202",
      eventType: "SHIPMENT_MOVED",
      payload: { currentLocation: "Frankfurt Hub" },
      version: 2,
      timestamp: new Date(),
    };

    await applyEventToReadModel(event);

    expect(ShipmentReadModel.findOneAndUpdate).toHaveBeenCalledWith(
      { shipmentId: "SHP-202" },
      expect.objectContaining({
        location: "Frankfurt Hub",
        currentStatus: "IN_TRANSIT",
        version: 2,
      }),
      { new: true }
    );
  });

  test("applies TEMPERATURE_SPIKE event and sets ALERT status when exceeding threshold", async () => {
    ShipmentReadModel.findOneAndUpdate.mockResolvedValue({});

    const sensorEvent = {
      aggregateId: "SHP-202",
      eventType: "TEMPERATURE_SPIKE",
      payload: { temperature: 12.5 },
      version: 3,
      timestamp: new Date(),
    };

    await applyEventToReadModel(sensorEvent);

    expect(ShipmentReadModel.findOneAndUpdate).toHaveBeenCalledWith(
      { shipmentId: "SHP-202" },
      expect.objectContaining({
        temperature: 12.5,
        currentStatus: "ALERT",
        version: 3,
      }),
      { new: true }
    );
  });
});