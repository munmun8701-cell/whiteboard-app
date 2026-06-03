const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 部屋(ページ)ごとのデータを記憶するノート
const roomHistory = {};

io.on('connection', (socket) => {
    socket.on('join-room', (roomName) => {
        // もし別のページにいた場合は、古いページから退出する
        if (socket.roomName) {
            socket.leave(socket.roomName);
        }
        
        socket.join(roomName);
        socket.roomName = roomName;
        
        // そのページの過去データがあれば送信、なければ真っ白にする
        if (roomHistory[roomName]) {
            socket.emit('canvas-data', roomHistory[roomName]);
        } else {
            socket.emit('clear-canvas');
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
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバー起動中: ポート${PORT}`);
});