const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const chatRoute = require('./routes/chat');
const memoryRoute = require('./routes/memory');
const reminderRoute = require('./routes/reminder');

const app = express();

// Middleware FIRST
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

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

io.on('connection', (socket) => {
  console.log('Frontend connected via socket');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Jarvis server running on port ${PORT}`));