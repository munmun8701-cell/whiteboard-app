const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// 部屋ごとのデータを記憶するオブジェクト
// 構造: roomHistory[roomName] = { maxPage: 1, pages: { 1: data, 2: data... } }
const roomHistory = {};

io.on('connection', (socket) => {
    console.log('ユーザーが接続しました:', socket.id);

    socket.on('join-room', (roomName) => {
        socket.join(roomName);
        socket.roomName = roomName;
        console.log(`ユーザー ${socket.id} が部屋 ${roomName} に参加しました`);

        // 部屋のデータがまだなければ初期化
        if (!roomHistory[roomName]) {
            roomHistory[roomName] = { maxPage: 1, pages: {} };
        }

        // 新しく入った人に、現在の最新ページ情報を送る
        socket.emit('canvas-data', { 
            page: 1, 
            canvas: roomHistory[roomName].pages[1] || null 
        });
    });

    // 🌟 ページ切り替えの処理を追加
    socket.on('switch-page', (pageNumber) => {
        if (socket.roomName && roomHistory[socket.roomName]) {
            // 該当ページのデータを送り返す
            const pageData = roomHistory[socket.roomName].pages[pageNumber] || null;
            socket.emit('canvas-data', { page: pageNumber, canvas: pageData });
        }
    });

    socket.on('canvas-data', (data) => {
        if (socket.roomName) {
            const page = data.page || 1;
            const canvasData = data.canvas;
            
            // サーバーのノートに記録
            if (!roomHistory[socket.roomName]) roomHistory[socket.roomName] = { maxPage: 1, pages: {} };
            roomHistory[socket.roomName].pages[page] = canvasData;
            
            // 他のメンバーに変更を送信
            socket.to(socket.roomName).emit('canvas-data', { page: page, canvas: canvasData });
        }
    });

    socket.on('clear-canvas', () => {
        // 現在のページのデータを消去する仕様にする場合はここでページ番号を受け取る必要がありますが、
        // 今回はシンプルに全員に「クリア命令」を出すのみにします。
        if (socket.roomName) {
            socket.to(socket.roomName).emit('clear-canvas-local');
        }
    });

    // 🌟 先生用の新機能通信（ロック、提出、タイマー、ポインター）
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

    socket.on('disconnect', () => {
        console.log('ユーザーが切断しました:', socket.id);
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバー起動中: ポート${PORT}`);
});