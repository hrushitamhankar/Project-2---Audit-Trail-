# Audit Trail — Backend

Event-sourced inventory & logistics ledger backend, built with Node.js, Express, MongoDB, and a CQRS architecture. Instead of overwriting state on every update, the system stores an **immutable, append-only log of events** and reconstructs current or historical state by replaying them.

## Why Event Sourcing?

In traditional CRUD, updating a shipment's location from "Mumbai" to "Chennai" overwrites and loses the previous value. In regulated domains like logistics and finance, that's unacceptable — you need a full, tamper-proof history of *every* state change, not just the latest one.

This backend solves that by:
- Storing every state change as an **event** (never updating or deleting existing records)
- Reconstructing current state by **replaying** the event stream
- Maintaining a separate, fast-read **projection** so querying doesn't require replaying history every time

## Architecture — CQRS

Commands (writes) and Queries (reads) are handled by separate routers, following Command Query Responsibility Segregation:

- **Command routes** — accept an action (e.g. "move shipment"), validate it, and append a new event to the Event Store. Never update existing documents.
- **Query routes** — read current or historical state. Fast reads come from the pre-computed Read Model; full history and point-in-time reconstruction come from replaying the raw Event Store.

```
Client
  │
  ├── POST /shipment/move  ──────►  Command Router ──► validate ──► append event to Event Store
  │                                                                          │
  │                                                                          ▼
  │                                                          Projection Worker (listens for new events)
  │                                                                          │
  │                                                                          ▼
  └── GET  /shipment/:id  ───────►  Query Router  ◄──── reads ──── Read Model (fast, pre-computed state)
      GET  /shipment/:id/events ──► Query Router  ◄──── reads ──── Event Store (raw, immutable log)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Web framework | Express |
| Database | MongoDB (Mongoose) |
| Architecture | CQRS + Event Sourcing |
| Testing | Integration + unit tests (Jest/Mocha-style suites) |
| Linting | ESLint |

## Project Structure

```
backend/
├── src/
│   ├── models/
│   │   ├── AuditEvent.js        # Event Store schema (aggregateId, eventType, payload, timestamp, version)
│   │   └── ShipmentReadModel.js # Read Model schema (fast-lookup current state, with status enums + indexes)
│   ├── routes/
│   │   ├── commandRoutes.js     # POST /shipment/move and other write operations
│   │   └── queryRoutes.js       # GET /shipment/:id, /events, /state, etc.
│   ├── services/
│   │   ├── eventStore.js        # appendEvent(), getEvents() — core event persistence logic
│   │   └── projectionWorker.js  # Listens for new events, updates the Read Model, handles MongoDB Change Streams
│   ├── middleware/
│   │   └── validation.js        # Command payload validation, version/concurrency checks
│   └── server.js                # App entrypoint — Express setup, DB connection, route mounting
├── test/                        # Integration + unit test suites
├── .env.example
├── .eslintrc.json
├── package.json
└── README.md
```

## Getting Started

### Prerequisites
- Node.js ≥ 18
- MongoDB (local instance or Atlas connection string)

### Installation

```bash
git clone https://github.com/hrushitamhankar/Project-2---Audit-Trail-.git
cd Project-2---Audit-Trail-/backend
npm install
```

### Environment Setup

Copy `.env.example` to `.env` and fill in your values:

```
PORT=4000
MONGO_URI=mongodb://localhost:27017/audit-trail
CLIENT_ORIGIN=http://localhost:5173
```

### Running the server

```bash
npm run dev      # with nodemon, auto-restarts on changes
# or
npm start        # plain node
```

Server runs at `http://localhost:4000` by default.

### Running the projection worker

The background worker keeps the Read Model in sync with new events (via MongoDB Change Streams):

```bash
npm run worker
```

### Seeding demo data

For local testing without manually creating events:

```bash
npm run seed
```

### Running tests

```bash
npm test
```

## API Reference

### Commands (Write)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/shipment/move` | Appends a new event for a shipment (e.g. location change, status update, sensor reading). Requires the last-known `version` for optimistic concurrency control — stale versions are rejected with `409 Conflict`. |

**Example request body:**
```json
{
  "aggregateId": "SHIP001",
  "eventType": "LOADED_ON_SHIP",
  "payload": { "vessel": "MV Sagar" },
  "version": 2
}
```

### Queries (Read)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/shipment/:id` | Returns the current state of a shipment, served from the fast Read Model (not a live replay). |
| `GET` | `/shipment/:id/events` | Returns the full, raw, chronological event log for a shipment — used to power the frontend timeline. |
| `GET` | `/shipment/:id/state?at=<timestamp>` | Reconstructs and returns the shipment's state as it existed at a specific point in time, by replaying only events up to that timestamp. |
| `POST` | `/projection/rebuild/:id` | Disaster-recovery endpoint — replays the entire event stream for an aggregate from scratch and rebuilds its Read Model entry. |
| `GET` | `/projection/health` | Reports projection worker health and replication lag metrics. |

## Key Design Decisions

- **No UPDATE/DELETE on the Event Store** — every write is an insert. This is what makes the audit trail immutable and legally defensible in regulated use cases.
- **Optimistic Concurrency Control (OCC)** — every command includes the version it was based on. If another command has changed the aggregate since, the request is rejected rather than silently overwriting data.
- **Separate Read Model** — replaying the full event history on every read would be slow at scale. The projection worker keeps a denormalized, query-optimized copy of "current state" so reads stay fast, while the Event Store remains the single source of truth.
- **MongoDB Change Streams** — used to keep the projection worker reactive to new events in real time, rather than polling.

## Status

Backend core (event sourcing, CQRS, projections, concurrency control) is largely complete as of Day 11. Remaining work: further hardening of historical state/time-travel endpoints, full end-to-end integration testing, and final documentation/cleanup before submission.

## Contributing

This is a 3-person team project (P1 — core backend, P3 — projections & concurrency, P2 — frontend dashboard). See the project roadmap for the week-by-week division of work.