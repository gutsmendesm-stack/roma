// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
// COLOR CONFIGURATION
// ============================================================
const CANALIZACAO_COLORS = {
    'SAL': { main: '#1a56db', light: '#eff6ff', border: '#93c5fd', name: 'SAL' },
    'SSE': { main: '#dc2626', light: '#fef2f2', border: '#fca5a5', name: 'SSE' },
    'JPA': { main: '#7c3aed', light: '#f5f3ff', border: '#c4b5fd', name: 'JPA' },
    'SNR': { main: '#059669', light: '#ecfdf5', border: '#6ee7b7', name: 'SNR' },
    'PRN': { main: '#d97706', light: '#fffbeb', border: '#fcd34d', name: 'PRN' },
};

const EXTRA_COLORS = [
    { main: '#0891b2', light: '#ecfeff', border: '#67e8f9' },
    { main: '#be185d', light: '#fdf2f8', border: '#f9a8d4' },
    { main: '#4338ca', light: '#eef2ff', border: '#a5b4fc' },
    { main: '#b45309', light: '#fef3c7', border: '#fbbf24' },
    { main: '#065f46', light: '#d1fae5', border: '#34d399' },
];

let extraColorIndex = 0;

function getCanalizacaoColor(key) {
    if (CANALIZACAO_COLORS[key]) return CANALIZACAO_COLORS[key];
    const color = EXTRA_COLORS[extraColorIndex % EXTRA_COLORS.length];
    CANALIZACAO_COLORS[key] = { ...color, name: key };
    extraColorIndex++;
    return CANALIZACAO_COLORS[key];
}

function getVeiculoIcon(veiculo) {
    const v = veiculo.toUpperCase();
    return (v.startsWith('PAG') || v.startsWith('PKC')) ? '✈️' : '📥';
}

// ============================================================
// STATE
// ============================================================
let parsedData = {};
let equipamentos = [];
let carretas = {};
let carregamentoState = {
    canalizacaoAtual: null,
    carretaAtualIdx: 0,
    ordemChegada: [],
    canalizacoesOrdem: [],
};

// ============================================================
// DOM Elements
// ============================================================
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const clearFile = document.getElementById('clearFile');
const loading = document.getElementById('loading');

const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const step4 = document.getElementById('step4');

const summaryCards = document.getElementById('summaryCards');
const carretasConfig = document.getElementById('carretasConfig');
const btnIniciarCarregamento = document.getElementById('btnIniciarCarregamento');
const btnVoltarUpload = document.getElementById('btnVoltarUpload');

const carregamentoTitle = document.getElementById('carregamentoTitle');
const carretaAtualInfo = document.getElementById('carretaAtualInfo');
const equipamentosLista = document.getElementById('equipamentosLista');
const carretaPanelTitle = document.getElementById('carretaPanelTitle');
const carretaStatus = document.getElementById('carretaStatus');
const carretaConteudo = document.getElementById('carretaConteudo');
const btnFecharCarreta = document.getElementById('btnFecharCarreta');
const btnExpedirCarreta = document.getElementById('btnExpedirCarreta');
const btnVoltarConfig = document.getElementById('btnVoltarConfig');

const carretasExpedidas = document.getElementById('carretasExpedidas');
const btnVoltarCarregamento = document.getElementById('btnVoltarCarregamento');
const btnNovaOperacao = document.getElementById('btnNovaOperacao');

// ============================================================
// Event Listeners
// ============================================================
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
clearFile.addEventListener('click', resetAll);

uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') processFile(file);
});

btnIniciarCarregamento.addEventListener('click', iniciarCarregamento);
btnVoltarUpload.addEventListener('click', () => showStep(1));
btnFecharCarreta.addEventListener('click', fecharCarretaAtual);
btnExpedirCarreta.addEventListener('click', expedirCarretaAtual);
btnVoltarConfig.addEventListener('click', () => showStep(2));
btnVoltarCarregamento.addEventListener('click', () => { showStep(3); renderCarregamento(); });
btnNovaOperacao.addEventListener('click', resetAll);

// ============================================================
// Navigation
// ============================================================
function showStep(n) {
    step1.style.display = n === 1 ? 'block' : 'none';
    step2.style.display = n === 2 ? 'block' : 'none';
    step3.style.display = n === 3 ? 'block' : 'none';
    step4.style.display = n === 4 ? 'block' : 'none';
}

// ============================================================
// File Processing
// ============================================================
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
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
        equipamentos = buildEquipamentos(parsedData);
        showStep2();
    } catch (error) {
        console.error('Erro ao processar PDF:', error);
        alert('Erro ao processar o PDF. Verifique se o arquivo e valido.');
        resetAll();
    } finally {
        loading.style.display = 'none';
    }
}

// ============================================================
// PDF Parsing
// ============================================================
function parseRomaneios(pagesText) {
    const result = {};
    for (const pageText of pagesText) {
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

        const containerPattern = /(\d{13,19})\s*(?:\[master\])?\s+(\d+)\s+([A-Z]{2,10}\d*_[A-Z0-9]+)/gi;
        let match;
        while ((match = containerPattern.exec(pageText)) !== null) {
            const hu = match[1];
            const pacotes = parseInt(match[2]);
            const canalizacao = match[3].toUpperCase();
            const baseMatch = canalizacao.match(/^([A-Z]+)/);
            const canalizacaoKey = baseMatch ? baseMatch[1] : canalizacao;

            const entry = { hu, pacotes, canalizacao, canalizacaoKey, veiculo, lacre, doca, operador, horario, romaneioId };
            if (!result[canalizacaoKey]) result[canalizacaoKey] = [];
            result[canalizacaoKey].push(entry);
        }
    }
    return result;
}

// ============================================================
// Build Equipamentos - group HUs by vehicle
// ============================================================
function buildEquipamentos(data) {
    const veiculoMap = {};
    for (const key of Object.keys(data)) {
        for (const entry of data[key]) {
            const vid = entry.veiculo || 'SEM_VEICULO';
            if (!veiculoMap[vid]) {
                veiculoMap[vid] = { veiculo: entry.veiculo, hus: [], canalizacoes: {} };
            }
            veiculoMap[vid].hus.push(entry);
            if (!veiculoMap[vid].canalizacoes[key]) veiculoMap[vid].canalizacoes[key] = [];
            veiculoMap[vid].canalizacoes[key].push(entry);
        }
    }
    return Object.values(veiculoMap);
}


