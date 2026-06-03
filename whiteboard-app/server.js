const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 🌟 ここを追加！：部屋ごとのホワイトボードのデータを記憶する「ノート」を用意
const roomHistory = {};

io.on('connection', (socket) => {
    console.log('ユーザーが接続しました:', socket.id);

    socket.on('join-room', (roomName) => {
        socket.join(roomName);
        socket.roomName = roomName;
        console.log(`ユーザー ${socket.id} が部屋 ${roomName} に参加しました`);

        // 🌟 ここを追加！：もし過去に描かれたデータが残っていたら、新しく入った人にだけ送る
        if (roomHistory[roomName]) {
            socket.emit('canvas-data', roomHistory[roomName]);
        }
    });

    socket.on('canvas-data', (data) => {
        if (socket.roomName) {
            // 🌟 ここを追加！：最新の状態をサーバーの「ノート」に上書き記録する
            roomHistory[socket.roomName] = data;
            
            // 他のメンバーに変更を送信
            socket.to(socket.roomName).emit('canvas-data', data);
        }
    });

    socket.on('clear-canvas', () => {
        if (socket.roomName) {
            // 🌟 ここを追加！：「ぜんぶけす」が押されたら、サーバーの「ノート」も白紙に戻す
            roomHistory[socket.roomName] = null;
            socket.to(socket.roomName).emit('clear-canvas');
        }
    });

    socket.on('disconnect', () => {
        console.log('ユーザーが切断しました:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバー起動中: ポート${PORT}`);
});