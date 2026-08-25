// src/services/shipmentService.js

/**
 * Mock data - simulates what the backend Event Store / Read Model
 * will eventually return. Swap the function bodies below with real
 * axios calls once P1/P3 ship the actual endpoints.
 */

const MOCK_SHIPMENTS = {
  SHIP001: {
    aggregateId: 'SHIP001',
    status: 'ARRIVED_AT_PORT',
    location: 'Mumbai Port',
    temperature: 4.2,
    lastUpdated: '2026-08-20T14:30:00Z',
  },
  SHIP002: {
    aggregateId: 'SHIP002',
    status: 'LOADED_ON_SHIP',
    location: 'In Transit - Arabian Sea',
    temperature: 6.8,
    lastUpdated: '2026-08-23T09:15:00Z',
  },
};

const MOCK_EVENTS = {
  SHIP001: [
    { eventType: 'CONTAINER_CREATED', timestamp: '2026-08-15T08:00:00Z', payload: {} },
    { eventType: 'LOADED_ON_SHIP', timestamp: '2026-08-16T10:00:00Z', payload: { vessel: 'MV Sagar' } },
    { eventType: 'TEMPERATURE_SPIKE', timestamp: '2026-08-18T22:15:00Z', payload: { temperature: 9.4 } },
    { eventType: 'ARRIVED_AT_PORT', timestamp: '2026-08-20T14:30:00Z', payload: { port: 'Mumbai Port' } },
  ],
  SHIP002: [
    { eventType: 'CONTAINER_CREATED', timestamp: '2026-08-21T08:00:00Z', payload: {} },
    { eventType: 'LOADED_ON_SHIP', timestamp: '2026-08-23T09:15:00Z', payload: { vessel: 'MV Neptune' } },
  ],
};

// Simulates network delay so loading states are testable now.
function simulateDelay(ms = 500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * TODO: Replace with real call once P1 ships GET /shipment/:id
 * e.g. return axios.get(`${BASE_URL}/shipment/${id}`).then(res => res.data);
 */
export async function getShipmentById(id) {
  await simulateDelay();
  const shipment = MOCK_SHIPMENTS[id];
  if (!shipment) {
    throw new Error(`Shipment "${id}" not found`);
  }
  return shipment;
}

/**
 * TODO: Replace with real call once P3 ships GET /shipment/:id/events
 */
export async function getShipmentEvents(id) {
  await simulateDelay();
  const events = MOCK_EVENTS[id];
  if (!events) {
    throw new Error(`No events found for shipment "${id}"`);
  }
  return events;
}

/**
 * TODO: Replace with real call once P1 ships GET /shipment/:id/state?at=timestamp
 */
export async function getShipmentStateAt(id, timestamp) {
  await simulateDelay();
  const events = MOCK_EVENTS[id];
  if (!events) {
    throw new Error(`No events found for shipment "${id}"`);
  }
  // naive mock "replay": just return events up to that timestamp
  const relevantEvents = events.filter((e) => new Date(e.timestamp) <= new Date(timestamp));
  return {
    aggregateId: id,
    asOf: timestamp,
    eventsApplied: relevantEvents.length,
    lastEvent: relevantEvents[relevantEvents.length - 1] || null,
  };
}