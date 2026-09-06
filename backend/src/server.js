require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const commandRouter = require("./routes/commandRouter");
const queryRouter = require("./routes/queryRouter");

const app = express();
const PORT = process.env.PORT || 4000;

// Enable CORS for frontend Vite dev server
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Register CQRS Command and Query routers
app.use("/", commandRouter);
app.use("/", queryRouter);

// Base sanity check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", service: "Audit Trail Backend API" });
});

async function startServer() {
  if (process.env.MONGO_URI) {
    try {
      await mongoose.connect(process.env.MONGO_URI);
      console.log("[Server] Connected to MongoDB.");
    } catch (err) {
      console.error("[Server] MongoDB connection error:", err.message);
    }
  }

  app.listen(PORT, () => {
    console.log(`[Server] Audit Trail API listening on http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;