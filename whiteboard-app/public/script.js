// public/script.js
const socket = io();
let canvas;
let isReceiving = false;
let myName = '';
let myRoom = '';

// UI要素の取得
const loginScreen = document.getElementById('login-screen');
const whiteboardScreen = document.getElementById('whiteboard-screen');
const usernameInput = document.getElementById('username');
const roomNameInput = document.getElementById('roomName');
const joinBtn = document.getElementById('joinBtn');
const displayInfo = document.getElementById('display-info');
const toolSelect = document.getElementById('tool');
const colorPicker = document.getElementById('colorPicker');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');

// 入室ボタンを押したときの処理
joinBtn.addEventListener('click', () => {
    myName = usernameInput.value.trim();
    myRoom = roomNameInput.value.trim();

    if (myName === '' || myRoom === '') {
        alert('なまえ と あいことば をいれてね！');
        return;
    }

    // サーバーに部屋への参加を通知
    socket.emit('join-room', myRoom);

    // 画面の切り替え
    loginScreen.style.display = 'none';
    whiteboardScreen.style.display = 'block';
    displayInfo.textContent = `グループ: ${myRoom} | なまえ: ${myName}`;

    // キャンバスの初期化
    initCanvas();
});

function initCanvas() {
    canvas = new fabric.Canvas('canvas', { isDrawingMode: true });

    toolSelect.addEventListener('change', (e) => {
        canvas.isDrawingMode = (e.target.value === 'draw');
    });

    colorPicker.addEventListener('change', (e) => {
        canvas.freeDrawingBrush.color = e.target.value;
    });

    canvas.on('mouse:down', function(options) {
        if (toolSelect.value === 'text' && !canvas.isDrawingMode) {
            const pointer = canvas.getPointer(options.e);
            const text = new fabric.IText('ここに入力', {
                left: pointer.x,
                top: pointer.y,
                fill: colorPicker.value,
                fontSize: 24,
                author: myName,
                timestamp: new Date().toLocaleString()
            });
            canvas.add(text);
            canvas.setActiveObject(text);
            text.enterEditing();
            text.selectAll();
            emitCanvasData();
        }
    });

    canvas.on('path:created', function(options) {
        options.path.set({ author: myName, timestamp: new Date().toLocaleString() });
        emitCanvasData();
    });

    canvas.on('object:modified', () => emitCanvasData());

    function emitCanvasData() {
        if (isReceiving) return;
        const json = canvas.toJSON(['author', 'timestamp']);
        socket.emit('canvas-data', json);
    }

    socket.on('canvas-data', (data) => {
        isReceiving = true;
        canvas.loadFromJSON(data, function() {
            canvas.renderAll();
            isReceiving = false;
        });
    });

    clearBtn.addEventListener('click', () => {
        if(confirm('ほんとうに ぜんぶ けしますか？')) {
            canvas.clear();
            socket.emit('clear-canvas');
        }
    });

    socket.on('clear-canvas', () => canvas.clear());

    // エクスポート機能
    exportBtn.addEventListener('click', () => {
        const objects = canvas.getObjects();
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
        csvContent += "作成者,タイプ,内容,作成日時\n";
        objects.forEach(obj => {
            const author = obj.author || '不明';
            const type = obj.type === 'path' ? '手書き' : 'テキスト';
            let content = obj.text ? obj.text.replace(/(\r\n|\n|\r)/gm, " ") : "（描画データ）";
            const timestamp = obj.timestamp || '不明';
            csvContent += `"${author}","${type}","${content}","${timestamp}"\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `group_${myRoom}_data.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
}