// ============================================================
// STEP 2: Summary + Carreta Config + QR Codes (all HUs)
// ============================================================
function showStep2() {
    showStep(2);
    const keys = Object.keys(parsedData).sort();

    let totalHUs = 0, totalPacotes = 0;
    const stats = {};
    for (const key of keys) {
        const items = parsedData[key];
        const count = items.length;
        const pacotes = items.reduce((sum, item) => sum + item.pacotes, 0);
        stats[key] = { count, pacotes };
        totalHUs += count;
        totalPacotes += pacotes;
    }

    summaryCards.innerHTML = '';
    summaryCards.appendChild(createCard(totalHUs, 'Total de HUs', '#2c3e50'));
    summaryCards.appendChild(createCard(totalPacotes.toLocaleString('pt-BR'), 'Total de Pacotes', '#2c3e50'));
    for (const key of keys) {
        const color = getCanalizacaoColor(key);
        summaryCards.appendChild(createCard(stats[key].count, `HUs ${key}`, color.main));
        summaryCards.appendChild(createCard(stats[key].pacotes.toLocaleString('pt-BR'), `Pacotes ${key}`, color.main));
    }

    // Carreta config
    carretasConfig.innerHTML = '';
    const sortedKeys = keys.sort((a, b) => {
        if (a === 'SAL') return -1;
        if (b === 'SAL') return 1;
        if (a === 'SSE') return -1;
        if (b === 'SSE') return 1;
        return a.localeCompare(b);
    });

    for (const key of sortedKeys) {
        const color = getCanalizacaoColor(key);
        const section = document.createElement('div');
        section.className = 'config-canalizacao';
        section.style.borderLeftColor = color.main;

        const totalPcts = stats[key].pacotes.toLocaleString('pt-BR');
        section.innerHTML = `
            <div class="config-canalizacao-header">
                <h4 style="color: ${color.main}">${key} — ${totalPcts} pacotes</h4>
                <button class="btn-add-carreta" data-canal="${key}">+ Carreta</button>
            </div>
            <div class="carretas-list" id="carretas-${key}">
                <div class="carreta-input-row">
                    <span class="carreta-label">${key} - Carreta 1:</span>
                    <input type="text" placeholder="Placa da carreta" class="input-placa" data-canal="${key}" data-idx="0">
                </div>
                <div class="carreta-input-row">
                    <span class="carreta-label">${key} - Carreta 2:</span>
                    <input type="text" placeholder="Placa da carreta" class="input-placa" data-canal="${key}" data-idx="1">
                </div>
            </div>
        `;
        carretasConfig.appendChild(section);

        section.querySelector('.btn-add-carreta').addEventListener('click', () => {
            const list = document.getElementById(`carretas-${key}`);
            const count = list.querySelectorAll('.carreta-input-row').length;
            const row = document.createElement('div');
            row.className = 'carreta-input-row';
            row.innerHTML = `
                <span class="carreta-label">${key} - Carreta ${count + 1} (extra):</span>
                <input type="text" placeholder="Placa da carreta" class="input-placa" data-canal="${key}" data-idx="${count}">
                <button class="btn-remove-carreta" onclick="this.parentElement.remove()">&#10005;</button>
            `;
            list.appendChild(row);
        });
    }

    // Render ALL QR codes section (for first biping before expedition)
    renderAllQRCodes(sortedKeys);
}

function renderAllQRCodes(keys) {
    const container = document.getElementById('allQrCodesContainer');
    container.innerHTML = '';

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const color = getCanalizacaoColor(key);
        const items = parsedData[key];

        // Divider between sections
        if (i > 0) {
            const divider = document.createElement('div');
            divider.className = 'section-divider';
            divider.innerHTML = `&#9888; ACIMA: ${keys[i-1]} &mdash; ABAIXO: ${key} &#9888;`;
            container.appendChild(divider);
        }

        const section = document.createElement('section');
        section.className = 'canalizacao-section';
        section.style.borderColor = color.main;
        section.style.background = color.light;

        const header = document.createElement('div');
        header.className = 'section-header';
        header.style.borderBottomColor = color.main;
        header.innerHTML = `
            <h2 style="color: ${color.main}">CANALIZACAO ${key}</h2>
            <span class="badge" style="background: ${color.main}">${items.length} HUs</span>
        `;
        section.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'qr-grid';
        for (const item of items) {
            grid.appendChild(createQRCard(item, color));
        }
        section.appendChild(grid);
        container.appendChild(section);
    }

    // Print all button
    const printAllBtn = document.createElement('div');
    printAllBtn.className = 'print-all-actions';
    printAllBtn.innerHTML = '';
    for (const key of keys) {
        const color = getCanalizacaoColor(key);
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.background = color.main;
        btn.style.color = 'white';
        btn.textContent = `Imprimir ${key}`;
        btn.addEventListener('click', () => printCanalizacao(key));
        printAllBtn.appendChild(btn);
    }
    if (keys.length > 1) {
        const btnAll = document.createElement('button');
        btnAll.className = 'btn';
        btnAll.style.background = '#2c3e50';
        btnAll.style.color = 'white';
        btnAll.textContent = 'Imprimir Tudo';
        btnAll.addEventListener('click', () => {
            document.body.classList.remove('print-single-canal');
            document.body.classList.add('print-all-qr');
            window.print();
            setTimeout(() => document.body.classList.remove('print-all-qr'), 500);
        });
        printAllBtn.appendChild(btnAll);
    }
    container.insertBefore(printAllBtn, container.firstChild);
}

