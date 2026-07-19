const dotenv = require("dotenv");
dotenv.config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const chatRoute = require('./routes/chat');
const memoryRoute = require('./routes/memory');
const reminderRoute = require('./routes/reminder');
const authRoutes = require("./routes/auth");
const { verifyToken } = require("./utils/jwt");
const Device = require("./models/Device");
const app = express();
const processCommand = require("./services/processCommand");


// Middleware FIRST
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use("/api/auth", authRoutes);
// Routes AFTER middleware
app.use('/api/chat', chatRoute);
app.use('/api/memory', memoryRoute);
app.use('/api/reminder', reminderRoute);

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected!'))
  .catch(err => console.log('MongoDB error:', err));

// Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:5173' }
});

global.wakeCallback = (data) => {
  io.emit('jarvis_wake', data);
};
const connectedClients = new Map();
io.on("connection", (socket) => {

  console.log("Socket Connected:", socket.id);

  socket.on("authenticate", async (token) => {
  try {
    const decoded = verifyToken(token);

    const device = await Device.findOne({
      deviceId: decoded.deviceId,
      trusted: true,
      jwtToken: token,
    });

    if (!device) {
      socket.disconnect();
      return;
    }

    socket.device = device;

   connectedClients.set(device.deviceId, {
  socketId: socket.id,
  device,
});


    console.log(
      `🟢 ${device.deviceName} (${device.deviceType}) Connected`
    );

  } catch (err) {
    socket.disconnect();
  }
});

socket.on("execute_command", (command) => {

    for (const client of connectedClients.values()) {

        if (client.device.deviceType === "laptop") {

            io.to(client.socketId).emit(
                "execute_command",
                command
            );

            break;
        }
    }

});

socket.on("mobile_command", async (data) => {

  console.log("📱 Mobile Command:", data.command);

  try {

    const result = await processCommand(data.command);

    socket.emit("jarvis_reply", {
      reply: result.reply,
    });

  } catch (err) {

    console.error(err);

    socket.emit("jarvis_reply", {
      reply: "Sorry sir, something went wrong.",
    });

  }

});


  socket.on("disconnect", () => {

    if (socket.device) {
      if (socket.device) {
  connectedClients.delete(socket.device.deviceId);
}
      console.log(
        `🔴 ${socket.device.deviceName} Disconnected`
      );
    } else {
      console.log("Socket Disconnected");
    }

  });

});
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Jarvis server running on port ${PORT}`));