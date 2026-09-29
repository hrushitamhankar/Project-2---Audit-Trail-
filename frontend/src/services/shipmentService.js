// src/services/shipmentService.js
import apiClient from './apiClient';

/**
 * Set an endpoint to false to use mock data instead of the backend.
 */
const USE_REAL_API = {
  getShipmentById: true,
  getShipmentEvents: true,
  getShipmentStateAt: true,
};

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

function simulateDelay(ms = 500) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getShipmentById(id) {
  if (USE_REAL_API.getShipmentById) {
    const res = await apiClient.get(`/shipment/${id}`);
    const shipment = res.data.data ?? res.data;
    return {
      ...shipment,
      aggregateId: shipment.aggregateId ?? shipment.shipmentId,
      status: shipment.status ?? shipment.currentStatus,
    };
  }
  await simulateDelay();
  const shipment = MOCK_SHIPMENTS[id];
  if (!shipment) throw new Error(`Shipment "${id}" not found`);
  return shipment;
}

export async function getShipmentEvents(id) {
  if (USE_REAL_API.getShipmentEvents) {
    const res = await apiClient.get(`/shipment/${id}/events`);
    return res.data.events ?? res.data;
  }
  await simulateDelay();
  const events = MOCK_EVENTS[id];
  if (!events) throw new Error(`No events found for shipment "${id}"`);
  return events;
}

export async function getShipmentStateAt(id, timestamp) {
  if (USE_REAL_API.getShipmentStateAt) {
    const res = await apiClient.get(`/shipment/${id}/state`, { params: { at: timestamp } });
    const data = res.data.data ?? res.data;
    const state = data.state ?? {};
    return {
      aggregateId: id,
      asOf: data.requestedAt ?? timestamp,
      eventsApplied: data.eventsApplied ?? 0,
      lastEvent: state.lastEvent ?? null,
      source: data.source,
      rawState: state,
    };
  }
  await simulateDelay();
  const events = MOCK_EVENTS[id];
  if (!events) throw new Error(`No events found for shipment "${id}"`);
  const requestedTime = new Date(timestamp).getTime();
  const relevantEvents = events.filter((e) => new Date(e.timestamp).getTime() <= requestedTime);

  if (relevantEvents.length === 0) {
    return {
      aggregateId: id,
      asOf: timestamp,
      eventsApplied: 0,
      lastEvent: null,
      note: 'No events had occurred yet at this point in time.',
    };
  }

  return {
    aggregateId: id,
    asOf: timestamp,
    eventsApplied: relevantEvents.length,
    lastEvent: relevantEvents[relevantEvents.length - 1],
  };
}