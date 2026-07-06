// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
// COLOR CONFIGURATION
// Define colors for known canalizations. Any new canalization
// found in the PDF will get an auto-assigned color from the
// extras palette.
// ============================================================
const CANALIZACAO_COLORS = {
    'SAL': { main: '#1a56db', light: '#eff6ff', border: '#93c5fd', name: 'SAL' },
    'SSE': { main: '#dc2626', light: '#fef2f2', border: '#fca5a5', name: 'SSE' },
    'JPA': { main: '#7c3aed', light: '#f5f3ff', border: '#c4b5fd', name: 'JPA' },
    'SNR': { main: '#059669', light: '#ecfdf5', border: '#6ee7b7', name: 'SNR' },
    'PRN': { main: '#d97706', light: '#fffbeb', border: '#fcd34d', name: 'PRN' },
};

// Extra colors for additional canalizations (auto-assigned)
const EXTRA_COLORS = [
    { main: '#7c3aed', light: '#f5f3ff', border: '#c4b5fd' },  // purple
    { main: '#059669', light: '#ecfdf5', border: '#6ee7b7' },  // green
    { main: '#d97706', light: '#fffbeb', border: '#fcd34d' },  // amber
    { main: '#0891b2', light: '#ecfeff', border: '#67e8f9' },  // cyan
    { main: '#be185d', light: '#fdf2f8', border: '#f9a8d4' },  // pink
    { main: '#4338ca', light: '#eef2ff', border: '#a5b4fc' },  // indigo
    { main: '#b45309', light: '#fef3c7', border: '#fbbf24' },  // orange-dark
    { main: '#065f46', light: '#d1fae5', border: '#34d399' },  // emerald
    { main: '#9333ea', light: '#faf5ff', border: '#d8b4fe' },  // violet
    { main: '#0369a1', light: '#f0f9ff', border: '#7dd3fc' },  // sky
];

let extraColorIndex = 0;

function getCanalizacaoColor(canalizacaoKey) {
    if (CANALIZACAO_COLORS[canalizacaoKey]) {
        return CANALIZACAO_COLORS[canalizacaoKey];
    }
    // Auto-assign a color for unknown canalizations
    const color = EXTRA_COLORS[extraColorIndex % EXTRA_COLORS.length];
    CANALIZACAO_COLORS[canalizacaoKey] = { ...color, name: canalizacaoKey };
    extraColorIndex++;
    return CANALIZACAO_COLORS[canalizacaoKey];
}

// ============================================================
// DOM Elements
// ============================================================
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const clearFile = document.getElementById('clearFile');
const loading = document.getElementById('loading');
const summarySection = document.getElementById('summarySection');
const summaryCards = document.getElementById('summaryCards');
const actionsContainer = document.getElementById('actionsContainer');
const canalizacoesContainer = document.getElementById('canalizacoesContainer');

// State: { canalizacaoKey: [entries] }
let parsedData = {};

// ============================================================
// Event Listeners
// ============================================================
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
clearFile.addEventListener('click', resetAll);

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        processFile(file);
    }
});

// ============================================================
// File Processing
// ============================================================
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        processFile(file);
    }
}

async function processFile(file) {
    uploadArea.style.display = 'none';
    loading.style.display = 'flex';
    fileInfo.style.display = 'flex';
    fileName.textContent = file.name;

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const allText = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            allText.push(pageText);
        }

        parsedData = parseRomaneios(allText);
        displayResults();
    } catch (error) {
        console.error('Erro ao processar PDF:', error);
        alert('Erro ao processar o PDF. Verifique se o arquivo e valido.');
        resetAll();
    } finally {
        loading.style.display = 'none';
    }
}

