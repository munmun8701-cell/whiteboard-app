const socket = io();
let canvas;
let isReceiving = false;
let myName = '';
let myRoom = '';
let isTeacher = false;
let isLocked = false;
let remotePointers = {};
let currentPage = 1;
let maxPage = 1;

// 🌟最強の防御：ボタンが無い時にエラーを出さないための魔法の関数
function safeAddListener(id, eventType, callback) {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener(eventType, callback);
    }
}

// 画面が読み込まれたら、存在するボタンにだけ機能をセットする
window.onload = () => {
    safeAddListener('joinBtn', 'click', joinRoom);
    safeAddListener('addPageBtn', 'click', addPage);
    safeAddListener('deleteObjBtn', 'click', deleteSelected);
    safeAddListener('addStickyBtn', 'click', addSticky);
    safeAddListener('submitBtn', 'click', submitWork);
    
    // 先生用ボタン
    safeAddListener('addGakuBtn', 'click', () => createBoardFrame('学'));
    safeAddListener('addMaBtn', 'click', () => createBoardFrame('ま'));
    safeAddListener('lockBoardBtn', 'click', toggleLock);
    safeAddListener('viewGalleryBtn', 'click', () => {
        const modal = document.getElementById('gallery-modal');
        if (modal) modal.style.display = 'block';
    });
    safeAddListener('closeGalleryBtn', 'click', () => {
        const modal = document.getElementById('gallery-modal');
        if (modal) modal.style.display = 'none';
    });
    safeAddListener('exportPdfBtn', 'click', exportPDF);
    safeAddListener('clearBtn', 'click', clearAll);
};

function joinRoom() {
    const userEl = document.getElementById('username');
    const roomEl = document.getElementById('roomName');
    const teacherEl = document.getElementById('isTeacherMode');
    
    myName = userEl ? userEl.value.trim() : 'ななし';
    myRoom = roomEl ? roomEl.value.trim() : 'room1';
    isTeacher = teacherEl ? teacherEl.checked : false;

    if (!myName || !myRoom) return alert('なまえ と あいことば をいれてね！');

    socket.emit('join-room', myRoom);
    
    const loginScreen = document.getElementById('login-screen');
    const wbScreen = document.getElementById('whiteboard-screen');
    if (loginScreen) loginScreen.style.display = 'none';
    if (wbScreen) wbScreen.style.display = 'block';
    
    const submitBtn = document.getElementById('submitBtn');
    if (isTeacher) {
        document.querySelectorAll('.teacher-only').forEach(el => el.style.display = 'inline-block');
        if (submitBtn) submitBtn.style.display = 'none';
    } else {
        if (submitBtn) submitBtn.style.display = 'inline-block';
        document.querySelectorAll('.teacher-only').forEach(el => el.style.display = 'none');
    }

    renderPageButtons();
    initCanvas();
}

function renderPageButtons() {
    const container = document.getElementById('page-list');
    if (!container) return; // ページ機能がHTMLになければ安全に無視する
    container.innerHTML = '';
    for (let i = 1; i <= maxPage; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => { if (i !== currentPage) switchPage(i); };
        container.appendChild(btn);
    }
}

function switchPage(pageNumber) {
    currentPage = pageNumber;
    renderPageButtons();
    if (canvas) canvas.clear();
    socket.emit('switch-page', pageNumber);
}

function addPage() {
    maxPage++;
    switchPage(maxPage);
}

