require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");

const {
    appendEvent,
    getEvents
} = require("./services/eventStore");

const commandRouter = require("./routes/commandRouter");
const queryRouter = require("./routes/queryRouter");

const app = express();

app.use(express.json());

// CQRS routes
app.use(commandRouter);
app.use(queryRouter);

const PORT = process.env.PORT || 5000;

// Home route
app.get("/", (req, res) => {
    res.json({
        message: "Audit Trail Backend is running"
    });
});

// Health check
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        database:
            mongoose.connection.readyState === 1
                ? "connected"
                : "disconnected"
    });
});

// Existing event routes
app.post("/events", async (req, res) => {
    try {
        const event = await appendEvent(req.body);

        res.status(201).json(event);
    } catch (error) {
        res.status(400).json({
            error: error.message
        });
    }
});

app.get("/events/:aggregateId", async (req, res) => {
    try {
        const events = await getEvents(req.params.aggregateId);

        res.status(200).json(events);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// MongoDB connection
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