const socket = io();
let canvas;
let isReceiving = false;
let myName = '';
let myRoom = '';
let currentPage = 1; // 今見ているページ

const loginScreen = document.getElementById('login-screen');
const whiteboardScreen = document.getElementById('whiteboard-screen');
const usernameInput = document.getElementById('username');
const roomNameInput = document.getElementById('roomName');
const joinBtn = document.getElementById('joinBtn');
const toolSelect = document.getElementById('tool');
const colorPicker = document.getElementById('colorPicker');
const clearBtn = document.getElementById('clearBtn');
const deleteObjBtn = document.getElementById('deleteObjBtn');

// 新機能のボタン
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageDisplay = document.getElementById('pageDisplay');
const uploadBtn = document.getElementById('uploadBtn');
const imageUpload = document.getElementById('imageUpload');

// 入室時の処理
joinBtn.addEventListener('click', () => {
    myName = usernameInput.value.trim();
    myRoom = roomNameInput.value.trim();

    if (myName === '' || myRoom === '') {
        alert('なまえ と あいことば をいれてね！');
        return;
    }

    loginScreen.style.display = 'none';
    whiteboardScreen.style.display = 'block';
    
    initCanvas();
    changePage(1); // 1ページ目に参加
});

// 🌟 新機能1：ページの切り替え処理
function changePage(pageNumber) {
    currentPage = pageNumber;
    pageDisplay.textContent = `${currentPage}ページ目`;
    
    // サーバーには「あいことば_page_1」のような別の部屋として認識させる
    const roomWithPage = `${myRoom}_page_${currentPage}`;
    socket.emit('join-room', roomWithPage);
}

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        changePage(currentPage - 1);
    }
});

nextPageBtn.addEventListener('click', () => {
    changePage(currentPage + 1);
});

// キャンバスの初期設定
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
                left: pointer.x, top: pointer.y, fill: colorPicker.value, fontSize: 24
            });
            canvas.add(text);
            canvas.setActiveObject(text);
            text.enterEditing();
            text.selectAll();
            emitCanvasData();
            toolSelect.value = 'select'; 
        }
    });

    canvas.on('path:created', () => emitCanvasData());
    canvas.on('object:modified', () => emitCanvasData());

    // 🌟 修正版：誰が書いたか関係なく「選んでボタンを押せば絶対に消える」
    deleteObjBtn.addEventListener('click', () => {
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length > 0) {
            activeObjects.forEach(obj => canvas.remove(obj));
            canvas.discardActiveObject(); // 選択を解除
            emitCanvasData();
        } else {
            alert('けしたいものを「えらぶ」モードで タッチしてから 押してね！');
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (e.target.tagName !== 'INPUT' && !canvas.getActiveObject()?.isEditing) {
                deleteObjBtn.click();
            }
        }
    });

    // 🌟 新機能2：写真やスクショを貼る処理（iPad対応）
    uploadBtn.addEventListener('click', () => {
        imageUpload.click(); // 隠してあるファイル選択画面を開く
    });

    imageUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            const imgObj = new Image();
            imgObj.src = event.target.result;
            imgObj.onload = function () {
                const image = new fabric.Image(imgObj);
                image.set({ left: 50, top: 50 });
                if (image.width > 600) image.scaleToWidth(600); // 大きすぎたら縮小
                canvas.add(image);
                canvas.setActiveObject(image);
                toolSelect.value = 'select';
                canvas.isDrawingMode = false;
                emitCanvasData();
            }
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // 連続で同じ写真を貼れるようにリセット
    });

    // パソコンからのコピペ用（Ctrl+V）
    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.indexOf('image/') !== -1) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = function(event) {
                    const imgObj = new Image();
                    imgObj.src = event.target.result;
                    imgObj.onload = function () {
                        const image = new fabric.Image(imgObj);
                        image.set({ left: 50, top: 50 });
                        if (image.width > 600) image.scaleToWidth(600);
                        canvas.add(image);
                        canvas.setActiveObject(image);
                        toolSelect.value = 'select';
                        canvas.isDrawingMode = false;
                        emitCanvasData();
                    }
                };
                reader.readAsDataURL(blob);
            }
        }
    });

    function emitCanvasData() {
        if (isReceiving) return;
        const json = canvas.toJSON();
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
        if(confirm('ほんとうに 今のページのものを ぜんぶ けしますか？')) {
            canvas.clear();
            socket.emit('clear-canvas');
        }
    });

    socket.on('clear-canvas', () => canvas.clear());
}