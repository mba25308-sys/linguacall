const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Track rooms: roomId -> array of socket ids
const rooms = {};

io.on('connection', (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  // User joins a room
  socket.on('join-room', (roomId) => {
    if (!rooms[roomId]) rooms[roomId] = [];

    const room = rooms[roomId];

    if (room.length >= 2) {
      socket.emit('room-full');
      return;
    }

    room.push(socket.id);
    socket.join(roomId);
    socket.roomId = roomId;

    console.log(`🚪 ${socket.id} joined room: ${roomId} (${room.length}/2)`);

    // Tell this user how many are in the room
    socket.emit('room-joined', { roomId, userCount: room.length });

    // If 2 people are in room, tell the first user to start the call
    if (room.length === 2) {
      // Tell the first user (initiator) to create an offer
      io.to(room[0]).emit('start-call', { initiator: true });
      io.to(room[1]).emit('start-call', { initiator: false });
    }
  });

  // WebRTC Signaling — pass messages between peers
  socket.on('offer', (data) => {
    console.log(`📡 Offer from ${socket.id}`);
    socket.to(socket.roomId).emit('offer', data);
  });

  socket.on('answer', (data) => {
    console.log(`📡 Answer from ${socket.id}`);
    socket.to(socket.roomId).emit('answer', data);
  });

  socket.on('ice-candidate', (candidate) => {
    socket.to(socket.roomId).emit('ice-candidate', candidate);
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    const roomId = socket.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      if (rooms[roomId].length === 0) delete rooms[roomId];
      // Notify remaining user
      socket.to(roomId).emit('peer-left');
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on http://localhost:${PORT}`);
});