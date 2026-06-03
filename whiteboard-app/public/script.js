const socket = io();
let canvas;
let isReceiving = false;
let myName = '';
let myRoom = '';
let currentPage = 1;

const loginScreen = document.getElementById('login-screen');
const whiteboardScreen = document.getElementById('whiteboard-screen');
const usernameInput = document.getElementById('username');
const roomNameInput = document.getElementById('roomName');
const joinBtn = document.getElementById('joinBtn');
const toolSelect = document.getElementById('tool');
const colorPicker = document.getElementById('colorPicker');
const clearBtn = document.getElementById('clearBtn');
const deleteObjBtn = document.getElementById('deleteObjBtn');

const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageDisplay = document.getElementById('pageDisplay');
const uploadBtn = document.getElementById('uploadBtn');
const imageUpload = document.getElementById('imageUpload');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');

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
    changePage(1);
});

function changePage(pageNumber) {
    currentPage = pageNumber;
    pageDisplay.textContent = `${currentPage}ページ目`;
    const roomWithPage = `${myRoom}_page_${currentPage}`;
    socket.emit('join-room', roomWithPage);
}

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) changePage(currentPage - 1);
});

nextPageBtn.addEventListener('click', () => {
    changePage(currentPage + 1);
});

function initCanvas() {
    canvas = new fabric.Canvas('canvas', { isDrawingMode: true });
    
    // PDF保存時に背景が黒くならないように白く塗っておく
    canvas.backgroundColor = '#ffffff';
    canvas.renderAll();

    toolSelect.addEventListener('change', (e) => {
        canvas.isDrawingMode = (e.target.value === 'draw');
    });

    colorPicker.addEventListener('change', (e) => {
        canvas.freeDrawingBrush.color = e.target.value;
    });

    canvas.on('mouse:down', function(options) {
        if (!canvas.isDrawingMode) {
            const pointer = canvas.getPointer(options.e);
            
            // 普通の文字入力
            if (toolSelect.value === 'text') {
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
            
            // 🌟 新機能：ふせん（背景が黄色い文字）
            if (toolSelect.value === 'sticky') {
                const sticky = new fabric.IText('ふせん', {
                    left: pointer.x, top: pointer.y, 
                    fill: '#333333', backgroundColor: '#ffff99', 
                    fontSize: 24, padding: 10,
                    shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.2)', blur: 5, offsetX: 2, offsetY: 2 })
                });
                canvas.add(sticky);
                canvas.setActiveObject(sticky);
                sticky.enterEditing();
                sticky.selectAll();
                emitCanvasData();
                toolSelect.value = 'select'; 
            }
        }
    });

    canvas.on('path:created', () => emitCanvasData());
    canvas.on('object:modified', () => emitCanvasData());

    deleteObjBtn.addEventListener('click', () => {
        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length > 0) {
            activeObjects.forEach(obj => canvas.remove(obj));
            canvas.discardActiveObject();
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

    uploadBtn.addEventListener('click', () => imageUpload.click());

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
                if (image.width > 600) image.scaleToWidth(600);
                canvas.add(image);
                canvas.setActiveObject(image);
                toolSelect.value = 'select';
                canvas.isDrawingMode = false;
                emitCanvasData();
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

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

    // 🌟 エクセル(CSV)保存機能の復活
    exportCsvBtn.addEventListener('click', () => {
        const objects = canvas.getObjects();
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
        csvContent += "タイプ,内容\n";
        
        objects.forEach(obj => {
            let typeStr = 'その他';
            if (obj.type === 'path') typeStr = '手書きメモ';
            if (obj.type === 'i-text' || obj.type === 'text') typeStr = 'テキスト/ふせん';
            if (obj.type === 'image') typeStr = '貼り付け画像';

            let content = obj.text ? obj.text.replace(/(\r\n|\n|\r)/gm, " ") : "（データ）";
            csvContent += `"${typeStr}","${content}"\n`;
        });
        
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${myRoom}_${currentPage}ページ目.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // 🌟 新機能：PDF保存機能
    exportPdfBtn.addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        // A4サイズ・横向きでPDFを作成
        const pdf = new jsPDF({ orientation: 'landscape' });
        
        // ホワイトボードを画像化
        const imgData = canvas.toDataURL({ format: 'jpeg', quality: 1.0 });
        
        // PDFの幅に合わせて画像を貼り付け
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`${myRoom}_${currentPage}ページ目.pdf`);
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
            canvas.backgroundColor = '#ffffff'; // 消したあとも白背景を維持
            socket.emit('clear-canvas');
        }
    });

    socket.on('clear-canvas', () => {
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
    });
}