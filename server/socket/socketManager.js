let io = null;

const connectedClients = new Map();

const pendingDesktopConnections = new Map();

function setIO(socketServer) {
  io = socketServer;
}

function getIO() {
  return io;
}

module.exports = {
  setIO,
  getIO,
  connectedClients,
  pendingDesktopConnections,
};