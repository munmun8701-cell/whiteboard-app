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

function getEl(id) { return document.getElementById(id); }

// フォントサイズ変更機能
function changeFontSize() {
    if(!canvas) return;
    const sizeEl = getEl('fontSizeSelect');
    const size = sizeEl ? parseInt(sizeEl.value, 10) : 24;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length > 0) {
        activeObjects.forEach(obj => {
            if (obj.type === 'i-text' || obj.type === 'textbox') {
                obj.set('fontSize', size);
                if (obj.isVerticalText) obj.set('width', size + 10);
            }
        });
        canvas.renderAll();
        emitCanvasData();
    }
}

// 縦書き時の自動改列と手動改列（行替え）機能
function fixVerticalText(obj) {
    if (!obj || !obj.text || !obj.isVerticalText) return;
    
    if (obj.text.includes('\n')) {
        const parts = obj.text.split('\n');
        obj.set('text', parts[0]);
        
        let currentObj = obj;
        for (let i = 1; i < parts.length; i++) {
            const offsetLeft = currentObj.fontSize + 16;
            const newObj = new fabric.Textbox(parts[i] || '', {
                left: currentObj.left - offsetLeft,
                top: currentObj.top,
                width: currentObj.fontSize + 10,
                fontSize: currentObj.fontSize,
                fill: currentObj.fill,
                author: currentObj.author,
                timestamp: new Date().toLocaleString(),
                splitByGrapheme: true,
                isVerticalText: true
            });
            setPermissions(newObj);
            canvas.add(newObj);
            newObj.on('changed', () => fixVerticalText(newObj));
            currentObj = newObj;
        }
        
        canvas.setActiveObject(currentObj);
        currentObj.enterEditing();
        
        let original = obj.text;
        let fixed = original.replace(/、/g, '︑').replace(/。/g, '︒').replace(/「/g, '﹃').replace(/」/g, '﹄').replace(/ー/g, '丨');
        if (original !== fixed) obj.set('text', fixed);
        if (canvas) canvas.renderAll();
        emitCanvasData();
        return;
    }

    obj.initDimensions();
    const MAX_HEIGHT = 400; 
    if (obj.height > MAX_HEIGHT && obj.text.length > 1) {
        const lastChar = obj.text.slice(-1);
        obj.set('text', obj.text.slice(0, -1)); 
        
        const offsetLeft = obj.fontSize + 16;
        const newObj = new fabric.Textbox(lastChar, {
            left: obj.left - offsetLeft,
            top: obj.top,
            width: obj.fontSize + 10,
            fontSize: obj.fontSize,
            fill: obj.fill,
            author: obj.author,
            timestamp: new Date().toLocaleString(),
            splitByGrapheme: true,
            isVerticalText: true
        });
        setPermissions(newObj);
        canvas.add(newObj);
        newObj.on('changed', () => fixVerticalText(newObj));
        
        canvas.setActiveObject(newObj);
        newObj.enterEditing();
        newObj.selectionStart = 1;
        newObj.selectionEnd = 1;
        
        if (canvas) canvas.renderAll();
        emitCanvasData();
        return;
    }

    const original = obj.text;
    const fixed = original.replace(/、/g, '︑').replace(/。/g, '︒').replace(/「/g, '﹃').replace(/」/g, '﹄').replace(/ー/g, '丨');
    if (original !== fixed) { obj.set('text', fixed); if (canvas) canvas.renderAll(); }
}

function joinRoom() {
    myName = getEl('username') ? getEl('username').value.trim() : 'ななし';
    myRoom = getEl('roomName') ? getEl('roomName').value.trim() : 'room1';
    isTeacher = getEl('isTeacherMode') ? getEl('isTeacherMode').checked : false;

    if (!myName || !myRoom) return alert('なまえ と あいことば をいれてね！');

    socket.emit('join-room', myRoom);
    if(getEl('login-screen')) getEl('login-screen').style.display = 'none';
    if(getEl('whiteboard-screen')) getEl('whiteboard-screen').style.display = 'block';
    
    const submitBtn = getEl('submitBtn');
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
    const container = getEl('page-list');
    if (!container) return;
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
    if(canvas) canvas.clear();
    socket.emit('switch-page', pageNumber);
}

function addPage() {
    maxPage++;
    switchPage(maxPage);
}

function setPermissions(obj) {
    if (isTeacher) {
        obj.set({ selectable: true, evented: true });
    } else {
        const isMine = (obj.author === myName);
        obj.set({ selectable: isMine, evented: isMine });
    }
}

