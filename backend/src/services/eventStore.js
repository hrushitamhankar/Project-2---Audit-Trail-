const AuditEvent = require("../models/AuditEvent");

const appendEvent = async (event) => {
  const newEvent = new AuditEvent(event);

  return await newEvent.save();
};

const getEvents = async (aggregateId) => {
  return await AuditEvent.find({ aggregateId }).sort({ timestamp: 1 });
};

module.exports = {
  appendEvent,
  getEvents,
};