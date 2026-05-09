gsap.defaults({ ease: "power2.out" });

let currentTool = 'select';
let selectedShapes = [];
let undoStack = [];
let grammarType = null;
let isInverted = false;

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
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => injectSVG(ev.target.result);
    reader.readAsText(file);
};

// 拖拽导入
const canvas = document.getElementById('canvas');
canvas.addEventListener('dragover', (e) => {
    e.preventDefault();
    canvas.classList.add('dragover');
    e.dataTransfer.dropEffect = 'copy';
});

canvas.addEventListener('dragleave', () => {
    canvas.classList.remove('dragover');
});

canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    canvas.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
        const file = e.dataTransfer.files[0];
        if (file.type === 'image/svg+xml' || file.name.endsWith('.svg')) {
            const reader = new FileReader();
            reader.onload = (ev) => injectSVG(ev.target.result);
            reader.readAsText(file);
        }
    }
});

// ========== SVG 注入与处理 ==========
function injectSVG(svgText) {
    let trimmed = svgText.trim();
    if (!trimmed.startsWith('<svg')) {
        trimmed = `<svg xmlns="http://www.w3.org/2000/svg">${trimmed}</svg>`;
    }

    patternContainer.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'pattern-wrapper';
    wrapper.innerHTML = trimmed;

    const svg = wrapper.querySelector('svg');
    if (svg) {
        svg.classList.add('svg-canvas');
        if (!svg.hasAttribute('id')) svg.id = 'canvas-svg';
    }

    patternContainer.appendChild(wrapper);
    updateLayerList();
    bindShapeEvents();
    pushHistory();
}

// ========== 图层管理 ==========
function updateLayerList() {
    layerList.innerHTML = '';
    const svg = patternContainer.querySelector('svg');
    if (!svg) return;

    const elements = getAllSVGElements(svg);

    elements.forEach((el, idx) => {
        const li = document.createElement('li');
        li.className = 'layer-item';
        li.dataset.index = idx;

        const depth = getElementDepth(el);
        li.style.paddingLeft = (12 + depth * 16) + 'px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = el.style.display !== 'none';
        checkbox.onchange = (ev) => {
            ev.stopPropagation();
            el.style.display = checkbox.checked ? '' : 'none';
            pushHistory();
        };

        const label = document.createElement('span');
        label.className = 'layer-label';
        label.textContent = el.id || el.tagName;
        label.onclick = () => {
            clearSelection();
            el.classList.add('selected');
            selectedShapes = [el];
            updateLayerSelection();
            showElementProperties(el);
        };

        li.appendChild(checkbox);
        li.appendChild(label);
        layerList.appendChild(li);
    });
}

function getAllSVGElements(parent, result = []) {
    const children = Array.from(parent.children);
    children.forEach(child => {
        if (child.tagName !== 'defs' && child.tagName !== 'style') {
            result.push(child);
            if (child.children.length > 0) {
                getAllSVGElements(child, result);
            }
        }
    });
    return result;
}

function getElementDepth(el) {
    let depth = 0;
    let parent = el.parentElement;
    while (parent && parent.tagName !== 'svg') {
        depth++;
        parent = parent.parentElement;
    }
    return depth;
}

// ========== 元素选择 ==========
function bindShapeEvents() {
    const svg = patternContainer.querySelector('svg');
    if (!svg) return;

    const shapes = svg.querySelectorAll('path, ellipse, rect, circle, polygon, g');
    shapes.forEach(el => {
        el.style.cursor = 'pointer';
        el.onclick = (e) => {
            e.stopPropagation();
            if (e.shiftKey) {
                if (selectedShapes.includes(el)) {
                    el.classList.remove('selected');
                    selectedShapes = selectedShapes.filter(x => x !== el);
                } else {
                    el.classList.add('selected');
                    selectedShapes.push(el);
                }
            } else {
                clearSelection();
                el.classList.add('selected');
                selectedShapes = [el];
            }
            updateLayerSelection();
            if (selectedShapes.length === 1) {
                showElementProperties(selectedShapes[0]);
            }
        };
    });

    patternContainer.onclick = (e) => {
        if (e.target === patternContainer || e.target.classList.contains('pattern-wrapper')) {
            clearSelection();
        }
    };
}

function clearSelection() {
    patternContainer.querySelectorAll('.selected').forEach(e => e.classList.remove('selected'));
    selectedShapes = [];
    updateLayerSelection();
    propertiesPanel.innerHTML = '<p style="color: #999; font-size: 12px;">选中元素后显示属性</p>';
}

