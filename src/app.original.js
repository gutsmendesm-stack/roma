// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
// COLOR CONFIGURATION - All dynamic, auto-assigned
// ============================================================
const COLOR_PALETTE = [
    { main: '#1a56db', light: '#eff6ff', border: '#93c5fd' },
    { main: '#dc2626', light: '#fef2f2', border: '#fca5a5' },
    { main: '#7c3aed', light: '#f5f3ff', border: '#c4b5fd' },
    { main: '#059669', light: '#ecfdf5', border: '#6ee7b7' },
    { main: '#d97706', light: '#fffbeb', border: '#fcd34d' },
    { main: '#0891b2', light: '#ecfeff', border: '#67e8f9' },
    { main: '#be185d', light: '#fdf2f8', border: '#f9a8d4' },
    { main: '#4338ca', light: '#eef2ff', border: '#a5b4fc' },
    { main: '#b45309', light: '#fef3c7', border: '#fbbf24' },
    { main: '#065f46', light: '#d1fae5', border: '#34d399' },
];

let canalizacaoColors = {};
let colorIndex = 0;

function getCanalizacaoColor(key) {
    if (canalizacaoColors[key]) return canalizacaoColors[key];
    const color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
    canalizacaoColors[key] = { ...color, name: key };
    colorIndex++;
    return canalizacaoColors[key];
}

function getVeiculoIcon(veiculo) {
    if (!veiculo) return '📦';
    const v = veiculo.toUpperCase();
    return (v.startsWith('PAG') || v.startsWith('PKC')) ? '✈️' : '📥';
}

// ============================================================
// STATE
// ============================================================
let parsedData = {};
let equipamentos = [];
let carretas = {};          // { canalizacaoKey: [{ placa, hus: [], expedida, fechada, ordemEquipamentos }] }
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
const btnIniciarCarregamento = document.getElementById('btnIniciarCarregamento');
const btnIniciarCarregamento2 = document.getElementById('btnIniciarCarregamento2');
const btnVoltarUpload = document.getElementById('btnVoltarUpload');

const carregamentoTitle = document.getElementById('carregamentoTitle');
const carretaAtualInfo = document.getElementById('carretaAtualInfo');
const carretaPlacaInput = document.getElementById('carretaPlacaInput');
const equipamentosLista = document.getElementById('equipamentosLista');
const carretaPanelTitle = document.getElementById('carretaPanelTitle');
const carretaConteudo = document.getElementById('carretaConteudo');
const btnFecharCarreta = document.getElementById('btnFecharCarreta');
const btnExpedirCarreta = document.getElementById('btnExpedirCarreta');
const btnVoltarQR = document.getElementById('btnVoltarQR');
const btnVerExpedidas = document.getElementById('btnVerExpedidas');

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
btnIniciarCarregamento2.addEventListener('click', iniciarCarregamento);
btnVoltarUpload.addEventListener('click', () => showStep(1));
btnFecharCarreta.addEventListener('click', fecharCarretaAtual);
btnExpedirCarreta.addEventListener('click', expedirCarretaAtual);
btnVoltarQR.addEventListener('click', () => showStep(2));
btnVerExpedidas.addEventListener('click', () => { renderExpedidas(); showStep(4); });
btnVoltarCarregamento.addEventListener('click', () => { showStep(3); renderCarregamento(); });
btnNovaOperacao.addEventListener('click', resetAll);

