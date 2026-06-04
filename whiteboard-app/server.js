const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
const roomHistory = {};

io.on('connection', (socket) => {
    console.log('ユーザーが接続:', socket.id);

    socket.on('join-room', (roomName) => {
        socket.join(roomName);
        socket.roomName = roomName;
        socket.currentPage = 1;
        
        const roomKey = `${roomName}_1`;
        if (roomHistory[roomKey]) {
            socket.emit('canvas-data', { page: 1, canvas: roomHistory[roomKey] });
        }
    });

    socket.on('switch-page', (pageNumber) => {
        if (socket.roomName) {
            socket.currentPage = pageNumber;
            const roomKey = `${socket.roomName}_${pageNumber}`;
            if (roomHistory[roomKey]) {
                socket.emit('canvas-data', { page: pageNumber, canvas: roomHistory[roomKey] });
            } else {
                socket.emit('clear-canvas-local');
            }
        }
    });

    socket.on('canvas-data', (data) => {
        if (socket.roomName) {
            const page = socket.currentPage || 1;
            const roomKey = `${socket.roomName}_${page}`;
            const canvasRaw = data.canvas ? data.canvas : data;
            roomHistory[roomKey] = canvasRaw;
            socket.to(socket.roomName).emit('canvas-data', { page: page, canvas: canvasRaw });
        }
    });

    socket.on('clear-canvas', () => {
        if (socket.roomName) {
            const page = socket.currentPage || 1;
            const roomKey = `${socket.roomName}_${page}`;
            roomHistory[roomKey] = null;
            socket.to(socket.roomName).emit('clear-canvas', { page: page });
        }
    });

    socket.on('lock-board', (isLocked) => {
        if (socket.roomName) socket.to(socket.roomName).emit('lock-board', isLocked);
    });

    socket.on('submit-work', (data) => {
        if (socket.roomName) socket.to(socket.roomName).emit('receive-submission', data);
    });

    socket.on('pointer-move', (data) => {
        if (socket.roomName) socket.to(socket.roomName).emit('pointer-move', data);
    });

    socket.on('sync-timer', (data) => {
        if (socket.roomName) socket.to(socket.roomName).emit('sync-timer', data);
    });

    socket.on('disconnect', () => {
        console.log('切断:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバー起動中: ポート${PORT}`);
});S