function getScrollOffset() {
    const wrapper = getEl('canvas-wrapper'); 
    if (!wrapper) return { x: 100, y: 100 };
    return { x: wrapper.scrollLeft + 100, y: wrapper.scrollTop + 100 };
}

function createBoardFrame(type) {
    if(!canvas) return;
    const isVertical = (getEl('textDirection') && getEl('textDirection').value === 'v');
    const isGaku = (type === '学');
    const color = isGaku ? '#1e88e5' : '#dc3545';
    const offset = getScrollOffset();

    const circle = new fabric.Circle({ radius: 20, fill: 'white', stroke: color, strokeWidth: 4, originX: 'center', originY: 'center' });
    const text = new fabric.Text(type, { fontSize: 24, fill: color, fontWeight: 'bold', originX: 'center', originY: 'center' });
    const badge = new fabric.Group([circle, text], { left: -20, top: -20 });
    const rect = new fabric.Rect({ left: 0, top: 0, width: 450, height: 120, fill: 'transparent', stroke: color, strokeWidth: 4, rx: 8, ry: 8 });

    const frameGroup = new fabric.Group([rect, badge], { left: offset.x, top: offset.y, author: myName, timestamp: new Date().toLocaleString() });
    setPermissions(frameGroup);
    canvas.add(frameGroup);

    const sizeEl = getEl('fontSizeSelect');
    const fontSize = sizeEl ? parseInt(sizeEl.value, 10) : 24;
    const placeholder = isGaku ? 'めあてを入力...' : 'まとめを入力...';
    
    let innerText;
    if (isVertical) {
        innerText = new fabric.Textbox(placeholder.replace('を', 'を\n'), { left: offset.x + 40, top: offset.y + 30, fontSize: fontSize, fill: '#333', author: myName, width: fontSize + 10, splitByGrapheme: true, isVerticalText: true });
        innerText.on('changed', () => fixVerticalText(innerText));
        fixVerticalText(innerText);
    } else {
        innerText = new fabric.IText(placeholder, { left: offset.x + 40, top: offset.y + 30, fontSize: fontSize, fill: '#333', author: myName });
    }
    
    setPermissions(innerText);
    canvas.add(innerText);

    const toolEl = getEl('tool');
    if (toolEl) toolEl.value = 'select';
    canvas.isDrawingMode = false;
    emitCanvasData();
}

function addSticky() {
    if(!canvas) return;
    const isVertical = (getEl('textDirection') && getEl('textDirection').value === 'v');
    const colorEl = getEl('stickyColor');
    const selectedColor = colorEl ? colorEl.value : '#fff9c4';
    const sizeEl = getEl('fontSizeSelect');
    const fontSize = sizeEl ? parseInt(sizeEl.value, 10) : 22;
    const offset = getScrollOffset();

    const commonOpts = {
        left: offset.x + Math.random() * 50, top: offset.y + Math.random() * 50,
        fontSize: fontSize, padding: 15, backgroundColor: selectedColor, fill: '#333', author: myName, timestamp: new Date().toLocaleString(),
        shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.3)', blur: 5, offsetX: 3, offsetY: 3 })
    };

    let stickyText;
    if (isVertical) {
        commonOpts.width = fontSize + 10;
        commonOpts.splitByGrapheme = true;
        commonOpts.isVerticalText = true;
        stickyText = new fabric.Textbox('ここに入力', commonOpts);
        stickyText.on('changed', () => fixVerticalText(stickyText));
        fixVerticalText(stickyText);
    } else {
        stickyText = new fabric.IText('ここに入力', commonOpts);
    }

    setPermissions(stickyText);
    canvas.add(stickyText);
    canvas.setActiveObject(stickyText);
    stickyText.enterEditing();
    stickyText.selectAll();
    
    const toolEl = getEl('tool');
    if (toolEl) toolEl.value = 'select';
    canvas.isDrawingMode = false;
    emitCanvasData();
}

function deleteSelected() {
    if(!canvas) return;
    const activeObjects = canvas.getActiveObjects();
    if (activeObjects.length === 0) {
        alert('消したいものを「👆えらぶ・うごかす」ツールでクリックして選んでから、けすボタンを押してね！');
        return;
    }
    
    let deletedSomething = false;
    let notYours = false;

    activeObjects.forEach(obj => {
        if (isTeacher || obj.author === myName) {
            canvas.remove(obj);
            deletedSomething = true;
        } else {
            notYours = true;
        }
    });

    if (deletedSomething) {
        canvas.discardActiveObject();
        emitCanvasData();
    }
    if (notYours) {
        alert('ほかの人がかいたものは、けせません！');
    }
}

