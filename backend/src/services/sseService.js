let clients = [];

/**
 * Registers an active client connection for SSE updates
 */
function addClient(res) {
  const clientId = Date.now() + Math.random();
  const newClient = { id: clientId, res };
  clients.push(newClient);

  res.on("close", () => {
    clients = clients.filter((c) => c.id !== clientId);
  });
}

/**
 * Broadcasts an updated ReadModel document to all connected clients
 */
function broadcastReadModelUpdate(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach((client) => {
    try {
      client.res.write(payload);
    } catch (err) {
      // Clean up failing client connections
      clients = clients.filter((c) => c.id !== client.id);
    }
  });
}

function activeClientCount() {
  return clients.length;
}

module.exports = {
  addClient,
  broadcastReadModelUpdate,
  activeClientCount,
};