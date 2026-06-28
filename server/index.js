const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const chatRoute = require('./routes/chat');
const memoryRoute = require('./routes/memory');

const app = express();

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use('/api/chat', chatRoute);
app.use('/api/memory', memoryRoute);

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected!'))
  .catch(err => console.log('MongoDB error:', err));

// Socket.io setup
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: 'http://localhost:5173' }
});

global.wakeCallback = (data) => {
  io.emit('jarvis_wake', data);
};

io.on('connection', (socket) => {
  console.log('Frontend connected via socket');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Jarvis server running on port ${PORT}`));