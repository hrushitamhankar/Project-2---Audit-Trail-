require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

const {
    appendEvent,
    getEvents
} = require("./services/eventStore");

const queryRouter = require("./routes/queryRouter");

const app = express();

app.use(express.json());

// Routes
app.use("/", queryRouter);

const PORT = process.env.PORT || 5000;

// Home route
app.get("/", (req, res) => {
  res.json({
    message: "Audit Trail Backend is running",
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected",
  });
});

// Create audit event
app.post("/events", async (req, res) => {
    try {
        const event = await appendEvent(req.body);

        res.status(201).json({
            message: "Audit event created successfully",
            event
        });
    } catch (error) {
        console.error("Error creating audit event:", error.message);

        res.status(400).json({
            message: "Failed to create audit event",
            error: error.message
        });
    }
});

// Get audit events by aggregate ID
app.get("/events/:aggregateId", async (req, res) => {
    try {
        const events = await getEvents(req.params.aggregateId);

        res.status(200).json({
            count: events.length,
            events
        });
    } catch (error) {
        console.error("Error fetching audit events:", error.message);

        res.status(500).json({
            message: "Failed to fetch audit events",
            error: error.message
        });
    }
});

// Connect MongoDB and start server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });