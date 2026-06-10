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
            roomHistory[roomName] = { maxPage: 1, pages: {}, statuses: {} };
        }
        socket.emit('canvas-data', { page: 1, canvas: roomHistory[roomName].pages[1] || null });
        socket.emit('max-page-updated', roomHistory[roomName].maxPage);
    });

    socket.on('switch-page', (pageNumber) => {
        if (socket.roomName && roomHistory[socket.roomName]) {
            socket.emit('canvas-data', { page: pageNumber, canvas: roomHistory[socket.roomName].pages[pageNumber] || null });
        }
    });

    socket.on('canvas-data', (data) => {
        if (socket.roomName) {
            const page = data.page || 1;
            if (!roomHistory[socket.roomName]) roomHistory[socket.roomName] = { maxPage: 1, pages: {}, statuses: {} };
            roomHistory[socket.roomName].pages[page] = data.canvas;
            socket.to(socket.roomName).emit('canvas-data', data);
        }
    });

    socket.on('set-max-page', (max) => {
        if (socket.roomName && roomHistory[socket.roomName]) {
            roomHistory[socket.roomName].maxPage = max;
            io.to(socket.roomName).emit('max-page-updated', max);
        }
    });

    // 🌟 追加：全員のページとSOS・完了ステータスを一括送信
    socket.on('request-all-pages', () => {
        if (socket.roomName && roomHistory[socket.roomName]) {
            socket.emit('all-pages-data', {
                pages: roomHistory[socket.roomName].pages,
                statuses: roomHistory[socket.roomName].statuses
            });
        }
    });

    // 🌟 追加：児童の「できた」「SOS」ステータスを受信して記憶・共有
    socket.on('student-status', (data) => {
        if (socket.roomName && roomHistory[socket.roomName]) {
            roomHistory[socket.roomName].statuses[data.page] = data.status;
            io.to(socket.roomName).emit('student-status', data);
        }
    });

    // 🌟 追加：先生の「発表モード」を全員に強制適用
    socket.on('force-presentation', (page) => {
        if (socket.roomName) io.to(socket.roomName).emit('force-presentation', page);
    });
    
    socket.on('cancel-presentation', () => {
        if (socket.roomName) io.to(socket.roomName).emit('cancel-presentation');
    });

    socket.on('clear-canvas', () => {
        if (socket.roomName) socket.to(socket.roomName).emit('clear-canvas-local');
    });

    socket.on('lock-board', (isLocked) => {
        if (socket.roomName) socket.to(socket.roomName).emit('lock-board', isLocked);
    });

    socket.on('pointer-move', (data) => {
        if (socket.roomName) socket.to(socket.roomName).emit('pointer-move', data);
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`サーバー起動中: ポート${PORT}`);
});