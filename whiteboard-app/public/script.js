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

const addGakuBtn = document.getElementById('addGakuBtn');
const addMaBtn = document.getElementById('addMaBtn');
const addStickyBtn = document.getElementById('addStickyBtn');
const stickyColorSelect = document.getElementById('stickyColor');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const canvasWrapper = document.getElementById('canvas-wrapper');

const pageListContainer = document.getElementById('page-list');
const addPageBtn = document.getElementById('addPageBtn');

let timerInterval = null;
let currentSeconds = 300;
const timerWidget = document.getElementById('timer-widget');
const timerDisplay = document.getElementById('timer-display');
const timerPlusBtn = document.getElementById('timerPlusBtn');
const timerMinusBtn = document.getElementById('timerMinusBtn');
const timerStartBtn = document.getElementById('timerStartBtn');
const timerStopBtn = document.getElementById('timerStopBtn');

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
    timerWidget.style.display = 'block';
    
    if (isTeacher) {
        document.querySelectorAll('.teacher-only').forEach(el => el.style.display = 'inline-block');
        submitBtn.style.display = 'none';
        updateTimerDisplay();
        socket.emit('sync-timer', { action: 'update', seconds: currentSeconds });
    } else {
        submitBtn.style.display = 'inline-block';
    }

    renderPageButtons();
    initCanvas();
});

