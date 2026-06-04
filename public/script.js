const socket = io();
let canvas;
let isReceiving = false;
let myName = '';
let myRoom = '';
let isTeacher = false;
let isLocked = false;

const loginScreen = document.getElementById('login-screen');
const whiteboardScreen = document.getElementById('whiteboard-screen');
const usernameInput = document.getElementById('username');
const roomNameInput = document.getElementById('roomName');
const isTeacherModeCheck = document.getElementById('isTeacherMode');
const joinBtn = document.getElementById('joinBtn');
const toolSelect = document.getElementById('tool');
const colorPicker = document.getElementById('colorPicker');
const clearBtn = document.getElementById('clearBtn');
const deleteObjBtn = document.getElementById('deleteObjBtn');
const lockBoardBtn = document.getElementById('lockBoardBtn');
const lockOverlay = document.getElementById('lock-overlay');
const submitBtn = document.getElementById('submitBtn');
const viewGalleryBtn = document.getElementById('viewGalleryBtn');
const galleryModal = document.getElementById('gallery-modal');
const galleryGrid = document.getElementById('gallery-grid');
const closeGalleryBtn = document.getElementById('closeGalleryBtn');

// 新機能のボタン
const addGakuBtn = document.getElementById('addGakuBtn');
const addMaBtn = document.getElementById('addMaBtn');
const addStickyBtn = document.getElementById('addStickyBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');

joinBtn.addEventListener('click', () => {
    myName = usernameInput.value.trim();
    myRoom = roomNameInput.value.trim();
    isTeacher = isTeacherModeCheck.checked;

    if (myName === '' || myRoom === '') {
        alert('なまえ と あいことば をいれてね！');
        return;
    }

    socket.emit('join-room', myRoom);
    loginScreen.style.display = 'none';
    whiteboardScreen.style.display = 'block';
    
    if (isTeacher) {
        document.querySelectorAll('.teacher-only').forEach(el => el.style.display = 'inline-block');
        submitBtn.style.display = 'none';
    } else {
        submitBtn.style.display = 'inline-block';
    }

    initCanvas();
});

