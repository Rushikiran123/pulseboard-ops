import { io } from 'socket.io-client';
import { getToken } from './api.js';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || undefined; // undefined = same-origin

let socket = null;

export function connectSocket() {
  if (socket) return socket;
  socket = io(SOCKET_URL, {
    auth: { token: getToken() },
    autoConnect: true,
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}
