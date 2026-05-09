gsap.defaults({ ease: "power2.out" });

let currentTool = 'select';
let selectedShapes = [];
let selectedWrappers = [];
let undoStack = [];
let grammarType = null;
let isInverted = false;
let draggedElement = null;
let dragOffset = { x: 0, y: 0 };
let patterns = new Map(); // 存储所有导入的 SVG

const patternContainer = document.getElementById('pattern-container');
const layerList = document.getElementById('layer-list');
const uploadInput = document.getElementById('svg-upload');
const propertiesPanel = document.getElementById('properties-panel');

const btnImport = document.getElementById('btn-import');
const btnSave = document.getElementById('btn-save');
const btnUndo = document.getElementById('btn-undo');
const btnJump = document.getElementById('btn-jump');

// ========== 文件导入 ==========
btnImport.onclick = () => uploadInput.click();

uploadInput.onchange = (e) => {
    const files = e.target.files;
    if (!files) return;
    
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => injectSVG(ev.target.result, file.name);
        reader.readAsText(file);
    });
    
    // 重置 input
    uploadInput.value = '';
};

// 拖拽导入多个文件
const canvas = document.getElementById('canvas');
canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    patternContainer.classList.add('dragover');
    e.dataTransfer.dropEffect = 'copy';
});

canvas.addEventListener('dragleave', () => {
    patternContainer.classList.remove('dragover');
});

canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    patternContainer.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
        Array.from(e.dataTransfer.files).forEach(file => {
            if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
                const reader = new FileReader();
                reader.onload = (ev) => injectSVG(ev.target.result, file.name);
                reader.readAsText(file);
            }
        });
    }
});

// ========== SVG 注入与处理（多纹样） ==========
function injectSVG(svgText, fileName) {
    let trimmed = svgText.trim();
    if (!trimmed.startsWith('<svg')) {
        trimmed = `<svg xmlns="http://www.w3.org/2000/svg">${trimmed}</svg>`;
    }

    // 创建纹样卡片
    const wrapper = document.createElement('div');
    wrapper.className = 'pattern-wrapper';
    wrapper.dataset.filename = fileName;
    wrapper.innerHTML = trimmed;

    const svg = wrapper.querySelector('svg');
    if (svg) {
        svg.classList.add('svg-canvas');
        if (!svg.hasAttribute('id')) svg.id = `svg-${Date.now()}`;
    }

    // 添加标签
    const label = document.createElement('div');
    label.className = 'pattern-label';
    label.textContent = fileName.replace('.svg', '');
    wrapper.appendChild(label);

    // 绑定拖拽和点击事件
    bindWrapperEvents(wrapper);
    
    patternContainer.appendChild(wrapper);
    patterns.set(fileName, wrapper);
    
    updateLayerList();
    pushHistory();
}

// ========== 纹样卡片事件绑定 ==========
function bindWrapperEvents(wrapper) {
    // 鼠标按下开始拖拽
    wrapper.addEventListener('mousedown', (e) => {
        if (currentTool === 'move') {
            draggedElement = wrapper;
            const rect = wrapper.getBoundingClientRect();
            const containerRect = patternContainer.getBoundingClientRect();
            
            dragOffset.x = e.clientX - rect.left;
            dragOffset.y = e.clientY - rect.top;
            
            wrapper.classList.add('dragging');
            e.preventDefault();
        } else if (currentTool === 'select') {
            // 选择工具：切换选中状态
            if (e.shiftKey) {
                wrapper.classList.toggle('selected');
                if (wrapper.classList.contains('selected')) {
                    selectedWrappers.push(wrapper);
                } else {
                    selectedWrappers = selectedWrappers.filter(w => w !== wrapper);
                }
            } else {
                clearWrapperSelection();
                wrapper.classList.add('selected');
                selectedWrappers = [wrapper];
            }
            showPatternProperties(wrapper);
            e.preventDefault();
        }
    });

    // 点击纹样应用文法
    wrapper.addEventListener('click', (e) => {
        if (currentTool === 'eyedropper' && grammarType) {
            const svg = wrapper.querySelector('svg');
            if (svg) {
                applyGrammarRule(svg, grammarType);
                document.getElementById('tool-select').click();
                updateLayerList();
                pushHistory();
            }
        }
    });
}