function initCanvas() {
    canvas = new fabric.Canvas('canvas', { isDrawingMode: false });

    safeAddListener('tool', 'change', (e) => {
        if (isLocked && !isTeacher) return (canvas.isDrawingMode = false);
        canvas.isDrawingMode = (e.target.value === 'draw');
    });

    safeAddListener('colorPicker', 'change', (e) => {
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

    function getScrollOffset() {
        const wrapper = document.getElementById('canvas-wrapper'); 
        if (!wrapper) return { x: 100, y: 100 };
        return { x: wrapper.scrollLeft + 100, y: wrapper.scrollTop + 100 };
    }

    window.createBoardFrame = function(type) {
        const isGaku = (type === '学');
        const color = '#1e88e5'; 
        const offset = getScrollOffset();

        const circle = new fabric.Circle({ radius: 20, fill: 'white', stroke: color, strokeWidth: 4, originX: 'center', originY: 'center' });
        const text = new fabric.Text(type, { fontSize: 24, fill: color, fontWeight: 'bold', originX: 'center', originY: 'center' });
        const badge = new fabric.Group([circle, text], { left: -20, top: -20 });
        const rect = new fabric.Rect({ left: 0, top: 0, width: 450, height: 120, fill: 'transparent', stroke: color, strokeWidth: 4, rx: 8, ry: 8 });

        const frameGroup = new fabric.Group([rect, badge], { left: offset.x, top: offset.y, author: myName, timestamp: new Date().toLocaleString() });
        setPermissions(frameGroup);
        canvas.add(frameGroup);

        const innerText = new fabric.IText(isGaku ? 'めあてを入力...' : 'まとめを入力...', { left: offset.x + 40, top: offset.y + 30, fontSize: 24, fill: '#333', author: myName });
        setPermissions(innerText);
        canvas.add(innerText);

        const toolEl = document.getElementById('tool');
        if (toolEl) toolEl.value = 'select';
        canvas.isDrawingMode = false;
        emitCanvasData();
    };

    window.addSticky = function() {
        const colorEl = document.getElementById('stickyColor');
        const selectedColor = colorEl ? colorEl.value : '#fff9c4';
        const offset = getScrollOffset();

        const stickyText = new fabric.IText('ここに入力', {
            left: offset.x + Math.random() * 50, top: offset.y + Math.random() * 50,
            fontSize: 22, padding: 15, backgroundColor: selectedColor, fill: '#333', author: myName, timestamp: new Date().toLocaleString(),
            shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 5, offsetX: 3, offsetY: 3 })
        });
        setPermissions(stickyText);
        canvas.add(stickyText);
        canvas.setActiveObject(stickyText);
        stickyText.enterEditing();
        stickyText.selectAll();
        
        const toolEl = document.getElementById('tool');
        if (toolEl) toolEl.value = 'select';
        canvas.isDrawingMode = false;
        emitCanvasData();
    };

    canvas.on('mouse:move', (options) => {
        const toolEl = document.getElementById('tool');
        if (toolEl && toolEl.value === 'pointer') {
            const pointer = canvas.getPointer(options.e);
            socket.emit('pointer-move', { author: myName, page: currentPage, x: pointer.x, y: pointer.y });
        }
    });

    socket.on('pointer-move', (data) => {
        if (data.page !== currentPage) return;
        if (!remotePointers[data.author]) {
            const circle = new fabric.Circle({ radius: 8, fill: 'red', originX: 'center', originY: 'center', shadow: new fabric.Shadow({ color: 'red', blur: 10 }) });
            const nameText = new fabric.Text(data.author, { fontSize: 16, fill: 'red', top: 15, originX: 'center', fontWeight: 'bold' });
            const pointerGroup = new fabric.Group([circle, nameText], { selectable: false, evented: false });
            canvas.add(pointerGroup);
            remotePointers[data.author] = { group: pointerGroup, timeout: null };
        }
        const p = remotePointers[data.author];
        p.group.set({ left: data.x, top: data.y });
        canvas.renderAll();

        clearTimeout(p.timeout);
        p.timeout = setTimeout(() => { canvas.remove(p.group); delete remotePointers[data.author]; canvas.renderAll(); }, 2000);
    });

    canvas.on('mouse:down', (options) => {
        const toolEl = document.getElementById('tool');
        if (toolEl && toolEl.value === 'text' && !canvas.isDrawingMode) {
            const pointer = canvas.getPointer(options.e);
            const colorEl = document.getElementById('colorPicker');
            const text = new fabric.IText('ここに入力', { left: pointer.x, top: pointer.y, fill: colorEl ? colorEl.value : '#000', fontSize: 24, author: myName, timestamp: new Date().toLocaleString() });
            setPermissions(text);
            canvas.add(text);
            canvas.setActiveObject(text);
            text.enterEditing();
            text.selectAll();
            emitCanvasData();
            toolEl.value = 'select'; 
        }
    });

    canvas.on('path:created', (options) => {
        options.path.set({ author: myName, timestamp: new Date().toLocaleString() });
        setPermissions(options.path);
        emitCanvasData();
    });

    canvas.on('object:modified', () => emitCanvasData());

    window.deleteSelected = function() {
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length === 0) return;
        activeObjects.forEach(obj => { if (isTeacher || obj.author === myName) canvas.remove(obj); });
        canvas.discardActiveObject();
        emitCanvasData();
    };

    window.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && e.target.tagName !== 'INPUT' && !canvas.getActiveObject()?.isEditing) {
            deleteSelected();
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
                reader.onload = (event) => {
                    const imgObj = new Image();
                    imgObj.src = event.target.result;
                    imgObj.onload = () => {
                        const image = new fabric.Image(imgObj);
                        const offset = getScrollOffset(); 
                        image.set({ left: offset.x, top: offset.y, author: myName, timestamp: new Date().toLocaleString() });
                        if (image.width > 600) image.scaleToWidth(600);
                        setPermissions(image);
                        canvas.add(image);
                        canvas.setActiveObject(image);
                        const toolEl = document.getElementById('tool');
                        if (toolEl) toolEl.value = 'select';
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
        const objectsToSave = canvas.getObjects().filter(obj => obj.author);
        const json = { objects: objectsToSave.map(obj => obj.toObject(['author', 'timestamp'])) };
        socket.emit('canvas-data', { page: currentPage, canvas: json });
    }

    socket.on('canvas-data', (data) => {
        const targetPage = data.page || 1;
        if (targetPage > maxPage) { maxPage = targetPage; renderPageButtons(); }
        if (targetPage !== currentPage) return; 

        isReceiving = true;
        const canvasRaw = data.canvas || data;
        
        if (!canvasRaw || Object.keys(canvasRaw).length === 0) {
             canvas.clear();
             isReceiving = false;
             return;
        }

        canvas.loadFromJSON(canvasRaw, () => {
            canvas.renderAll();
            isReceiving = false;
        }, (o, object) => {
            object.set('author', o.author);
            object.set('timestamp', o.timestamp);
            setPermissions(object);
        });
    });

    window.clearAll = function() {
        if (confirm(`ほんとうに ページ ${currentPage} のデータを ぜんぶ けしますか？`)) {
            canvas.clear();
            socket.emit('clear-canvas'); 
            emitCanvasData(); 
        }
    };
    socket.on('clear-canvas-local', () => canvas.clear());

    window.toggleLock = function() {
        isLocked = !isLocked;
        socket.emit('lock-board', isLocked);
        const btn = document.getElementById('lockBoardBtn');
        if (btn) {
            btn.textContent = isLocked ? 'ロック解除' : '注目！';
            btn.style.backgroundColor = isLocked ? '#28a745' : '#dc3545';
        }
    };

    socket.on('lock-board', (lockedState) => {
        if (!isTeacher) {
            isLocked = lockedState;
            const overlay = document.getElementById('lock-overlay');
            if (isLocked) {
                if (overlay) overlay.style.display = 'flex';
                canvas.discardActiveObject();
                canvas.isDrawingMode = false;
            } else {
                if (overlay) overlay.style.display = 'none';
                const toolEl = document.getElementById('tool');
                if (toolEl && toolEl.value === 'draw') canvas.isDrawingMode = true;
            }
        }
    });

    window.submitWork = function() {
        const dataURL = canvas.toDataURL({ format: 'png', quality: 0.8 });
        socket.emit('submit-work', { author: `${myName} (P.${currentPage})`, image: dataURL, time: new Date().toLocaleTimeString() });
        const btn = document.getElementById('submitBtn');
        if (btn) {
            const originalText = btn.textContent;
            btn.textContent = '✅ 提出しました！';
            btn.style.backgroundColor = '#28a745';
            setTimeout(() => { btn.textContent = originalText; btn.style.backgroundColor = '#ff9800'; }, 2000);
        }
    };

    socket.on('receive-submission', (data) => {
        if (!isTeacher) return;
        const grid = document.getElementById('gallery-grid');
        if (!grid) return;
        let existingImg = document.getElementById('sub-img-' + data.author);
        if (existingImg) {
            existingImg.src = data.image;
            document.getElementById('sub-time-' + data.author).textContent = '更新: ' + data.time;
        } else {
            const div = document.createElement('div');
            div.className = 'gallery-item';
            div.innerHTML = `<h3 style="margin:0 0 10px 0; color:#333;">👦 ${data.author}</h3><img id="sub-img-${data.author}" src="${data.image}" alt="提出物"><p id="sub-time-${data.author}" style="color:#666; font-size:14px; margin:5px 0 0 0;">提出: ${data.time}</p>`;
            grid.appendChild(div);
        }
    });

    window.exportPDF = function() {
        if (typeof window.jspdf === 'undefined') return alert('PDF作成プログラムが読み込まれていません。画面を更新してください。');
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'landscape', format: 'a3' });
        const imgData = canvas.toDataURL({ format: 'jpeg', quality: 0.8 });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`ボード記録_ページ${currentPage}_${myRoom}.pdf`);
    };
}