function updateLayerSelection() {
    const lis = layerList.querySelectorAll('li');
    lis.forEach(li => li.classList.remove('selected'));
    const svg = patternContainer.querySelector('svg');
    const elements = getAllSVGElements(svg);

    elements.forEach((el, idx) => {
        if (selectedShapes.includes(el)) {
            const lis = layerList.querySelectorAll('li');
            lis.forEach(li => {
                if (parseInt(li.dataset.index) === idx) {
                    li.classList.add('selected');
                }
            });
        }
    });
}

// ========== 元素属性显示 ==========
function showElementProperties(el) {
    propertiesPanel.innerHTML = `
        <div class="property-item">
            <span>标签:</span>
            <span>${el.tagName}</span>
        </div>
        <div class="property-item">
            <span>ID:</span>
            <span>${el.id || '(无)'}</span>
        </div>
        <div class="property-item">
            <span>填充:</span>
            <span>${el.getAttribute('fill') || getComputedStyle(el).fill}</span>
        </div>
        <div class="property-item">
            <span>描边:</span>
            <span>${el.getAttribute('stroke') || getComputedStyle(el).stroke}</span>
        </div>
    `;
}

// ========== 文法规则 ==========
document.querySelectorAll('.grammar-tag').forEach(tag => {
    tag.onclick = () => {
        document.querySelectorAll('.grammar-tag').forEach(t => t.classList.remove('active'));
        tag.classList.add('active');
        grammarType = tag.dataset.grammar;
        currentTool = 'eyedropper';
        document.getElementById('tool-eyedropper').classList.add('active');

        // 更新属性面板显示文法说明
        const descriptions = {
            'repeat': '二方连续：沿水平方向重复纹样 4 次',
            'symmetry': '对称式：纹样上下镜像并竖直排列',
            'four-way': '四方连续：纹样以 2×2 网格排列',
            'center': '中心式：纹样围绕中心 4 重旋转'
        };
        propertiesPanel.innerHTML = `<p style="color: #0078d7;">${descriptions[grammarType] || '文法说明'}</p>`;
    };
});

// ========== 工具切换 ==========
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.onclick = () => {
        if (btn.id === 'tool-reset') {
            // 重置
            const svg = patternContainer.querySelector('svg');
            if (svg) {
                const firstWrapper = patternContainer.querySelector('.pattern-wrapper');
                if (firstWrapper && firstWrapper.querySelector('svg')) {
                    svg.innerHTML = firstWrapper.querySelector('svg').innerHTML;
                }
            }
            clearSelection();
            isInverted = false;
            updateLayerList();
            pushHistory();
            return;
        }

        document.querySelectorAll('.tool-btn').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.id.replace('tool-', '');
        document.body.style.cursor = (currentTool === 'eyedropper') ? 'crosshair' : 'default';
    };
});

// ========== 画布交互 ==========
patternContainer.addEventListener('click', (e) => {
    if (currentTool === 'eyedropper' && grammarType) {
        const svg = patternContainer.querySelector('svg');
        if (!svg) return;

        applyGrammarRule(svg, grammarType);

        // 自动切回选择工具
        document.getElementById('tool-select').click();
        clearSelection();
        updateLayerList();
        pushHistory();
    }
});

// ========== 文法应用逻辑 ==========
function applyGrammarRule(svg, rule) {
    const bbox = svg.getBBox();
    const origWidth = bbox.width;
    const origHeight = bbox.height;
    const origX = bbox.x;
    const origY = bbox.y;

    // 获取原始子元素
    const originalChildren = Array.from(svg.children);

    switch (rule) {
        case 'repeat': // 二方连续 - 水平重复 4 次
            applyRepeatPattern(svg, originalChildren, origWidth);
            svg.setAttribute('viewBox', `${origX} ${origY} ${origWidth * 4} ${origHeight}`);
            break;

        case 'symmetry': // 对称式 - 上下镜像，向下移动
            applySymmetryPattern(svg, originalChildren, origWidth, origHeight, origY);
            svg.setAttribute('viewBox', `${origX} ${origY} ${origWidth} ${origHeight * 2}`);
            break;

        case 'four-way': // 四方连续 - 2×2 网格
            applyFourWayPattern(svg, originalChildren, origWidth, origHeight);
            svg.setAttribute('viewBox', `${origX} ${origY} ${origWidth * 2} ${origHeight * 2}`);
            break;

        case 'center': // 中心式 - 围绕中心旋转
            applyCenterPattern(svg, originalChildren, bbox);
            break;
    }
}

// 二方连续 - 水平重复 4 次
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