// ========== 全局拖拽处理 ==========
document.addEventListener('mousemove', (e) => {
    if (draggedElement && currentTool === 'move') {
        const containerRect = patternContainer.getBoundingClientRect();
        const x = e.clientX - containerRect.left - dragOffset.x;
        const y = e.clientY - containerRect.top - dragOffset.y;
        
        draggedElement.style.position = 'absolute';
        draggedElement.style.left = `${Math.max(0, Math.min(x, containerRect.width - draggedElement.offsetWidth))}px`;
        draggedElement.style.top = `${Math.max(0, Math.min(y, containerRect.height - draggedElement.offsetHeight))}px`;
    }
});

document.addEventListener('mouseup', () => {
    if (draggedElement) {
        draggedElement.classList.remove('dragging');
        draggedElement = null;
        pushHistory();
    }
});

// ========== 纹样选择管理 ==========
function clearWrapperSelection() {
    patternContainer.querySelectorAll('.pattern-wrapper').forEach(w => {
        w.classList.remove('selected');
    });
    selectedWrappers = [];
    propertiesPanel.innerHTML = '<p style="color: #999; font-size: 12px;">选中纹样后显示详细信息</p>';
}

function showPatternProperties(wrapper) {
    const svg = wrapper.querySelector('svg');
    if (!svg) return;
    
    const bbox = svg.getBBox();
    const pos = wrapper.style.position === 'absolute' 
        ? `left: ${wrapper.style.left || '0px'}, top: ${wrapper.style.top || '0px'}`
        : '自动布局';
    
    propertiesPanel.innerHTML = `
        <div class="property-item">
            <span class="property-label">文件名:</span>
            <span class="property-value">${wrapper.dataset.filename}</span>
        </div>
        <div class="property-item">
            <span class="property-label">尺寸:</span>
            <span class="property-value">${bbox.width.toFixed(0)} × ${bbox.height.toFixed(0)}</span>
        </div>
        <div class="property-item">
            <span class="property-label">位置:</span>
            <span class="property-value">${pos}</span>
        </div>
    `;
}

// ========== 图层管理 ==========
function updateLayerList() {
    layerList.innerHTML = '';
    
    patterns.forEach((wrapper, fileName) => {
        const li = document.createElement('li');
        li.className = 'layer-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = wrapper.style.display !== 'none';
        checkbox.onchange = (ev) => {
            ev.stopPropagation();
            wrapper.style.display = checkbox.checked ? '' : 'none';
            pushHistory();
        };
        
        const label = document.createElement('span');
        label.className = 'layer-label';
        label.textContent = fileName;
        label.onclick = (ev) => {
            ev.stopPropagation();
            clearWrapperSelection();
            wrapper.classList.add('selected');
            selectedWrappers = [wrapper];
            showPatternProperties(wrapper);
        };
        
        li.appendChild(checkbox);
        li.appendChild(label);
        layerList.appendChild(li);
    });
}

// ========== 工具切换 ==========
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.onclick = () => {
        // 特殊按钮处理
        if (btn.id === 'tool-reset') {
            if (confirm('确定要重置所有纹样吗？')) {
                patternContainer.innerHTML = '';
                patterns.clear();
                clearWrapperSelection();
                updateLayerList();
                pushHistory();
            }
            return;
        }
        
        if (btn.id === 'tool-bg-color') {
            showColorPicker();
            return;
        }
        
        if (btn.id === 'tool-play-video') {
            alert('视频播放功能开发中...');
            return;
        }

        if (btn.id === 'tool-delete') {
            selectedWrappers.forEach(w => w.remove());
            selectedWrappers.forEach(w => patterns.delete(w.dataset.filename));
            selectedWrappers = [];
            updateLayerList();
            clearWrapperSelection();
            pushHistory();
            return;
        }

        // 普通工具切换
        document.querySelectorAll('.tool-btn').forEach(t => {
            if (!['tool-bg-color', 'tool-play-video', 'tool-delete', 'tool-reset'].includes(t.id)) {
                t.classList.remove('active');
            }
        });
        btn.classList.add('active');
        currentTool = btn.id.replace('tool-', '');
        document.body.style.cursor = (currentTool === 'eyedropper') ? 'crosshair' : 'default';
    };
});