function renderPageButtons() {
    pageListContainer.innerHTML = '';
    for (let i = 1; i <= maxPage; i++) {
        const btn = document.createElement('button');
        btn.className = `page-btn ${i === currentPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.addEventListener('click', () => {
            if (i === currentPage) return;
            switchPage(i);
        });
        pageListContainer.appendChild(btn);
    }
}

function switchPage(pageNumber) {
    currentPage = pageNumber;
    renderPageButtons();
    canvas.clear();
    socket.emit('switch-page', pageNumber);
}

addPageBtn.addEventListener('click', () => {
    maxPage++;
    switchPage(maxPage);
});

function initCanvas() {
    canvas = new fabric.Canvas('canvas', { isDrawingMode: false });

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

    function getScrollOffset() {
        return { x: canvasWrapper.scrollLeft + 50, y: canvasWrapper.scrollTop + 50 };
    }

    function createBoardFrame(type) {
        const isGaku = (type === '学');
        const color = '#1e88e5'; 

        const circle = new fabric.Circle({ radius: 20, fill: 'white', stroke: color, strokeWidth: 4, originX: 'center', originY: 'center' });
        const text = new fabric.Text(type, { fontSize: 24, fill: color, fontWeight: 'bold', originX: 'center', originY: 'center' });
        const badge = new fabric.Group([circle, text], { left: -20, top: -20 });

        const rect = new fabric.Rect({ left: 0, top: 0, width: 450, height: 120, fill: 'transparent', stroke: color, strokeWidth: 4, rx: 8, ry: 8 });

        const offset = getScrollOffset();
        const frameGroup = new fabric.Group([rect, badge], { left: offset.x, top: offset.y, author: myName, timestamp: new Date().toLocaleString() });
        setPermissions(frameGroup);
        canvas.add(frameGroup);

        const innerText = new fabric.IText(isGaku ? 'めあてを入力...' : 'まとめを入力...', { left: offset.x + 40, top: offset.y + 30, fontSize: 24, fill: '#333', author: myName });
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

    addStickyBtn.addEventListener('click', () => {
        const selectedColor = stickyColorSelect.value;
        const offset = getScrollOffset();

        const stickyText = new fabric.IText('ここに入力', {
            left: offset.x + Math.random() * 100, top: offset.y + Math.random() * 100,
            fontSize: 22, padding: 15, backgroundColor: selectedColor, fill: '#333', author: myName, timestamp: new Date().toLocaleString(),
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

    if (isTeacher) {
        exportPdfBtn.addEventListener('click', () => {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'landscape', format: 'a3' });
            const imgData = canvas.toDataURL({ format: 'jpeg', quality: 0.8 });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`ボード記録_ページ${currentPage}_${myRoom}.pdf`);
        });
    }

    canvas.on('mouse:move', function(options) {
        if (toolSelect.value === 'pointer') {
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
        p.timeout = setTimeout(() => {
            canvas.remove(p.group);
            delete remotePointers[data.author];
            canvas.renderAll();
        }, 2000);
    });

    canvas.on('mouse:down', function(options) {
        if (toolSelect.value === 'pointer') return; 

        if (toolSelect.value === 'text' && !canvas.isDrawingMode) {
            const pointer = canvas.getPointer(options.e);
            const text = new fabric.IText('ここに入力', { left: pointer.x, top: pointer.y, fill: colorPicker.value, fontSize: 24, author: myName, timestamp: new Date().toLocaleString() });
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
                        const offset = getScrollOffset(); 
                        image.set({ left: offset.x, top: offset.y, author: myName, timestamp: new Date().toLocaleString() });
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
        const objectsToSave = canvas.getObjects().filter(obj => obj.author);
        const json = { objects: objectsToSave.map(obj => obj.toObject(['author', 'timestamp'])) };
        socket.emit('canvas-data', { page: currentPage, canvas: json });
    }

    socket.on('canvas-data', (data) => {
        const targetPage = data.page || 1;
        
        if (targetPage > maxPage) {
            maxPage = targetPage;
            renderPageButtons();
        }

        if (targetPage !== currentPage) return; 

        isReceiving = true;
        const canvasRaw = data.canvas ? data.canvas : data;
        canvas.loadFromJSON(canvasRaw, function() {
            canvas.renderAll();
            isReceiving = false;
        }, function(o, object) {
            object.set('author', o.author);
            object.set('timestamp', o.timestamp);
            setPermissions(object);
        });
    });

    socket.on('clear-canvas-local', () => {
        canvas.clear();
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
        socket.emit('submit-work', { author: `${myName} (P.${currentPage})`, image: dataURL, time: new Date().toLocaleTimeString() });
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
        if(confirm(`ほんとうに ページ ${currentPage} のデータを ぜんぶ けしますか？`)) {
            canvas.clear();
            socket.emit('clear-canvas');
        }
    });
    
    socket.on('clear-canvas', (data) => {
        if (data.page === currentPage) {
            canvas.clear();
        }
    });

    function updateTimerDisplay() {
        const m = Math.floor(currentSeconds / 60).toString().padStart(2, '0');
        const s = (currentSeconds % 60).toString().padStart(2, '0');
        timerDisplay.textContent = `${m}:${s}`;
        if (currentSeconds <= 10 && currentSeconds > 0) {
            timerDisplay.style.color = '#ff4444';
        } else {
            timerDisplay.style.color = 'white';
        }
    }

    if (isTeacher) {
        timerPlusBtn.addEventListener('click', () => {
            currentSeconds += 60;
            updateTimerDisplay();
            socket.emit('sync-timer', { action: 'update', seconds: currentSeconds });
        });
        
        timerMinusBtn.addEventListener('click', () => {
            if (currentSeconds >= 60) currentSeconds -= 60;
            updateTimerDisplay();
            socket.emit('sync-timer', { action: 'update', seconds: currentSeconds });
        });

        timerStartBtn.addEventListener('click', () => {
            socket.emit('sync-timer', { action: 'start' });
            startTimer();
        });

        timerStopBtn.addEventListener('click', () => {
            socket.emit('sync-timer', { action: 'stop' });
            stopTimer();
        });
    }

    function startTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            if (currentSeconds > 0) {
                currentSeconds--;
                updateTimerDisplay();
                if (isTeacher) {
                    socket.emit('sync-timer', { action: 'update', seconds: currentSeconds });
                }
            } else {
                stopTimer();
                if (isTeacher) alert('時間です！');
            }
        }, 1000);
    }

    function stopTimer() {
        clearInterval(timerInterval);
    }

    socket.on('sync-timer', (data) => {
        if (data.action === 'update') {
            currentSeconds = data.seconds;
            updateTimerDisplay();
        } else if (data.action === 'start') {
            startTimer();
        } else if (data.action === 'stop') {
            stopTimer();
        }
    });
}