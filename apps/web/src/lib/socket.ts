"use client";

import { io, Socket } from "socket.io-client";
import { SERVER } from "./api";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER, { autoConnect: false, transports: ["websocket", "polling"] });
  }
  return socket;
}
