const { Server } = require('socket.io');
const { verifyToken } = require('./authService');
const logger = require('../utils/logger');

let io = null;

function initSocketServer(httpServer, corsOrigin = '*') {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('unauthorized'));
      const decoded = verifyToken(token);
      socket.data.organizationId = decoded.organizationId;
      return next();
    } catch (err) {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const room = orgRoom(socket.data.organizationId);
    socket.join(room);
    logger.info('socket connected', { room, socketId: socket.id });

    socket.on('disconnect', () => {
      logger.info('socket disconnected', { socketId: socket.id });
    });
  });

  return io;
}

function orgRoom(organizationId) {
  return `org:${organizationId}`;
}

function emitEvent(organizationId, event) {
  if (!io) return;
  io.to(orgRoom(organizationId)).emit('event:new', event);
}

function emitAlert(organizationId, alert) {
  if (!io) return;
  io.to(orgRoom(organizationId)).emit('alert:new', alert);
}

function getIO() {
  return io;
}

function resetForTests() {
  io = null;
}

module.exports = { initSocketServer, emitEvent, emitAlert, getIO, orgRoom, resetForTests };