// ========== 背景颜色选择 ==========
function showColorPicker() {
    const currentBg = window.getComputedStyle(patternContainer).backgroundColor;
    
    propertiesPanel.innerHTML = `
        <div class="color-picker-container">
            <div class="color-input-group">
                <input type="color" id="bg-color-input" value="${rgbToHex(currentBg)}" />
                <input type="text" class="color-value" id="bg-color-value" value="${rgbToHex(currentBg)}" readonly />
            </div>
            <button style="padding: 8px; margin-top: 8px; background: var(--accent-blue); color: white; border: none; border-radius: 4px; cursor: pointer;">应用</button>
        </div>
    `;
    
    const colorInput = document.getElementById('bg-color-input');
    const colorValue = document.getElementById('bg-color-value');
    const applyBtn = propertiesPanel.querySelector('button');
    
    colorInput.addEventListener('input', (e) => {
        colorValue.value = e.target.value;
        patternContainer.style.backgroundColor = e.target.value;
    });
    
    applyBtn.addEventListener('click', () => {
        const color = colorInput.value;
        patternContainer.style.backgroundColor = color;
        document.documentElement.style.setProperty('--canvas-bg', color);
        clearWrapperSelection();
        pushHistory();
    });
}

function rgbToHex(rgb) {
    if (!rgb || rgb === 'transparent') return '#1a1a1a';
    const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!match) return rgb;
    
    const hex = (x) => ('0' + parseInt(x).toString(16)).slice(-2);
    return '#' + hex(match[1]) + hex(match[2]) + hex(match[3]);
}