function clearAll() {
    if(!canvas) return;
    if (confirm(`ほんとうに ページ ${currentPage} のデータを ぜんぶ けしますか？`)) {
        canvas.clear();
        canvas.backgroundColor = '#ffffff'; 
        socket.emit('clear-canvas'); 
        emitCanvasData(); 
    }
}

function toggleLock() {
    isLocked = !isLocked;
    socket.emit('lock-board', isLocked);
    const btn = getEl('lockBoardBtn');
    if (btn) {
        btn.textContent = isLocked ? 'ロック解除' : '注目！';
        btn.style.backgroundColor = isLocked ? '#28a745' : '#dc3545';
    }
}

function submitWork() {
    if(!canvas) return;
    const dataURL = canvas.toDataURL({ format: 'png', quality: 0.8 });
    socket.emit('submit-work', { author: `${myName} (P.${currentPage})`, image: dataURL, time: new Date().toLocaleTimeString() });
    const btn = getEl('submitBtn');
    if (btn) {
        const originalText = btn.textContent;
        btn.textContent = '✅ 提出しました！';
        btn.style.backgroundColor = '#28a745';
        setTimeout(() => { btn.textContent = originalText; btn.style.backgroundColor = '#ff9800'; }, 2000);
    }
}

function exportPDF() {
    if(!canvas) return;
    if (typeof window.jspdf === 'undefined') return alert('PDF作成プログラムが読み込まれていません。画面を更新してください。');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', format: 'a3' });
    
    canvas.backgroundColor = '#ffffff';
    canvas.renderAll();
    
    const imgData = canvas.toDataURL({ format: 'jpeg', quality: 0.8 });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`ボード記録_ページ${currentPage}_${myRoom}.pdf`);
}

function emitCanvasData() {
    if (isReceiving || !canvas) return;
    const objectsToSave = canvas.getObjects().filter(obj => obj.author);
    const json = { objects: objectsToSave.map(obj => obj.toObject(['author', 'timestamp', 'isVerticalText'])) };
    socket.emit('canvas-data', { page: currentPage, canvas: json });
}

function initCanvas() {
    canvas = new fabric.Canvas('canvas', { 
        isDrawingMode: false,
        backgroundColor: '#ffffff'
    });
    
    if(getEl('tool')) getEl('tool').value = 'select';

    getEl('tool')?.addEventListener('change', (e) => {
        if (isLocked && !isTeacher) {
            canvas.isDrawingMode = false;
            return;
        }
        canvas.isDrawingMode = (e.target.value === 'draw');
    });

    getEl('colorPicker')?.addEventListener('change', (e) => {
        canvas.freeDrawingBrush.color = e.target.value;
    });

    canvas.on('mouse:move', (options) => {
        const toolEl = getEl('tool');
        if (toolEl && toolEl.value === 'pointer') {
            const pointer = canvas.getPointer(options.e);
            socket.emit('pointer-move', { author: myName, page: currentPage, x: pointer.x, y: pointer.y });
        }
    });

    canvas.on('mouse:down', (options) => {
        const toolEl = getEl('tool');
        if (toolEl && toolEl.value === 'text' && !canvas.isDrawingMode) {
            const isVertical = (getEl('textDirection') && getEl('textDirection').value === 'v');
            const pointer = canvas.getPointer(options.e);
            const colorEl = getEl('colorPicker');
            const sizeEl = getEl('fontSizeSelect');
            const fontSize = sizeEl ? parseInt(sizeEl.value, 10) : 24;
            
            const opts = { left: pointer.x, top: pointer.y, fill: colorEl ? colorEl.value : '#000', fontSize: fontSize, author: myName, timestamp: new Date().toLocaleString() };
            
            let textObj;
            if (isVertical) {
                opts.splitByGrapheme = true;
                opts.width = fontSize + 10;
                opts.isVerticalText = true;
                textObj = new fabric.Textbox('ここに入力', opts);
                textObj.on('changed', () => fixVerticalText(textObj));
                fixVerticalText(textObj);
            } else {
                textObj = new fabric.IText('ここに入力', opts);
            }

            setPermissions(textObj);
            canvas.add(textObj);
            canvas.setActiveObject(textObj);
            textObj.enterEditing();
            textObj.selectAll();
            emitCanvasData();
            
            toolEl.value = 'select'; 
            canvas.isDrawingMode = false;
        }
    });

    canvas.on('path:created', (options) => {
        options.path.set({ author: myName, timestamp: new Date().toLocaleString() });
        setPermissions(options.path);
        emitCanvasData();
    });

    canvas.on('object:modified', () => emitCanvasData());

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
                        
                        const toolEl = getEl('tool');
                        if (toolEl) toolEl.value = 'select';
                        canvas.isDrawingMode = false;
                        emitCanvasData();
                    }
                };
                reader.readAsDataURL(blob);
            }
        }
    });
}

