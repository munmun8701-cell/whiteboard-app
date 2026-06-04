const socket = io();
let canvas;
let isReceiving = false;
let myName = '';
let myRoom = '';
let isTeacher = false; // 先生かどうかを判定
let isLocked = false;  // ボードがロックされているか

const loginScreen = document.getElementById('login-screen');
const whiteboardScreen = document.getElementById('whiteboard-screen');
const usernameInput = document.getElementById('username');
const roomNameInput = document.getElementById('roomName');
const isTeacherModeCheck = document.getElementById('isTeacherMode');
const joinBtn = document.getElementById('joinBtn');
const displayInfo = document.getElementById('display-info');
const toolSelect = document.getElementById('tool');
const colorPicker = document.getElementById('colorPicker');
const clearBtn = document.getElementById('clearBtn');
const exportBtn = document.getElementById('exportBtn');
const deleteObjBtn = document.getElementById('deleteObjBtn');
const lockBoardBtn = document.getElementById('lockBoardBtn');
const lockOverlay = document.getElementById('lock-overlay');
const submitBtn = document.getElementById('submitBtn');
const viewGalleryBtn = document.getElementById('viewGalleryBtn');
const galleryModal = document.getElementById('gallery-modal');
const galleryGrid = document.getElementById('gallery-grid');
const closeGalleryBtn = document.getElementById('closeGalleryBtn');

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
    
    let roleText = isTeacher ? '👨‍🏫 先生' : '👦 生徒';
    displayInfo.textContent = `グループ: ${myRoom} | なまえ: ${myName} (${roleText})`;

    // 先生・生徒でボタンの表示を切り替え
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

    // ツール切り替え（ロック中は切り替え無効）
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

    // オブジェクトの権限設定（超重要：他人のものは触らせない）
    function setPermissions(obj) {
        if (isTeacher) {
            // 先生は全員のものを触れる（神様モード）
            obj.set({ selectable: true, evented: true });
        } else {
            // 生徒は「自分のもの」しか触れない（いたずら防止）
            const isMine = (obj.author === myName);
            obj.set({ selectable: isMine, evented: isMine });
        }
    }

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

    // 削除処理
    deleteObjBtn.addEventListener('click', () => {
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length === 0) return;

        activeObjects.forEach(obj => {
            // 先生、または自分のオブジェクトなら消せる
            if (isTeacher || obj.author === myName) {
                canvas.remove(obj);
            }
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

    // 貼り付け処理
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
            setPermissions(object); // データ受信時にも権限を適用！
        });
    });

    // --- 🌟 先生用の新機能：ロック機能 ---
    if (isTeacher) {
        lockBoardBtn.addEventListener('click', () => {
            const willLock = !isLocked;
            socket.emit('lock-board', willLock);
            lockBoardBtn.textContent = willLock ? 'ロック解除' : '注目！(操作ロック)';
            lockBoardBtn.style.backgroundColor = willLock ? '#28a745' : '#dc3545';
            isLocked = willLock;
        });
    }

    // 生徒がロック信号を受け取った時
    socket.on('lock-board', (lockedState) => {
        if (!isTeacher) {
            isLocked = lockedState;
            if (isLocked) {
                lockOverlay.style.display = 'flex'; // グレーアウト画面を出す
                canvas.discardActiveObject(); // 選択を解除
                canvas.isDrawingMode = false;
            } else {
                lockOverlay.style.display = 'none';
                if (toolSelect.value === 'draw') canvas.isDrawingMode = true;
            }
        }
    });

    // --- 🌟 提出機能（オクリンク風） ---
    // 生徒が提出ボタンを押す
    submitBtn.addEventListener('click', () => {
        // 現在のキャンバスを画像データに変換
        const dataURL = canvas.toDataURL({ format: 'png', quality: 0.8 });
        socket.emit('submit-work', { author: myName, image: dataURL, time: new Date().toLocaleTimeString() });
        
        // ボタンを一時的に変更して安心感を出す
        const originalText = submitBtn.textContent;
        submitBtn.textContent = '✅ 提出しました！';
        submitBtn.style.backgroundColor = '#28a745';
        setTimeout(() => {
            submitBtn.textContent = originalText;
            submitBtn.style.backgroundColor = '#ff9800';
        }, 2000);
    });

    // 先生が提出物を受信・表示する
    socket.on('receive-submission', (data) => {
        if (!isTeacher) return; // 先生以外は無視

        // 既に同じ生徒の枠があれば画像を差し替え、なければ新しく枠を作る
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

    // ギャラリーの開閉
    viewGalleryBtn.addEventListener('click', () => galleryModal.style.display = 'block');
    closeGalleryBtn.addEventListener('click', () => galleryModal.style.display = 'none');

    // ぜんぶけす機能
    clearBtn.addEventListener('click', () => {
        if(confirm('ほんとうに ぜんぶ けしますか？')) {
            canvas.clear();
            socket.emit('clear-canvas');
        }
    });
    socket.on('clear-canvas', () => canvas.clear());

    // エクスポート機能
    exportBtn.addEventListener('click', () => { /* 省略せず前と同じ処理を実行 */
        const objects = canvas.getObjects();
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
        csvContent += "作成者,タイプ,内容,作成日時\n";
        objects.forEach(obj => {
            const author = obj.author || '不明';
            let typeStr = 'その他';
            if (obj.type === 'path') typeStr = '手書きメモ';
            if (obj.type === 'i-text' || obj.type === 'text') typeStr = 'テキスト';
            if (obj.type === 'image') typeStr = '貼り付け画像';
            let content = obj.text ? obj.text.replace(/(\r\n|\n|\r)/gm, " ") : "（データ）";
            const timestamp = obj.timestamp || '不明';
            csvContent += `"${author}","${typeStr}","${content}","${timestamp}"\n`;
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