// 对称式 - 上下镜像，向下移动
function applySymmetryPattern(svg, originalChildren, origWidth, origHeight, origY) {
    // 原始纹样
    const g1 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g1.setAttribute('transform', `translate(0, 0)`);
    originalChildren.forEach(child => {
        const clone = child.cloneNode(true);
        g1.appendChild(clone);
    });
    svg.appendChild(g1);

    // 镜像纹样（上下翻转） + 向下移动
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const centerY = origY + origHeight / 2;
    g2.setAttribute('transform', `translate(0, ${origHeight}) scale(1, -1) translate(0, ${-2 * centerY})`);

    originalChildren.forEach(child => {
        const clone = child.cloneNode(true);
        g2.appendChild(clone);
    });
    svg.appendChild(g2);
}

// 四方连续 - 2×2 网格
function applyFourWayPattern(svg, originalChildren, origWidth, origHeight) {
    const positions = [
        { x: 0, y: 0 },
        { x: origWidth, y: 0 },
        { x: 0, y: origHeight },
        { x: origWidth, y: origHeight }
    ];

    positions.forEach((pos, idx) => {
        if (idx === 0) return; // 第一个已有

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

        originalChildren.forEach(child => {
            const clone = child.cloneNode(true);
            g.appendChild(clone);
        });

        svg.appendChild(g);
    });
}

// 中心式 - 围绕中心旋转
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

// ========== 正负形切换 ==========
document.getElementById('tool-invert').onclick = () => {
    const svg = patternContainer.querySelector('svg');
    if (!svg) return;

    isInverted = !isInverted;
    const shapes = svg.querySelectorAll('path, ellipse, rect, circle, polygon');

    shapes.forEach(shape => {
        const fill = shape.getAttribute('fill');
        const stroke = shape.getAttribute('stroke');

        shape.setAttribute('fill', stroke || 'black');
        shape.setAttribute('stroke', fill || 'white');
    });

    pushHistory();
};

// ========== 组合/拆分 ==========
document.getElementById('tool-group').onclick = () => {
    if (selectedShapes.length < 2) return;

    const svg = patternContainer.querySelector('svg');
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    selectedShapes.forEach(el => g.appendChild(el));
    svg.appendChild(g);

    clearSelection();
    updateLayerList();
    pushHistory();
};

document.getElementById('tool-ungroup').onclick = () => {
    const svg = patternContainer.querySelector('svg');

    selectedShapes.forEach(el => {
        if (el.tagName === 'g') {
            while (el.firstChild) {
                svg.insertBefore(el.firstChild, el);
            }
            el.remove();
        }
    });

    clearSelection();
    updateLayerList();
    pushHistory();
};

document.getElementById('tool-delete').onclick = () => {
    selectedShapes.forEach(el => el.remove());
    clearSelection();
    updateLayerList();
    pushHistory();
};

// ========== 撤销 ==========
function pushHistory() {
    const svg = patternContainer.querySelector('svg');
    if (!svg) return;
    undoStack.push(svg.outerHTML);
    if (undoStack.length > 50) undoStack.shift();
}

btnUndo.onclick = () => {
    if (undoStack.length <= 1) return;

    undoStack.pop();
    const prev = undoStack[undoStack.length - 1];

    const wrapper = patternContainer.querySelector('.pattern-wrapper');
    if (wrapper) {
        wrapper.innerHTML = prev;
    }

    bindShapeEvents();
    updateLayerList();
    clearSelection();
};

// ========== 保存 ==========
btnSave.onclick = () => {
    const svg = patternContainer.querySelector('svg');
    if (!svg) return;

    const svgString = svg.outerHTML;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    localStorage.setItem('currentPattern', svgString);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'pattern.svg';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};

// ========== 跳转 ==========
btnJump.onclick = () => {
    const svg = patternContainer.querySelector('svg');
    if (svg) {
        localStorage.setItem('currentPattern', svg.outerHTML);
    }
    window.location.href = 'text-pattern.html';
};

// ========== 快捷键 ==========
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
            e.preventDefault();
            btnUndo.click();
        } else if (e.key === 's') {
            e.preventDefault();
            btnSave.click();
        } else if (e.key === 'g') {
            e.preventDefault();
            document.getElementById('tool-group').click();
        }
    } else if (e.key === 'i') {
        document.getElementById('tool-eyedropper').click();
    } else if (e.key === 'v') {
        document.getElementById('tool-select').click();
    } else if (e.key === 'Delete') {
        document.getElementById('tool-delete').click();
    }
});

// ========== 初始化 ==========
document.addEventListener('DOMContentLoaded', () => {
    clearSelection();
});
