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
        if (roomHistory[roomName]) {
            socket.emit('canvas-data', roomHistory[roomName]);
        }
    });

    socket.on('canvas-data', (data) => {
        if (socket.roomName) {
            roomHistory[socket.roomName] = data;
            socket.to(socket.roomName).emit('canvas-data', data);
        }
    });

    socket.on('clear-canvas', () => {
        if (socket.roomName) {
            roomHistory[socket.roomName] = null;
            socket.to(socket.roomName).emit('clear-canvas');
        }
    });

    socket.on('lock-board', (isLocked) => {
        if (socket.roomName) socket.to(socket.roomName).emit('lock-board', isLocked);
    });

    socket.on('submit-work', (data) => {
        if (socket.roomName) socket.to(socket.roomName).emit('receive-submission', data);
    });

    // 🌟 新機能：ポインターの動きを全員に転送
    socket.on('pointer-move', (data) => {
        if (socket.roomName) socket.to(socket.roomName).emit('pointer-move', data);
    });

    // 🌟 新機能：タイマーの時間を全員に転送
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
});