// ============================================================
// Navigation - preserves state between steps
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

    // First pass: identify multi-page romaneios and group pages together
    // Pages that are continuations (pag 2/2) don't have metadata,
    // so we need to carry over metadata from the first page
    let currentMeta = null;

    for (const pageText of pagesText) {
        // Check if this page has its own metadata (first page of a romaneio)
        const hasMetadata = /Ve[ií]culo:/i.test(pageText);

        if (hasMetadata) {
            // Extract metadata
            const idMatch = pageText.match(/ID\s+(\d{13,19})/);
            const romaneioId = idMatch ? idMatch[1] : '';

            const veiculoMatch = pageText.match(/Ve[ií]culo:\s*([^\s]+(?:\s+[^\s]+)?(?:\s+[^\s]+)?)/i);
            let veiculo = veiculoMatch ? veiculoMatch[1].trim() : '';
            // Clean up: remove Doca: suffix
            veiculo = veiculo.replace(/Doca:.*/, '').trim();
            // Cut at the first invalid character (anything that's not letter, number, or space)
            // Valid vehicle names: PAG 00241 G3, DNA 5779 C 5, FOS, PKC 000028 G3
            const cleanMatch = veiculo.match(/^[a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*/);
            veiculo = cleanMatch ? cleanMatch[0].trim() : veiculo;

            const lacreMatch = pageText.match(/Lacre:\s*([^\n]+?)(?:\s+Destino|\s+$)/i);
            const lacre = lacreMatch ? lacreMatch[1].trim() : '';

            const docaMatch = pageText.match(/Doca:\s*(Doca\s*\d+)/i);
            const doca = docaMatch ? docaMatch[1].trim() : '';

            const operadorMatch = pageText.match(/Operador:\s*(\S+)/i);
            const operador = operadorMatch ? operadorMatch[1].trim() : '';

            const inicioMatch = pageText.match(/In[ií]cio:\s*(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i);
            const horario = inicioMatch ? inicioMatch[1] : '';

            currentMeta = { romaneioId, veiculo, lacre, doca, operador, horario };
        }
        // If no metadata found, use currentMeta from previous page (continuation)

        const meta = currentMeta || { romaneioId: '', veiculo: '', lacre: '', doca: '', operador: '', horario: '' };

        const containerPattern = /(\d{13,19})\s*(?:\[master\])?\s+(\d+)\s+([A-Z]{2,10}\d*_[A-Z0-9]+)/gi;
        let match;
        while ((match = containerPattern.exec(pageText)) !== null) {
            const hu = match[1];
            const pacotes = parseInt(match[2]);
            const canalizacao = match[3].toUpperCase();
            const canalizacaoKey = canalizacao;

            const entry = {
                hu, pacotes, canalizacao, canalizacaoKey,
                veiculo: meta.veiculo,
                lacre: meta.lacre,
                doca: meta.doca,
                operador: meta.operador,
                horario: meta.horario,
                romaneioId: meta.romaneioId
            };
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
// STEP 2: Summary + All QR Codes
// ============================================================
function showStep2() {
    showStep(2);
    const keys = Object.keys(parsedData).sort();

    // Summary cards
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

    // Render ALL QR codes section
    renderAllQRCodes(keys);
}

function renderAllQRCodes(keys) {
    const container = document.getElementById('allQrCodesContainer');
    container.innerHTML = '';

    // Print buttons
    const printActions = document.createElement('div');
    printActions.className = 'print-all-actions';
    for (const key of keys) {
        const color = getCanalizacaoColor(key);
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.style.background = color.main;
        btn.style.color = 'white';
        btn.textContent = `Imprimir ${key}`;
        btn.addEventListener('click', () => printCanalizacao(key));
        printActions.appendChild(btn);
    }
    if (keys.length > 1) {
        const btnAll = document.createElement('button');
        btnAll.className = 'btn';
        btnAll.style.background = '#2c3e50';
        btnAll.style.color = 'white';
        btnAll.textContent = 'Imprimir Tudo';
        btnAll.addEventListener('click', () => {
            document.body.classList.add('print-all-qr');
            window.print();
            setTimeout(() => document.body.classList.remove('print-all-qr'), 500);
        });
        printActions.appendChild(btnAll);
    }
    container.appendChild(printActions);

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const color = getCanalizacaoColor(key);
        const items = parsedData[key];

        if (i > 0) {
            const divider = document.createElement('div');
            divider.className = 'section-divider';
            divider.innerHTML = `&#9888; ACIMA: ${keys[i-1]} &mdash; ABAIXO: ${key} &#9888;`;
            container.appendChild(divider);
        }

        const section = document.createElement('section');
        section.className = 'canalizacao-section';
        section.dataset.canal = key;
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
}

function printCanalizacao(key) {
    document.body.classList.add('print-single-canal');
    document.body.dataset.printCanal = key;
    const sections = document.querySelectorAll('.canalizacao-section');
    sections.forEach(s => {
        if (s.dataset.canal === key) s.classList.add('print-visible');
        else s.classList.remove('print-visible');
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
// STEP 3: Carregamento - Dynamic carretas
// ============================================================
function iniciarCarregamento() {
    const keys = Object.keys(parsedData).sort();

    if (carregamentoState.canalizacoesOrdem.length === 0) {
        carregamentoState.canalizacoesOrdem = keys;
        carregamentoState.carretaAtualIdx = 0;
        // Start with empty group - user adds canalizacoes via buttons
        carregamentoState.grupoAtual = [];
    }

    // Initialize carreta list if empty
    if (!carretas['_current']) {
        carretas['_current'] = [{
            placa: '',
            hus: [],
            expedida: false,
            fechada: false,
            ordemEquipamentos: [],
            canalizacoes: []
        }];
    }

    showStep(3);
    renderCarregamento();
}

function getCarretaAtual() {
    const idx = carregamentoState.carretaAtualIdx;
    return carretas['_current'][idx];
}

function renderCarregamento() {
    const grupo = carregamentoState.grupoAtual;
    const carretaIdx = carregamentoState.carretaAtualIdx;
    const carreta = carretas['_current'][carretaIdx];
    const carretaNum = carretaIdx + 1;

    // Title
    if (grupo.length === 0) {
        carregamentoTitle.textContent = 'Nova Carreta';
        carregamentoTitle.style.color = '#2c3e50';
    } else {
        const color = getCanalizacaoColor(grupo[0]);
        carregamentoTitle.textContent = `Carregando: ${grupo.join(' + ')}`;
        carregamentoTitle.style.color = color.main;
    }

    const totalAlocado = carreta.hus.reduce((s, h) => s + h.pacotes, 0);
    const badgeColor = grupo.length > 0 ? getCanalizacaoColor(grupo[0]).main : '#6b7280';
    carretaAtualInfo.innerHTML = `
        <span class="badge" style="background:${badgeColor}">Carreta ${carretaNum}</span>
        <span class="pacotes-counter">${totalAlocado.toLocaleString('pt-BR')} pacotes alocados</span>
    `;

    // Placa input
    carretaPlacaInput.innerHTML = `
        <label>Placa da carreta:</label>
        <input type="text" class="input-placa" id="inputPlacaAtual" value="${carreta.placa}" placeholder="Digite a placa...">
    `;
    const placaInput = document.getElementById('inputPlacaAtual');
    placaInput.addEventListener('input', (e) => {
        carreta.placa = e.target.value.trim();
        carretaPanelTitle.textContent = carreta.placa || `Carreta ${carretaNum}`;
    });

    carretaPanelTitle.textContent = carreta.placa || `Carreta ${carretaNum}`;

    renderEquipamentosLista(grupo);
    renderCarretaConteudo('_current', carretaIdx);
    updateCarregamentoButtons();
    renderAddCanalizacao(grupo);

    // Show "ver expedidas" button if any carreta was expedida
    const hasExpedidas = carretas['_current'].some(c => c.expedida);
    btnVerExpedidas.style.display = hasExpedidas ? 'inline-block' : 'none';
}

function renderAddCanalizacao(grupoAtual) {
    let mergeContainer = document.getElementById('mergeContainer');
    if (!mergeContainer) {
        mergeContainer = document.createElement('div');
        mergeContainer.id = 'mergeContainer';
        mergeContainer.className = 'merge-container';
        document.getElementById('carregamentoHeader').appendChild(mergeContainer);
    }
    mergeContainer.innerHTML = '';

    // Find canalizacoes available to add (not fully allocated)
    const available = carregamentoState.canalizacoesOrdem.filter(canal => {
        // Already in current group
        if (grupoAtual.includes(canal)) return false;
        // Check if there are still unallocated HUs
        return equipamentos.some(eq => {
            if (!eq.canalizacoes[canal]) return false;
            return eq.canalizacoes[canal].some(hu => !isHuAlocadaGlobal(canal, hu.hu));
        });
    });

    if (available.length === 0) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'merge-wrapper';
    wrapper.innerHTML = `<span class="merge-label">Adicionar canalização nesta carreta:</span>`;

    for (const canal of available) {
        const color = getCanalizacaoColor(canal);
        const btn = document.createElement('button');
        btn.className = 'btn-merge';
        btn.style.borderColor = color.main;
        btn.style.color = color.main;
        btn.textContent = `+ ${canal}`;
        btn.addEventListener('click', () => addCanalizacaoToCarreta(canal));
        wrapper.appendChild(btn);
    }

    mergeContainer.appendChild(wrapper);
}

function addCanalizacaoToCarreta(canal) {
    if (!carregamentoState.grupoAtual.includes(canal)) {
        carregamentoState.grupoAtual.push(canal);
    }
    const carreta = getCarretaAtual();
    if (!carreta.canalizacoes.includes(canal)) {
        carreta.canalizacoes.push(canal);
    }
    renderCarregamento();
}

function isHuAlocadaGlobal(canal, huId) {
    if (!carretas['_current']) return false;
    for (const carreta of carretas['_current']) {
        if (carreta.hus.some(h => h.hu === huId)) return true;
    }
    return false;
}

function renderEquipamentosLista(grupo) {
    equipamentosLista.innerHTML = '';

    if (grupo.length === 0) {
        equipamentosLista.innerHTML = '<p class="empty-carreta">Adicione canalizações nesta carreta usando os botões acima.</p>';
        return;
    }

    const aguardando = equipamentos.filter(eq => {
        return grupo.some(canal => {
            if (!eq.canalizacoes[canal]) return false;
            return eq.canalizacoes[canal].some(hu => !isHuAlocadaGlobal(canal, hu.hu));
        });
    });

    if (aguardando.length === 0) {
        equipamentosLista.innerHTML = '<p class="all-done">✅ Todos os equipamentos destas canalizações já foram alocados!</p>';
        return;
    }

    for (const eq of aguardando) {
        let husCanal = [];
        for (const canal of grupo) {
            if (eq.canalizacoes[canal]) {
                husCanal = husCanal.concat(eq.canalizacoes[canal].filter(hu => !isHuAlocadaGlobal(canal, hu.hu)));
            }
        }
        const totalPcts = husCanal.reduce((s, h) => s + h.pacotes, 0);
        const icon = getVeiculoIcon(eq.veiculo);

        const item = document.createElement('div');
        item.className = 'equipamento-item aguardando';
        item.innerHTML = `
            <div class="eq-info">
                <span class="eq-icon">${icon}</span>
                <span class="eq-veiculo">${eq.veiculo || 'Sem veículo'}</span>
                <span class="eq-detail">${husCanal.length} HUs · ${totalPcts.toLocaleString('pt-BR')} pcts</span>
            </div>
            <button class="btn-chegou">Chegou</button>
        `;
        item.querySelector('.btn-chegou').addEventListener('click', () => {
            equipamentoChegou(eq.veiculo, grupo);
        });
        equipamentosLista.appendChild(item);
    }
}

function equipamentoChegou(veiculo, grupo) {
    if (!carregamentoState.ordemChegada.includes(veiculo)) {
        carregamentoState.ordemChegada.push(veiculo);
    }

    const eq = equipamentos.find(e => e.veiculo === veiculo);
    if (!eq) return;

    const carreta = getCarretaAtual();

    for (const canal of grupo) {
        if (!eq.canalizacoes[canal]) continue;
        const husToAllocate = eq.canalizacoes[canal].filter(hu => !isHuAlocadaGlobal(canal, hu.hu));
        for (const hu of husToAllocate) {
            carreta.hus.push(hu);
        }
    }

    if (!carreta.ordemEquipamentos.includes(veiculo)) {
        carreta.ordemEquipamentos.push(veiculo);
    }

    renderCarregamento();
}

function isHuAlocada(canal, huId) {
    return isHuAlocadaGlobal(canal, huId);
}


function renderCarretaConteudo(key, carretaIdx) {
    const carreta = carretas[key][carretaIdx];
    carretaConteudo.innerHTML = '';

    if (carreta.hus.length === 0) {
        carretaConteudo.innerHTML = '<p class="empty-carreta">Nenhuma HU alocada ainda. Marque os equipamentos conforme chegam.</p>';
        return;
    }

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
                <span>${ordem}º ${icon} ${v || 'Sem veículo'}</span>
                <span>${hus.length} HUs · ${totalPcts.toLocaleString('pt-BR')} pcts</span>
                <button class="btn-remover-equip" title="Remover">&#10005;</button>
            </div>
        `;
        group.querySelector('.btn-remover-equip').addEventListener('click', () => {
            removerEquipamentoDaCarreta(v, carretaIdx);
        });
        carretaConteudo.appendChild(group);
        ordem++;
    }

    const totalAll = carreta.hus.reduce((s, h) => s + h.pacotes, 0);
    const totalDiv = document.createElement('div');
    totalDiv.className = 'carreta-total';
    totalDiv.innerHTML = `<strong>Total: ${carreta.hus.length} HUs · ${totalAll.toLocaleString('pt-BR')} pacotes</strong>`;
    carretaConteudo.appendChild(totalDiv);
}

function removerEquipamentoDaCarreta(veiculo, carretaIdx) {
    const carreta = carretas['_current'][carretaIdx];
    carreta.hus = carreta.hus.filter(h => h.veiculo !== veiculo);
    carreta.ordemEquipamentos = carreta.ordemEquipamentos.filter(v => v !== veiculo);

    const stillInOther = carretas['_current'].some((c, idx) =>
        idx !== carretaIdx && c.hus.some(h => h.veiculo === veiculo)
    );
    if (!stillInOther) {
        carregamentoState.ordemChegada = carregamentoState.ordemChegada.filter(v => v !== veiculo);
    }

    renderCarregamento();
}

function updateCarregamentoButtons() {
    const carreta = getCarretaAtual();
    btnFecharCarreta.style.display = carreta.hus.length > 0 ? 'inline-block' : 'none';
    btnExpedirCarreta.style.display = carreta.hus.length > 0 ? 'inline-block' : 'none';
    btnFecharCarreta.textContent = '🔒 Fechar Carreta e Abrir Nova';
}

function validarPlacaAtual() {
    const carreta = getCarretaAtual();
    if (!carreta.placa || carreta.placa.trim() === '') {
        alert('⚠️ Preencha a placa da carreta antes de continuar!');
        const placaInput = document.getElementById('inputPlacaAtual');
        if (placaInput) {
            placaInput.focus();
            placaInput.style.borderColor = '#e74c3c';
            setTimeout(() => { placaInput.style.borderColor = ''; }, 2000);
        }
        return false;
    }
    return true;
}

function fecharCarretaAtual() {
    if (!validarPlacaAtual()) return;

    const carretaIdx = carregamentoState.carretaAtualIdx;
    carretas['_current'][carretaIdx].fechada = true;
    carretas['_current'][carretaIdx].expedida = true;

    // Create new empty carreta
    carretas['_current'].push({
        placa: '',
        hus: [],
        expedida: false,
        fechada: false,
        ordemEquipamentos: [],
        canalizacoes: []
    });

    carregamentoState.carretaAtualIdx = carretas['_current'].length - 1;
    // Reset grupo for new carreta
    carregamentoState.grupoAtual = [];
    renderCarregamento();
}

function expedirCarretaAtual() {
    if (!validarPlacaAtual()) return;

    const carretaIdx = carregamentoState.carretaAtualIdx;
    carretas['_current'][carretaIdx].expedida = true;
    carretas['_current'][carretaIdx].fechada = true;

    // Check if there are still unallocated HUs
    const allDone = carregamentoState.canalizacoesOrdem.every(canal => {
        return !equipamentos.some(eq => {
            if (!eq.canalizacoes[canal]) return false;
            return eq.canalizacoes[canal].some(hu => !isHuAlocadaGlobal(canal, hu.hu));
        });
    });

    if (!allDone) {
        // Create new empty carreta
        carretas['_current'].push({
            placa: '',
            hus: [],
            expedida: false,
            fechada: false,
            ordemEquipamentos: [],
            canalizacoes: []
        });
        carregamentoState.carretaAtualIdx = carretas['_current'].length - 1;
        carregamentoState.grupoAtual = [];
        renderCarregamento();
    }

    renderExpedidas();
    showStep(4);
}


// ============================================================
// STEP 4: Expedidas - Render and Print
// ============================================================
function renderExpedidas() {
    carretasExpedidas.innerHTML = '';

    for (let i = 0; i < carretas['_current'].length; i++) {
        const carreta = carretas['_current'][i];
        if (!carreta.expedida) continue;

        const canais = carreta.canalizacoes.length > 0 ? carreta.canalizacoes : ['Geral'];
        const color = canais[0] !== 'Geral' ? getCanalizacaoColor(canais[0]) : { main: '#2c3e50', border: '#ccc' };

        const section = document.createElement('div');
        section.className = 'carreta-expedida';
        section.style.borderColor = color.main;
        section.dataset.idx = i;

        const totalPcts = carreta.hus.reduce((s, h) => s + h.pacotes, 0);
        const nome = carreta.placa || `Carreta ${i + 1}`;

        const header = document.createElement('div');
        header.className = 'carreta-expedida-header';
        header.style.background = color.main;
        header.innerHTML = `
            <h3>${canais.join(' + ')} — ${nome}</h3>
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
        printBtn.textContent = `🖨️ Imprimir ${nome}`;
        printBtn.addEventListener('click', () => printCarreta(i));
        section.appendChild(printBtn);

        carretasExpedidas.appendChild(section);
    }

    // Check if all done
    const allDone = carregamentoState.canalizacoesOrdem.every(canal => {
        return !equipamentos.some(eq => {
            if (!eq.canalizacoes[canal]) return false;
            return eq.canalizacoes[canal].some(hu => !isHuAlocadaGlobal(canal, hu.hu));
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
function printCarreta(idx) {
    document.body.classList.add('print-single-carreta');
    const sections = document.querySelectorAll('.carreta-expedida');
    sections.forEach(s => {
        if (parseInt(s.dataset.idx) === idx) {
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
    carregamentoState = { canalizacaoAtual: null, carretaAtualIdx: 0, ordemChegada: [], canalizacoesOrdem: [], grupoAtual: [] };
    colorIndex = 0;
    canalizacaoColors = {};

    summaryCards.innerHTML = '';
    document.getElementById('allQrCodesContainer').innerHTML = '';
    equipamentosLista.innerHTML = '';
    carretaConteudo.innerHTML = '';
    carretasExpedidas.innerHTML = '';

    showStep(1);
}