function printCanalizacao(key) {
    document.body.classList.add('print-single-canal');
    const sections = document.querySelectorAll('.canalizacao-section');
    sections.forEach(s => {
        const h2 = s.querySelector('h2');
        if (h2 && h2.textContent.includes(key)) {
            s.classList.add('print-visible');
        } else {
            s.classList.remove('print-visible');
        }
    });
    window.print();
    setTimeout(() => {
        document.body.classList.remove('print-single-canal');
        sections.forEach(s => s.classList.remove('print-visible'));
    }, 500);
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


// ============================================================
// STEP 3: Carregamento
// ============================================================
function iniciarCarregamento() {
    const keys = Object.keys(parsedData).sort((a, b) => {
        if (a === 'SAL') return -1;
        if (b === 'SAL') return 1;
        if (a === 'SSE') return -1;
        if (b === 'SSE') return 1;
        return a.localeCompare(b);
    });

    carretas = {};
    for (const key of keys) {
        const inputs = document.querySelectorAll(`.input-placa[data-canal="${key}"]`);
        carretas[key] = [];
        inputs.forEach((input, idx) => {
            carretas[key].push({
                placa: input.value.trim() || `${key} Carreta ${idx + 1}`,
                hus: [],
                expedida: false,
                fechada: false,
                ordemEquipamentos: []
            });
        });
    }

    carregamentoState.canalizacoesOrdem = keys;
    carregamentoState.canalizacaoAtual = keys[0];
    carregamentoState.carretaAtualIdx = 0;
    carregamentoState.ordemChegada = [];

    showStep(3);
    renderCarregamento();
}

function renderCarregamento() {
    const canal = carregamentoState.canalizacaoAtual;
    const color = getCanalizacaoColor(canal);
    const carretaIdx = carregamentoState.carretaAtualIdx;
    const carreta = carretas[canal][carretaIdx];

    carregamentoTitle.textContent = `Carregando: ${canal}`;
    carregamentoTitle.style.color = color.main;

    const totalAlocado = carreta.hus.reduce((s, h) => s + h.pacotes, 0);
    carretaAtualInfo.innerHTML = `
        <span class="badge" style="background:${color.main}">${carreta.placa}</span>
        <span class="pacotes-counter">${totalAlocado.toLocaleString('pt-BR')} pacotes alocados</span>
    `;

    carretaPanelTitle.textContent = `${carreta.placa} (${canal} - Carreta ${carretaIdx + 1})`;

    renderEquipamentosLista(canal);
    renderCarretaConteudo(canal, carretaIdx);
    updateCarregamentoButtons();
}

function renderEquipamentosLista(canal) {
    equipamentosLista.innerHTML = '';

    const aguardando = equipamentos.filter(eq => {
        if (!eq.canalizacoes[canal]) return false;
        return eq.canalizacoes[canal].some(hu => !isHuAlocada(canal, hu.hu));
    });

    if (aguardando.length === 0) {
        equipamentosLista.innerHTML = '<p class="all-done">✅ Todos os equipamentos desta canalização já foram alocados!</p>';
        return;
    }

    for (const eq of aguardando) {
        const husCanal = eq.canalizacoes[canal].filter(hu => !isHuAlocada(canal, hu.hu));
        const totalPcts = husCanal.reduce((s, h) => s + h.pacotes, 0);
        const icon = getVeiculoIcon(eq.veiculo);

        const item = document.createElement('div');
        item.className = 'equipamento-item aguardando';
        item.innerHTML = `
            <div class="eq-info">
                <span class="eq-icon">${icon}</span>
                <span class="eq-veiculo">${eq.veiculo}</span>
                <span class="eq-detail">${husCanal.length} HUs · ${totalPcts.toLocaleString('pt-BR')} pcts</span>
            </div>
            <button class="btn-chegou">Chegou</button>
        `;
        item.querySelector('.btn-chegou').addEventListener('click', () => {
            equipamentoChegou(eq.veiculo, canal);
        });
        equipamentosLista.appendChild(item);
    }
}

function equipamentoChegou(veiculo, canal) {
    if (!carregamentoState.ordemChegada.includes(veiculo)) {
        carregamentoState.ordemChegada.push(veiculo);
    }

    const eq = equipamentos.find(e => e.veiculo === veiculo);
    if (!eq || !eq.canalizacoes[canal]) return;

    const carretaIdx = carregamentoState.carretaAtualIdx;
    const carreta = carretas[canal][carretaIdx];

    const husToAllocate = eq.canalizacoes[canal].filter(hu => !isHuAlocada(canal, hu.hu));
    for (const hu of husToAllocate) {
        carreta.hus.push(hu);
    }

    if (!carreta.ordemEquipamentos.includes(veiculo)) {
        carreta.ordemEquipamentos.push(veiculo);
    }

    renderCarregamento();
}

function isHuAlocada(canal, huId) {
    if (!carretas[canal]) return false;
    for (const carreta of carretas[canal]) {
        if (carreta.hus.some(h => h.hu === huId)) return true;
    }
    return false;
}


function renderCarretaConteudo(canal, carretaIdx) {
    const carreta = carretas[canal][carretaIdx];
    carretaConteudo.innerHTML = '';

    if (carreta.hus.length === 0) {
        carretaConteudo.innerHTML = '<p class="empty-carreta">Nenhuma HU alocada ainda. Marque os equipamentos conforme chegam.</p>';
        return;
    }

    // Group by equipment
    const byEquip = {};
    for (const hu of carreta.hus) {
        const v = hu.veiculo || 'SEM_VEICULO';
        if (!byEquip[v]) byEquip[v] = [];
        byEquip[v].push(hu);
    }

    let ordem = 1;
    for (const v of carreta.ordemEquipamentos) {
        if (!byEquip[v]) continue;
        const hus = byEquip[v];
        const totalPcts = hus.reduce((s, h) => s + h.pacotes, 0);
        const icon = getVeiculoIcon(v);

        const group = document.createElement('div');
        group.className = 'carreta-equip-group';
        group.innerHTML = `
            <div class="equip-group-header">
                <span>${ordem}º ${icon} ${v}</span>
                <span>${hus.length} HUs · ${totalPcts.toLocaleString('pt-BR')} pcts</span>
                <button class="btn-remover-equip" title="Remover este equipamento da carreta">&#10005;</button>
            </div>
        `;
        group.querySelector('.btn-remover-equip').addEventListener('click', () => {
            removerEquipamentoDaCarreta(v, canal, carretaIdx);
        });
        carretaConteudo.appendChild(group);
        ordem++;
    }

    // Total
    const totalAll = carreta.hus.reduce((s, h) => s + h.pacotes, 0);
    const totalDiv = document.createElement('div');
    totalDiv.className = 'carreta-total';
    totalDiv.innerHTML = `<strong>Total: ${carreta.hus.length} HUs · ${totalAll.toLocaleString('pt-BR')} pacotes</strong>`;
    carretaConteudo.appendChild(totalDiv);
}

function removerEquipamentoDaCarreta(veiculo, canal, carretaIdx) {
    const carreta = carretas[canal][carretaIdx];

    // Remove all HUs from this equipment
    carreta.hus = carreta.hus.filter(h => h.veiculo !== veiculo);

    // Remove from order
    carreta.ordemEquipamentos = carreta.ordemEquipamentos.filter(v => v !== veiculo);

    // Remove from ordemChegada so it goes back to "aguardando"
    const stillInOtherCarretas = carretas[canal].some((c, idx) => 
        idx !== carretaIdx && c.hus.some(h => h.veiculo === veiculo)
    );
    if (!stillInOtherCarretas) {
        carregamentoState.ordemChegada = carregamentoState.ordemChegada.filter(v => v !== veiculo);
    }

    renderCarregamento();
}

function updateCarregamentoButtons() {
    const canal = carregamentoState.canalizacaoAtual;
    const carretaIdx = carregamentoState.carretaAtualIdx;
    const carreta = carretas[canal][carretaIdx];
    const totalCarretas = carretas[canal].length;

    const hasMore = carretaIdx < totalCarretas - 1;
    btnFecharCarreta.style.display = (hasMore && carreta.hus.length > 0) ? 'inline-block' : 'none';
    btnExpedirCarreta.style.display = carreta.hus.length > 0 ? 'inline-block' : 'none';

    if (!hasMore && carreta.hus.length > 0) {
        btnFecharCarreta.style.display = 'inline-block';
        btnFecharCarreta.textContent = '➕ Adicionar Carreta Extra e Fechar Atual';
    } else {
        btnFecharCarreta.textContent = '🔒 Fechar Carreta e Abrir Próxima';
    }
}

function fecharCarretaAtual() {
    const canal = carregamentoState.canalizacaoAtual;
    const carretaIdx = carregamentoState.carretaAtualIdx;
    const totalCarretas = carretas[canal].length;

    carretas[canal][carretaIdx].fechada = true;

    if (carretaIdx >= totalCarretas - 1) {
        carretas[canal].push({
            placa: `${canal} Extra ${totalCarretas - 1}`,
            hus: [],
            expedida: false,
            fechada: false,
            ordemEquipamentos: []
        });
    }

    carregamentoState.carretaAtualIdx++;
    renderCarregamento();
}

function expedirCarretaAtual() {
    const canal = carregamentoState.canalizacaoAtual;
    const carretaIdx = carregamentoState.carretaAtualIdx;

    carretas[canal][carretaIdx].expedida = true;
    carretas[canal][carretaIdx].fechada = true;

    const hasMoreHUs = equipamentos.some(eq => {
        if (!eq.canalizacoes[canal]) return false;
        return eq.canalizacoes[canal].some(hu => !isHuAlocada(canal, hu.hu));
    });

    if (hasMoreHUs) {
        const totalCarretas = carretas[canal].length;
        if (carretaIdx >= totalCarretas - 1) {
            carretas[canal].push({
                placa: `${canal} Extra ${totalCarretas}`,
                hus: [],
                expedida: false,
                fechada: false,
                ordemEquipamentos: []
            });
        }
        carregamentoState.carretaAtualIdx++;
    } else {
        moveToNextCanalizacao();
    }

    renderExpedidas();
    showStep(4);
}

function moveToNextCanalizacao() {
    const keys = carregamentoState.canalizacoesOrdem;
    const currentIdx = keys.indexOf(carregamentoState.canalizacaoAtual);
    if (currentIdx < keys.length - 1) {
        carregamentoState.canalizacaoAtual = keys[currentIdx + 1];
        carregamentoState.carretaAtualIdx = 0;
    }
}


// ============================================================
// STEP 4: Expedidas - Render and Print
// ============================================================
function renderExpedidas() {
    carretasExpedidas.innerHTML = '';

    for (const canal of Object.keys(carretas)) {
        const color = getCanalizacaoColor(canal);
        for (let i = 0; i < carretas[canal].length; i++) {
            const carreta = carretas[canal][i];
            if (!carreta.expedida) continue;

            const section = document.createElement('div');
            section.className = 'carreta-expedida';
            section.style.borderColor = color.main;
            section.dataset.canal = canal;
            section.dataset.idx = i;

            const totalPcts = carreta.hus.reduce((s, h) => s + h.pacotes, 0);

            const header = document.createElement('div');
            header.className = 'carreta-expedida-header';
            header.style.background = color.main;
            header.innerHTML = `
                <h3>${canal} — ${carreta.placa}</h3>
                <span>${carreta.hus.length} HUs · ${totalPcts.toLocaleString('pt-BR')} pacotes</span>
                <span>Equipamentos: ${carreta.ordemEquipamentos.map((v, idx) => `${idx+1}º ${getVeiculoIcon(v)} ${v}`).join(' | ')}</span>
            `;
            section.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'qr-grid';
            for (const hu of carreta.hus) {
                grid.appendChild(createQRCard(hu, color));
            }
            section.appendChild(grid);

            const printBtn = document.createElement('button');
            printBtn.className = 'btn btn-primary btn-print-carreta';
            printBtn.textContent = `🖨️ Imprimir ${carreta.placa}`;
            printBtn.addEventListener('click', () => printCarreta(canal, i));
            section.appendChild(printBtn);

            carretasExpedidas.appendChild(section);
        }
    }

    // Back to carregamento button if not all done
    const allDone = Object.keys(carretas).every(canal => {
        return !equipamentos.some(eq => {
            if (!eq.canalizacoes[canal]) return false;
            return eq.canalizacoes[canal].some(hu => !isHuAlocada(canal, hu.hu));
        });
    });

    if (!allDone) {
        const backBtn = document.createElement('button');
        backBtn.className = 'btn btn-primary';
        backBtn.style.marginTop = '20px';
        backBtn.textContent = '← Continuar Carregamento';
        backBtn.addEventListener('click', () => { showStep(3); renderCarregamento(); });
        carretasExpedidas.appendChild(backBtn);
    }
}

function createQRCard(item, color) {
    const card = document.createElement('div');
    card.className = 'qr-card';
    card.style.borderColor = color.border;

    const canvas = document.createElement('canvas');
    card.appendChild(canvas);

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
    }

    const huLabel = document.createElement('div');
    huLabel.className = 'qr-hu-number';
    huLabel.textContent = item.hu;
    card.appendChild(huLabel);

    const pacotesLabel = document.createElement('div');
    pacotesLabel.className = 'qr-pacotes';
    pacotesLabel.textContent = `${item.pacotes} pacotes`;
    card.appendChild(pacotesLabel);

    if (item.veiculo) {
        const veiculoLabel = document.createElement('div');
        veiculoLabel.className = 'qr-veiculo';
        veiculoLabel.textContent = `${getVeiculoIcon(item.veiculo)} ${item.veiculo}`;
        card.appendChild(veiculoLabel);
    }

    const canalizacaoLabel = document.createElement('div');
    canalizacaoLabel.className = 'qr-canalizacao';
    canalizacaoLabel.style.background = color.main;
    canalizacaoLabel.textContent = item.canalizacao;
    card.appendChild(canalizacaoLabel);

    return card;
}

