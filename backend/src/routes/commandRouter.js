const express = require("express");

const router = express.Router();

router.post("/shipment/move", (req, res) => {
    res.status(200).json({
        message: "Shipment move command received",
        command: req.body
    });
});

module.exports = router;