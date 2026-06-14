import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function connectSocket(token: string): Socket {
  const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';
  const origin = apiUrl.replace(/\/api\/v1\/?$/, '') || 'http://localhost:8080';
  socket = io(origin, { auth: { token }, transports: ['websocket'] });
  return socket;
}

export function getSocket(): Socket | null { return socket; }
export function disconnectSocket(): void { socket?.disconnect(); socket = null; }