// ============================================================
// PDF Parsing - supports ANY canalization
// ============================================================
function parseRomaneios(pagesText) {
    const result = {};

    for (const pageText of pagesText) {
        // Extract romaneio metadata
        const idMatch = pageText.match(/ID\s+(\d{13,19})/);
        const romaneioId = idMatch ? idMatch[1] : '';

        const veiculoMatch = pageText.match(/Ve[ií]culo:\s*([^\s]+(?:\s+[^\s]+)?(?:\s+[^\s]+)?)/i);
        let veiculo = veiculoMatch ? veiculoMatch[1].trim() : '';
        veiculo = veiculo.replace(/Doca:.*/, '').trim();

        const lacreMatch = pageText.match(/Lacre:\s*([^\n]+?)(?:\s+Destino|\s+$)/i);
        const lacre = lacreMatch ? lacreMatch[1].trim() : '';

        const docaMatch = pageText.match(/Doca:\s*(Doca\s*\d+)/i);
        const doca = docaMatch ? docaMatch[1].trim() : '';

        const operadorMatch = pageText.match(/Operador:\s*(\S+)/i);
        const operador = operadorMatch ? operadorMatch[1].trim() : '';

        const inicioMatch = pageText.match(/In[ií]cio:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i);
        const horario = inicioMatch ? inicioMatch[1] : '';

        // Generic canalization pattern - captures any canalization format:
        // Examples: SAL1_A, SSE1_A, JPA1_B, SNR1_A, PRN2_C, or even SAL_A, JPA_B
        // Pattern: container_number [master]? quantity canalization_code
        const containerPattern = /(\d{13,19})\s*(?:\[master\])?\s+(\d+)\s+([A-Z]{2,10}\d*_[A-Z0-9]+)/gi;
        let match;

        while ((match = containerPattern.exec(pageText)) !== null) {
            const hu = match[1];
            const pacotes = parseInt(match[2]);
            const canalizacao = match[3].toUpperCase();

            // Extract the base canalization name (e.g., SAL from SAL1_A, JPA from JPA1_B)
            const baseMatch = canalizacao.match(/^([A-Z]+)/);
            const canalizacaoKey = baseMatch ? baseMatch[1] : canalizacao;

            const entry = {
                hu,
                pacotes,
                canalizacao,
                canalizacaoKey,
                veiculo,
                lacre,
                doca,
                operador,
                horario,
                romaneioId
            };

            if (!result[canalizacaoKey]) {
                result[canalizacaoKey] = [];
            }
            result[canalizacaoKey].push(entry);
        }
    }

    return result;
}

// ============================================================
// Display Results - dynamically generates sections
// ============================================================
function displayResults() {
    const keys = Object.keys(parsedData).sort();

    if (keys.length === 0) {
        alert('Nenhuma HU encontrada no PDF. Verifique se o formato do romaneio e compativel.');
        resetAll();
        return;
    }

    // Calculate totals
    let totalHUs = 0;
    let totalPacotes = 0;
    const stats = {};

    for (const key of keys) {
        const items = parsedData[key];
        const count = items.length;
        const pacotes = items.reduce((sum, item) => sum + item.pacotes, 0);
        stats[key] = { count, pacotes };
        totalHUs += count;
        totalPacotes += pacotes;
    }

    // Build summary cards
    summaryCards.innerHTML = '';

    // Total HUs card
    const totalHUCard = createCard(totalHUs, 'Total de HUs', '#2c3e50');
    summaryCards.appendChild(totalHUCard);

    // Total Pacotes card
    const totalPacotesCard = createCard(totalPacotes.toLocaleString('pt-BR'), 'Total de Pacotes', '#2c3e50');
    summaryCards.appendChild(totalPacotesCard);

    // Per-canalizacao cards
    for (const key of keys) {
        const color = getCanalizacaoColor(key);
        const huCard = createCard(stats[key].count, `HUs ${key}`, color.main);
        summaryCards.appendChild(huCard);

        const pacotesCard = createCard(stats[key].pacotes.toLocaleString('pt-BR'), `Pacotes ${key}`, color.main);
        summaryCards.appendChild(pacotesCard);
    }

    // Build action buttons
    actionsContainer.innerHTML = '';

    for (const key of keys) {
        const color = getCanalizacaoColor(key);
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.background = color.main;
        btn.style.color = 'white';
        btn.textContent = `Imprimir ${key}`;
        btn.addEventListener('click', () => printSingle(key));
        actionsContainer.appendChild(btn);
    }

    if (keys.length > 1) {
        const btnAll = document.createElement('button');
        btnAll.className = 'btn btn-all';
        btnAll.textContent = 'Imprimir Tudo';
        btnAll.addEventListener('click', () => {
            document.body.classList.remove('print-single');
            window.print();
        });
        actionsContainer.appendChild(btnAll);
    }

    // Build canalizacao sections
    canalizacoesContainer.innerHTML = '';

    keys.forEach((key, index) => {
        // Add divider between sections
        if (index > 0) {
            const divider = document.createElement('div');
            divider.className = 'section-divider';
            const prevKey = keys[index - 1];
            divider.innerHTML = `&#9888; ACIMA: ${prevKey} &mdash; ABAIXO: ${key} &#9888;`;
            canalizacoesContainer.appendChild(divider);
        }

        const color = getCanalizacaoColor(key);
        const section = createCanalizacaoSection(key, parsedData[key], color);
        canalizacoesContainer.appendChild(section);
    });

    summarySection.style.display = 'block';
}