window.addEventListener('DOMContentLoaded', () => {
    getEl('joinBtn')?.addEventListener('click', joinRoom);
    getEl('addPageBtn')?.addEventListener('click', addPage);
    getEl('deleteObjBtn')?.addEventListener('click', deleteSelected);
    getEl('addStickyBtn')?.addEventListener('click', addSticky);
    getEl('submitBtn')?.addEventListener('click', submitWork);
    
    getEl('addGakuBtn')?.addEventListener('click', () => createBoardFrame('学'));
    getEl('addMaBtn')?.addEventListener('click', () => createBoardFrame('ま'));
    getEl('lockBoardBtn')?.addEventListener('click', toggleLock);
    getEl('viewGalleryBtn')?.addEventListener('click', () => {
        const m = getEl('gallery-modal');
        if (m) m.style.display = 'block';
    });
    getEl('closeGalleryBtn')?.addEventListener('click', () => {
        const m = getEl('gallery-modal');
        if (m) m.style.display = 'none';
    });
    getEl('exportPdfBtn')?.addEventListener('click', exportPDF);
    getEl('clearBtn')?.addEventListener('click', clearAll);
});

// --- 通信を受け取る処理 ---

socket.on('canvas-data', (data) => {
    const targetPage = data.page || 1;
    if (targetPage > maxPage) { maxPage = targetPage; renderPageButtons(); }
    if (targetPage !== currentPage) return; 

    isReceiving = true;
    const canvasRaw = data.canvas || data;
    
    if (!canvasRaw || Object.keys(canvasRaw).length === 0) {
         if(canvas) {
             canvas.clear();
             canvas.backgroundColor = '#ffffff'; 
         }
         isReceiving = false;
         return;
    }

    if(canvas) {
        canvas.loadFromJSON(canvasRaw, () => {
            canvas.backgroundColor = '#ffffff'; 
            canvas.getObjects().forEach(obj => {
                if (obj.isVerticalText) obj.on('changed', () => fixVerticalText(obj));
            });
            canvas.renderAll();
            isReceiving = false;
        }, (o, object) => {
            object.set('author', o.author);
            object.set('timestamp', o.timestamp);
            if (o.isVerticalText !== undefined) object.set('isVerticalText', o.isVerticalText);
            setPermissions(object);
        });
    }
});

socket.on('pointer-move', (data) => {
    if(!canvas) return;
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

socket.on('clear-canvas-local', () => { 
    if(canvas) {
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
        canvas.renderAll();
    }
});

socket.on('lock-board', (lockedState) => {
    if (!isTeacher) {
        isLocked = lockedState;
        const overlay = getEl('lock-overlay');
        if (isLocked) {
            if (overlay) overlay.style.display = 'flex';
            if(canvas) {
                canvas.discardActiveObject();
                canvas.isDrawingMode = false;
            }
        } else {
            if (overlay) overlay.style.display = 'none';
            const toolEl = getEl('tool');
            if (toolEl && toolEl.value === 'draw' && canvas) canvas.isDrawingMode = true;
        }
    }
});

socket.on('receive-submission', (data) => {
    if (!isTeacher) return;
    const grid = getEl('gallery-grid');
    if (!grid) return;
    let existingImg = getEl('sub-img-' + data.author);
    if (existingImg) {
        existingImg.src = data.image;
        getEl('sub-time-' + data.author).textContent = '更新: ' + data.time;
    } else {
        const div = document.createElement('div');
        div.className = 'gallery-item';
        div.innerHTML = `<h3 style="margin:0 0 10px 0; color:#333;">👦 ${data.author}</h3><img id="sub-img-${data.author}" src="${data.image}" alt="提出物"><p id="sub-time-${data.author}" style="color:#666; font-size:14px; margin:5px 0 0 0;">提出: ${data.time}</p>`;
        grid.appendChild(div);
    }
});