require("dotenv").config();
const express = require("express");
const ACTION = require("./Actions");

const app = express();

app.get("/", (req, res, next) => {
  console.log("App is working ;).");
  return res.send("<h1>Success</h1>");
});

const server = app.listen(process.env.PORT || 8080);

const io = require("./socket").init(server, {
  cors: {
    origin: "*",
  },
});

const userSocketMap = {};

const getAllConnectedClients = (roomId) => {
  // io.socket.adapter.rooms.get(roomId) returns a map and we convert it to array.
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => {
      return {
        socketId,
        username: userSocketMap[socketId],
      };
    }
  );
};

io.on("connection", (socket) => {
  console.log(socket.id);
  console.log("Client connected");

  socket.on(ACTION.JOIN, ({ roomId, username }) => {
    // Storing the username
    userSocketMap[socket.id] = username;
    // Joining the room
    socket.join(roomId);
    // Getting all the clients in that room
    const clients = getAllConnectedClients(roomId);

    if (clients.length === 4) {
      socket.emit(ACTION.ROOM_FULL);
      return;
    }

    socket.emit(ACTION.ALL_USERS,clients);

    // Send msg to all the client about new client joining
    clients.forEach(({ socketId }) => {
      // Emitting event to each client in the room about the new user joining
      // username and socket.id belong to the new user who joined.
      io.to(socketId).emit(ACTION.JOINED, {
        clients,
        username,
        sockedId: socket.id,
      });

      io.to(socketId).emit(ACTION.ALL_USERS,clients);
    });
  });

  socket.on(ACTION.SENDING_SIGNAL, (payload) => {
    console.log(payload.userToSignal);
    io.to(payload.userToSignal).emit(ACTION.RTC_USER_JOINED, {
      signal: payload.signal,
      callerID: payload.callerID,
    });
  });

  socket.on(ACTION.RETURNING_SIGNAL, (payload) => {
    io.to(payload.callerID).emit(ACTION.RECEIVE_RETURNED_SIGNAL, {
      signal: payload.signal,
      id: socket.id,
    });
  });

  // This action will take the change code from the incoming client and pass it to all the clients in the room.
  socket.on(ACTION.CODE_CHANGE, ({ roomId, code }) => {
    // io.to sends message to all the client in the room

    // socket.in sends message to all the clients except the some sending/

    socket.in(roomId).emit(ACTION.CODE_CHANGE, { code });
  });

  // SYNC CODE
  socket.on(ACTION.SYNC_CODE, ({ code, joinedSocketId }) => {
    // We emit CODE_CHANGE SINCE CLIENT ALREADY LISTENING TO IT
    io.to(joinedSocketId).emit(ACTION.CODE_CHANGE, { code });
  });

  // Run just before disconnecting
  socket.on("disconnecting", () => {
    // All the rooms disconnecting user part of
    const rooms = [...socket.rooms];

    rooms.forEach((roomId) => {
      // Emitting an event for a room
      socket.in(roomId).emit(ACTION.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });

    delete userSocketMap[socket.id];
    // Method for leaving an room
    socket.leave();
  });
});
