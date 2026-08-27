const mongoose = require("mongoose");
const shipmentReadModelSchema = new mongoose.Schema(
  {
    shipmentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    currentStatus: {
      type: String,
      required: true,
      enum: ["CREATED", "IN_TRANSIT", "DELIVERED", "DELAYED", "CANCELLED", "ALERT"],
      default: "CREATED",
    },
    location: {
      type: String,
      required: true,
      default: "Origin Facility",
    },
    temperature: {
      type: Number,
      default: null,
    },
    version: {
      type: Number,
      required: true,
      default: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "shipment_read_models",
  }
);

shipmentReadModelSchema.index({ shipmentId: 1, currentStatus: 1 });

const ShipmentReadModel = mongoose.model("ShipmentReadModel", shipmentReadModelSchema);

module.exports = ShipmentReadModel;