// ============================================================
// Print Functions
// ============================================================
function printCarreta(canal, idx) {
    document.body.classList.add('print-single-carreta');
    const sections = document.querySelectorAll('.carreta-expedida');
    sections.forEach(s => {
        if (s.dataset.canal === canal && parseInt(s.dataset.idx) === idx) {
            s.classList.add('print-visible');
        } else {
            s.classList.remove('print-visible');
        }
    });
    window.print();
    setTimeout(() => {
        document.body.classList.remove('print-single-carreta');
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

    parsedData = {};
    equipamentos = [];
    carretas = {};
    carregamentoState = { canalizacaoAtual: null, carretaAtualIdx: 0, ordemChegada: [], canalizacoesOrdem: [] };
    extraColorIndex = 0;

    const predefined = ['SAL', 'SSE', 'JPA', 'SNR', 'PRN'];
    for (const key of Object.keys(CANALIZACAO_COLORS)) {
        if (!predefined.includes(key)) delete CANALIZACAO_COLORS[key];
    }

    summaryCards.innerHTML = '';
    carretasConfig.innerHTML = '';
    equipamentosLista.innerHTML = '';
    carretaConteudo.innerHTML = '';
    carretasExpedidas.innerHTML = '';
    document.getElementById('allQrCodesContainer').innerHTML = '';

    showStep(1);
}