// ========== 文法规则 ==========
document.querySelectorAll('.grammar-tag').forEach(tag => {
    tag.onclick = () => {
        document.querySelectorAll('.grammar-tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        grammarType = tag.dataset.grammar;
        currentTool = 'eyedropper';
        document.getElementById('tool-eyedropper').classList.add('active');

        const descriptions = {
            'repeat': '二方连续：沿水平方向重复纹样 4 次',
            'symmetry': '对称式：纹样上下镜像并竖直排列',
            'four-way': '四方连续：纹样以 2×2 网格排列',
            'center': '中心式：纹样围绕中心 4 重旋转'
        };
        propertiesPanel.innerHTML = `<p style="color: #0078d7; font-weight: bold;">📐 ${descriptions[grammarType]}</p><p style="color: #999; font-size: 11px; margin-top: 8px;">点击纹样卡片应用此规则</p>`;
    };
});

// ========== 文法应用逻辑 ==========
function applyGrammarRule(svg, rule) {
    const bbox = svg.getBBox();
    const origWidth = bbox.width;
    const origHeight = bbox.height;
    const origX = bbox.x;
    const origY = bbox.y;

    const originalChildren = Array.from(svg.children);

    switch (rule) {
        case 'repeat':
            applyRepeatPattern(svg, originalChildren, origWidth);
            svg.setAttribute('viewBox', `${origX} ${origY} ${origWidth * 4} ${origHeight}`);
            break;

        case 'symmetry':
            applySymmetryPattern(svg, originalChildren, origWidth, origHeight, origY);
            svg.setAttribute('viewBox', `${origX} ${origY} ${origWidth} ${origHeight * 2}`);
            break;

        case 'four-way':
            applyFourWayPattern(svg, originalChildren, origWidth, origHeight);
            svg.setAttribute('viewBox', `${origX} ${origY} ${origWidth * 2} ${origHeight * 2}`);
            break;

        case 'center':
            applyCenterPattern(svg, originalChildren, bbox);
            break;
    }
}

function applyRepeatPattern(svg, originalChildren, origWidth) {
    for (let i = 1; i < 4; i++) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${origWidth * i}, 0)`);

        originalChildren.forEach(child => {
            const clone = child.cloneNode(true);
            g.appendChild(clone);
        });

        svg.appendChild(g);
    }
}

function applySymmetryPattern(svg, originalChildren, origWidth, origHeight, origY) {
    const g1 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g1.setAttribute('transform', `translate(0, 0)`);
    originalChildren.forEach(child => {
        const clone = child.cloneNode(true);
        g1.appendChild(clone);
    });
    svg.appendChild(g1);

    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const centerY = origY + origHeight / 2;
    g2.setAttribute('transform', `translate(0, ${origHeight}) scale(1, -1) translate(0, ${-2 * centerY})`);

    originalChildren.forEach(child => {
        const clone = child.cloneNode(true);
        g2.appendChild(clone);
    });
    svg.appendChild(g2);
}

function applyFourWayPattern(svg, originalChildren, origWidth, origHeight) {
    const positions = [
        { x: 0, y: 0 },
        { x: origWidth, y: 0 },
        { x: 0, y: origHeight },
        { x: origWidth, y: origHeight }
    ];

    positions.forEach((pos, idx) => {
        if (idx === 0) return;

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

        originalChildren.forEach(child => {
            const clone = child.cloneNode(true);
            g.appendChild(clone);
        });

        svg.appendChild(g);
    });
}

function applyCenterPattern(svg, originalChildren, bbox) {
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;

    for (let i = 1; i < 4; i++) {
        const angle = i * 90;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform',
            `translate(${centerX}, ${centerY}) rotate(${angle}) translate(${-centerX}, ${-centerY})`
        );

        originalChildren.forEach(child => {
            const clone = child.cloneNode(true);
            g.appendChild(clone);
        });

        svg.appendChild(g);
    }
}

// ========== 撤销 ==========
function pushHistory() {
    const html = patternContainer.innerHTML;
    undoStack.push(html);
    if (undoStack.length > 50) undoStack.shift();
}

document.getElementById('btn-undo').onclick = () => {
    if (undoStack.length <= 1) return;

    undoStack.pop();
    const prev = undoStack[undoStack.length - 1];

    patternContainer.innerHTML = prev;
    patterns.clear();
    
    document.querySelectorAll('.pattern-wrapper').forEach(wrapper => {
        bindWrapperEvents(wrapper);
        const filename = wrapper.dataset.filename;
        patterns.set(filename, wrapper);
    });

    updateLayerList();
    clearWrapperSelection();
};

// ========== 保存 ==========
document.getElementById('btn-save').onclick = () => {
    if (patterns.size === 0) {
        alert('没有导入任何纹样！');
        return;
    }

    // 创建 SVG 容器
    const svgContainer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgContainer.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    patterns.forEach((wrapper, filename) => {
        const svg = wrapper.querySelector('svg');
        if (svg) {
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            
            const bbox = svg.getBBox();
            const x = parseInt(wrapper.style.left) || 0;
            const y = parseInt(wrapper.style.top) || 0;
            
            g.setAttribute('transform', `translate(${x}, ${y})`);
            
            Array.from(svg.children).forEach(child => {
                g.appendChild(child.cloneNode(true));
            });
            
            svgContainer.appendChild(g);
            
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + bbox.width);
            maxY = Math.max(maxY, y + bbox.height);
        }
    });
    
    const padding = 20;
    svgContainer.setAttribute('viewBox', `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`);
    svgContainer.setAttribute('width', (maxX - minX + padding * 2));
    svgContainer.setAttribute('height', (maxY - minY + padding * 2));

    const svgString = svgContainer.outerHTML;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `patterns-${new Date().getTime()}.svg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};

// ========== 跳转 ==========
document.getElementById('btn-jump').onclick = () => {
    const html = patternContainer.innerHTML;
    if (html && patterns.size > 0) {
        localStorage.setItem('currentPattern', html);
    }
    window.location.href = 'text-pattern.html';
};

// ========== 快捷键 ==========
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
            e.preventDefault();
            document.getElementById('btn-undo').click();
        } else if (e.key === 's') {
            e.preventDefault();
            document.getElementById('btn-save').click();
        }
    } else if (e.key === 'Delete') {
        document.getElementById('tool-delete').click();
    } else if (e.key === 'v') {
        document.getElementById('tool-select').click();
    } else if (e.key === 'm') {
        document.getElementById('tool-move').click();
    } else if (e.key === 'i') {
        document.getElementById('tool-eyedropper').click();
    }
});

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    clearWrapperSelection();
});