function initCanvas() {
    canvas = new fabric.Canvas('canvas', { isDrawingMode: true });

    toolSelect.addEventListener('change', (e) => {
        if (isLocked && !isTeacher) {
            canvas.isDrawingMode = false;
            return;
        }
        canvas.isDrawingMode = (e.target.value === 'draw');
    });

    colorPicker.addEventListener('change', (e) => {
        canvas.freeDrawingBrush.color = e.target.value;
    });

    function setPermissions(obj) {
        if (isTeacher) {
            obj.set({ selectable: true, evented: true });
        } else {
            const isMine = (obj.author === myName);
            obj.set({ selectable: isMine, evented: isMine });
        }
    }

    // 🌟 新機能：板書枠を作る関数（〇学、〇ま）
    function createBoardFrame(type) {
        const isGaku = (type === '学');
        const color = isGaku ? '#e53935' : '#1e88e5'; // 学は赤、まは青

        // 左上の「〇文字」のバッジ
        const circle = new fabric.Circle({
            radius: 20, fill: 'white', stroke: color, strokeWidth: 4,
            originX: 'center', originY: 'center'
        });
        const text = new fabric.Text(type, {
            fontSize: 24, fill: color, fontWeight: 'bold',
            originX: 'center', originY: 'center'
        });
        const badge = new fabric.Group([circle, text], {
            left: -20, top: -20
        });

        // 四角い枠
        const rect = new fabric.Rect({
            left: 0, top: 0, width: 450, height: 120,
            fill: 'transparent', stroke: color, strokeWidth: 4, rx: 8, ry: 8
        });

        // 枠とバッジを合体
        const frameGroup = new fabric.Group([rect, badge], {
            left: 50, top: 50, author: myName, timestamp: new Date().toLocaleString()
        });
        setPermissions(frameGroup);
        canvas.add(frameGroup);

        // 枠の中に入力用のテキストを自動配置
        const innerText = new fabric.IText(isGaku ? 'めあてを入力...' : 'まとめを入力...', {
            left: 90, top: 80, fontSize: 24, fill: '#333', author: myName
        });
        setPermissions(innerText);
        canvas.add(innerText);

        toolSelect.value = 'select';
        canvas.isDrawingMode = false;
        emitCanvasData();
    }

    if (isTeacher) {
        addGakuBtn.addEventListener('click', () => createBoardFrame('学'));
        addMaBtn.addEventListener('click', () => createBoardFrame('ま'));
    }

    // 🌟 新機能：オクリンク風の「ふせん（カード）」を追加
    addStickyBtn.addEventListener('click', () => {
        // パステルカラーのふせんをランダムに作成
        const colors = ['#fff9c4', '#ffcc80', '#c8e6c9', '#bbdefb', '#f8bbd0'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        const stickyText = new fabric.IText('ここに入力', {
            left: Math.random() * 200 + 50, // 少しずらして出現
            top: Math.random() * 200 + 50,
            fontSize: 22,
            padding: 15,
            backgroundColor: randomColor,
            fill: '#333',
            author: myName,
            timestamp: new Date().toLocaleString(),
            // ふせんっぽい影をつける
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 5, offsetX: 3, offsetY: 3 })
        });

        setPermissions(stickyText);
        canvas.add(stickyText);
        canvas.setActiveObject(stickyText);
        stickyText.enterEditing();
        stickyText.selectAll();
        
        toolSelect.value = 'select';
        canvas.isDrawingMode = false;
        emitCanvasData();
    });

    // 🌟 新機能：PDFエクスポート（完全版）
    if (isTeacher) {
        exportPdfBtn.addEventListener('click', () => {
            const { jsPDF } = window.jspdf;
            // キャンバスのサイズに合わせて横向きのPDFを作成
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'px',
                format: [canvas.width, canvas.height]
            });
            // キャンバスを綺麗な画像（JPEG）に変換してPDFに貼り付け
            const imgData = canvas.toDataURL({ format: 'jpeg', quality: 1.0 });
            pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
            pdf.save(`ボード記録_${myRoom}.pdf`);
        });
    }

    // --- 以下、既存の機能 ---
    canvas.on('mouse:down', function(options) {
        if (toolSelect.value === 'text' && !canvas.isDrawingMode) {
            const pointer = canvas.getPointer(options.e);
            const text = new fabric.IText('ここに入力', {
                left: pointer.x, top: pointer.y, fill: colorPicker.value, fontSize: 24,
                author: myName, timestamp: new Date().toLocaleString()
            });
            setPermissions(text);
            canvas.add(text);
            canvas.setActiveObject(text);
            text.enterEditing();
            text.selectAll();
            emitCanvasData();
            toolSelect.value = 'select'; 
        }
    });

    canvas.on('path:created', function(options) {
        options.path.set({ author: myName, timestamp: new Date().toLocaleString() });
        setPermissions(options.path);
        emitCanvasData();
    });

    canvas.on('object:modified', () => emitCanvasData());

    deleteObjBtn.addEventListener('click', () => {
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length === 0) return;
        activeObjects.forEach(obj => {
            if (isTeacher || obj.author === myName) canvas.remove(obj);
        });
        canvas.discardActiveObject();
        emitCanvasData();
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (e.target.tagName !== 'INPUT' && !canvas.getActiveObject()?.isEditing) {
                deleteObjBtn.click();
            }
        }
    });

    window.addEventListener('paste', (e) => {
        if (isLocked && !isTeacher) return;
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
                        image.set({ left: 50, top: 50, author: myName, timestamp: new Date().toLocaleString() });
                        if (image.width > 600) image.scaleToWidth(600);
                        setPermissions(image);
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
        const json = canvas.toJSON(['author', 'timestamp']);
        socket.emit('canvas-data', json);
    }

    socket.on('canvas-data', (data) => {
        isReceiving = true;
        canvas.loadFromJSON(data, function() {
            canvas.renderAll();
            isReceiving = false;
        }, function(o, object) {
            object.set('author', o.author);
            object.set('timestamp', o.timestamp);
            setPermissions(object);
        });
    });

    if (isTeacher) {
        lockBoardBtn.addEventListener('click', () => {
            const willLock = !isLocked;
            socket.emit('lock-board', willLock);
            lockBoardBtn.textContent = willLock ? 'ロック解除' : '注目！';
            lockBoardBtn.style.backgroundColor = willLock ? '#28a745' : '#dc3545';
            isLocked = willLock;
        });
    }

    socket.on('lock-board', (lockedState) => {
        if (!isTeacher) {
            isLocked = lockedState;
            if (isLocked) {
                lockOverlay.style.display = 'flex';
                canvas.discardActiveObject();
                canvas.isDrawingMode = false;
            } else {
                lockOverlay.style.display = 'none';
                if (toolSelect.value === 'draw') canvas.isDrawingMode = true;
            }
        }
    });

    submitBtn.addEventListener('click', () => {
        const dataURL = canvas.toDataURL({ format: 'png', quality: 0.8 });
        socket.emit('submit-work', { author: myName, image: dataURL, time: new Date().toLocaleTimeString() });
        const originalText = submitBtn.textContent;
        submitBtn.textContent = '✅ 提出しました！';
        submitBtn.style.backgroundColor = '#28a745';
        setTimeout(() => {
            submitBtn.textContent = originalText;
            submitBtn.style.backgroundColor = '#ff9800';
        }, 2000);
    });

    socket.on('receive-submission', (data) => {
        if (!isTeacher) return;
        let existingImg = document.getElementById('sub-img-' + data.author);
        if (existingImg) {
            existingImg.src = data.image;
            document.getElementById('sub-time-' + data.author).textContent = '更新: ' + data.time;
        } else {
            const div = document.createElement('div');
            div.className = 'gallery-item';
            div.innerHTML = `
                <h3 style="margin:0 0 10px 0; color:#333;">👦 ${data.author}</h3>
                <img id="sub-img-${data.author}" src="${data.image}" alt="提出物">
                <p id="sub-time-${data.author}" style="color:#666; font-size:14px; margin:5px 0 0 0;">提出: ${data.time}</p>
            `;
            galleryGrid.appendChild(div);
        }
    });

    viewGalleryBtn.addEventListener('click', () => galleryModal.style.display = 'block');
    closeGalleryBtn.addEventListener('click', () => galleryModal.style.display = 'none');

    clearBtn.addEventListener('click', () => {
        if(confirm('ほんとうに ぜんぶ けしますか？')) {
            canvas.clear();
            socket.emit('clear-canvas');
        }
    });
    socket.on('clear-canvas', () => canvas.clear());
}