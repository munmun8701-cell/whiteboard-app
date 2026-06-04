const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const roomHistory = {};

io.on('connection', (socket) => {
    socket.on('join-room', (roomName) => {
        socket.join(roomName);
        socket.roomName = roomName;
        if (!roomHistory[roomName]) {
            roomHistory[roomName] = { maxPage: 1, pages: {} };
        }
        socket.emit('canvas-data', { page: 1, canvas: roomHistory[roomName].pages[1] || null });
    });

    socket.on('switch-page', (pageNumber) => {
        if (socket.roomName && roomHistory[socket.roomName]) {
            socket.emit('canvas-data', { page: pageNumber, canvas: roomHistory[socket.roomName].pages[pageNumber] || null });
        }
    });

    socket.on('canvas-data', (data) => {
        if (socket.roomName) {
            const page = data.page || 1;
            if (!roomHistory[socket.roomName]) roomHistory[socket.roomName] = { maxPage: 1, pages: {} };
            roomHistory[socket.roomName].pages[page] = data.canvas;
            socket.to(socket.roomName).emit('canvas-data', data);
        }
    });

    socket.on('clear-canvas', () => {
        if (socket.roomName) socket.to(socket.roomName).emit('clear-canvas-local');
    });

    socket.on('lock-board', (isLocked) => {
        if (socket.roomName) socket.to(socket.roomName).emit('lock-board', isLocked);
    });

    socket.on('submit-work', (data) => {
        if (socket.roomName) socket.to(socket.roomName).emit('receive-submission', data);
    });

    socket.on('sync-timer', (data) => {
        if (socket.roomName) socket.to(socket.roomName).emit('sync-timer', data);
    });

    socket.on('pointer-move', (data) => {
        if (socket.roomName) socket.to(socket.roomName).emit('pointer-move', data);
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバー起動中: ポート${PORT}`);
});