function createCard(value, label, color) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.borderLeft = `4px solid ${color}`;
    card.innerHTML = `
        <div class="card-value" style="color: ${color}">${value}</div>
        <div class="card-label">${label}</div>
    `;
    return card;
}

function createCanalizacaoSection(key, items, color) {
    const section = document.createElement('section');
    section.className = 'canalizacao-section';
    section.dataset.canalizacao = key;
    section.style.borderColor = color.main;
    section.style.background = color.light;

    // Header
    const header = document.createElement('div');
    header.className = 'section-header';
    header.style.borderBottomColor = color.main;
    header.innerHTML = `
        <h2 style="color: ${color.main}">CANALIZACAO ${key}</h2>
        <span class="badge" style="background: ${color.main}">${items.length} HUs</span>
    `;
    section.appendChild(header);

    // QR Grid
    const grid = document.createElement('div');
    grid.className = 'qr-grid';
    section.appendChild(grid);

    // Render QR cards
    for (const item of items) {
        const card = document.createElement('div');
        card.className = 'qr-card';
        card.style.borderColor = color.border;

        // QR Code canvas
        const canvas = document.createElement('canvas');
        card.appendChild(canvas);

        // Generate QR Code - ALWAYS BLACK
        try {
            new QRious({
                element: canvas,
                value: item.hu,
                size: 180,
                foreground: '#000000',
                background: '#ffffff',
                level: 'M'
            });
        } catch (err) {
            console.error('Erro ao gerar QR Code:', err);
            canvas.style.display = 'none';
            const errorMsg = document.createElement('div');
            errorMsg.textContent = 'Erro no QR';
            errorMsg.style.color = '#e74c3c';
            card.appendChild(errorMsg);
        }

        // HU number
        const huLabel = document.createElement('div');
        huLabel.className = 'qr-hu-number';
        huLabel.textContent = item.hu;
        card.appendChild(huLabel);

        // Pacotes
        const pacotesLabel = document.createElement('div');
        pacotesLabel.className = 'qr-pacotes';
        pacotesLabel.textContent = `${item.pacotes} pacotes`;
        card.appendChild(pacotesLabel);

        // Veiculo
        if (item.veiculo) {
            const veiculoLabel = document.createElement('div');
            veiculoLabel.className = 'qr-veiculo';
            veiculoLabel.textContent = `🚛 ${item.veiculo}`;
            card.appendChild(veiculoLabel);
        }

        // Canalizacao badge
        const canalizacaoLabel = document.createElement('div');
        canalizacaoLabel.className = 'qr-canalizacao';
        canalizacaoLabel.style.background = color.main;
        canalizacaoLabel.textContent = item.canalizacao;
        card.appendChild(canalizacaoLabel);

        grid.appendChild(card);
    }

    return section;
}

// ============================================================
// Print Functions
// ============================================================
function printSingle(key) {
    // Mark all sections, only show the target one
    document.body.classList.add('print-single');
    const sections = document.querySelectorAll('.canalizacao-section');
    sections.forEach(s => {
        if (s.dataset.canalizacao === key) {
            s.classList.add('print-visible');
        } else {
            s.classList.remove('print-visible');
        }
    });
    window.print();
    setTimeout(() => {
        document.body.classList.remove('print-single');
        sections.forEach(s => s.classList.remove('print-visible'));
    }, 500);
}

// ============================================================
// Reset
// ============================================================
function resetAll() {
    fileInput.value = '';
    uploadArea.style.display = 'block';
    fileInfo.style.display = 'none';
    loading.style.display = 'none';

    summarySection.style.display = 'none';
    summaryCards.innerHTML = '';
    actionsContainer.innerHTML = '';
    canalizacoesContainer.innerHTML = '';

    parsedData = {};
    extraColorIndex = 0;

    // Reset dynamic colors (keep predefined ones)
    const predefined = ['SAL', 'SSE', 'JPA', 'SNR', 'PRN'];
    for (const key of Object.keys(CANALIZACAO_COLORS)) {
        if (!predefined.includes(key)) {
            delete CANALIZACAO_COLORS[key];
        }
    }
}
