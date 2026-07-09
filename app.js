// PDF.js worker config
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ============================================================
// ALERTA BEFOREUNLOAD - Avisa ao tentar sair/atualizar (Item 7)
// ============================================================
let operacaoIniciada = false;
window.addEventListener('beforeunload', function(e) {
    if (operacaoIniciada) {
        e.preventDefault();
        e.returnValue = 'O progresso será perdido. Deseja continuar?';
        return e.returnValue;
    }
});

// Paleta de cores para canalizacoes (atribuicao dinamica)
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


// Icone do equipamento: lamina (PAG/PKC) ou porao (outros)
function getVeiculoIcon(veiculo) {
    if (!veiculo) return '📦';
    const v = veiculo.toUpperCase();
    return (v.startsWith('PAG') || v.startsWith('PKC')) ? '✈️' : '📥';
}

// Verifica se eh lamina (PAG/PKC)
function isLamina(veiculo) {
    if (!veiculo) return false;
    const v = veiculo.toUpperCase();
    return v.startsWith('PAG') || v.startsWith('PKC');
}

// ============================================================
// ESTADO GLOBAL
// ============================================================
let baseSelecionada = '';
let parsedData = {};
let parsedMeta = {}; // metadados do romaneio (destino, data)
let equipamentos = [];
let carretas = {};
let recebimentoState = {
    chegados: {} // { veiculo: { hora: Date, ordem: number } }
};
let recebimentoOrdem = 0;
let carregamentoState = {
    canalizacaoAtual: null,
    carretaAtualIdx: 0,
    ordemChegada: [],
    canalizacoesOrdem: [],
    grupoAtual: []
};


// ============================================================
// ELEMENTOS DO DOM
// ============================================================
const step0 = document.getElementById('step0');
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const step4 = document.getElementById('step4');
const step5 = document.getElementById('step5');
const step6 = document.getElementById('step6');
const step7 = document.getElementById('step7');

const selectBase = document.getElementById('selectBase');
const btnConfirmarBase = document.getElementById('btnConfirmarBase');
const baseInfoLabel = document.getElementById('baseInfoLabel');
const btnTrocarBase = document.getElementById('btnTrocarBase');

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const clearFile = document.getElementById('clearFile');
const loading = document.getElementById('loading');

const hubSummary = document.getElementById('hubSummary');
const btnHubRecebimento = document.getElementById('btnHubRecebimento');
const btnHubQRCodes = document.getElementById('btnHubQRCodes');
const btnHubExpedicao = document.getElementById('btnHubExpedicao');
const btnHubVisualizacao = document.getElementById('btnHubVisualizacao');
const btnNovoUpload = document.getElementById('btnNovoUpload');

const btnVoltarHub1 = document.getElementById('btnVoltarHub1');
const btnVoltarHub2 = document.getElementById('btnVoltarHub2');
const btnVoltarHub2b = document.getElementById('btnVoltarHub2b');
const btnVoltarHub3 = document.getElementById('btnVoltarHub3');
const btnVoltarHub4 = document.getElementById('btnVoltarHub4');
const btnVoltarHub5 = document.getElementById('btnVoltarHub5');
const btnVoltarExpedicao = document.getElementById('btnVoltarExpedicao');

const carregamentoTitle = document.getElementById('carregamentoTitle');
const carretaAtualInfo = document.getElementById('carretaAtualInfo');
const carretaPlacaInput = document.getElementById('carretaPlacaInput');
const equipamentosLista = document.getElementById('equipamentosLista');
const carretaPanelTitle = document.getElementById('carretaPanelTitle');
const carretaConteudo = document.getElementById('carretaConteudo');
const btnFecharCarreta = document.getElementById('btnFecharCarreta');
const btnExpedirCarreta = document.getElementById('btnExpedirCarreta');
const btnVerExpedidas = document.getElementById('btnVerExpedidas');

const carretasExpedidas = document.getElementById('carretasExpedidas');


// ============================================================
// EVENTOS
// ============================================================

// Step 0 - Selecao de base
btnConfirmarBase.addEventListener('click', confirmarBase);

// Step 1 - Upload
btnTrocarBase.addEventListener('click', () => { showStep(0); });
uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
clearFile.addEventListener('click', resetUpload);

uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') processFile(file);
});

// Step 2 - Hub
btnHubRecebimento.addEventListener('click', () => { renderRecebimento(); showStep(3); });
btnHubQRCodes.addEventListener('click', () => { renderAllQRCodes(); showStep(4); });
btnHubExpedicao.addEventListener('click', () => { iniciarExpedicao(); showStep(5); });
btnHubVisualizacao.addEventListener('click', () => { renderVisualizacaoEquipamentos(); showStep(7); });
btnNovoUpload.addEventListener('click', resetAll);

// Voltar ao hub
btnVoltarHub1.addEventListener('click', () => showStep(2));
btnVoltarHub2.addEventListener('click', () => showStep(2));
btnVoltarHub2b.addEventListener('click', () => showStep(2));
btnVoltarHub3.addEventListener('click', () => showStep(2));
btnVoltarHub4.addEventListener('click', () => showStep(2));
btnVoltarHub5.addEventListener('click', () => showStep(2));
btnVoltarExpedicao.addEventListener('click', () => { showStep(5); renderCarregamento(); });

// Expedicao
btnFecharCarreta.addEventListener('click', fecharCarretaAtual);
btnExpedirCarreta.addEventListener('click', expedirCarretaAtual);
btnVerExpedidas.addEventListener('click', () => { renderExpedidas(); showStep(6); });

// Impressao - visualizacao por equipamentos
document.getElementById('btnImprimirTodosEquip').addEventListener('click', imprimirTodosEquipamentosPDF);
document.getElementById('btnImprimirZebraTodos').addEventListener('click', imprimirTodosEquipamentosZebra);


// ============================================================
// NAVEGACAO ENTRE ETAPAS
// ============================================================
function showStep(n) {
    step0.style.display = n === 0 ? 'block' : 'none';
    step1.style.display = n === 1 ? 'block' : 'none';
    step2.style.display = n === 2 ? 'block' : 'none';
    step3.style.display = n === 3 ? 'block' : 'none';
    step4.style.display = n === 4 ? 'block' : 'none';
    step5.style.display = n === 5 ? 'block' : 'none';
    step6.style.display = n === 6 ? 'block' : 'none';
    step7.style.display = n === 7 ? 'block' : 'none';
}

// ============================================================
// STEP 0 - SELECAO DE BASE (Item 1)
// ============================================================
function confirmarBase() {
    const base = selectBase.value;
    if (!base) {
        alert('⚠️ Selecione uma base antes de continuar!');
        return;
    }
    baseSelecionada = base;
    baseInfoLabel.textContent = `Base: ${base}`;
    showStep(1);
}

// ============================================================
// STEP 1 - UPLOAD E PROCESSAMENTO DO PDF
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
        parsedMeta = extractMeta(allText);
        equipamentos = buildEquipamentos(parsedData);

        // Marca que a operacao comecou (beforeunload ativo)
        operacaoIniciada = true;

        // Validacao de destino (Item 1) - pode ser Promise agora
        const destinoOk = await validarDestino();
        if (!destinoOk) return;
        // Validacao de data (Item 2) - pode ser Promise agora
        const dataOk = await validarData();
        if (!dataOk) return;

        // Sucesso - vai pro hub
        showHub();
    } catch (error) {
        console.error('Erro ao processar PDF:', error);
        alert('Erro ao processar o PDF. Verifique se o arquivo é válido.');
        resetUpload();
    } finally {
        loading.style.display = 'none';
    }
}


// ============================================================
// VALIDACAO DE DESTINO (Item 1)
// ============================================================
function extractMeta(pagesText) {
    let destino = '';
    let dataInicio = '';
    for (const pageText of pagesText) {
        // Tenta pegar o destino do romaneio
        const destMatch = pageText.match(/Destino:\s*([A-Z0-9]+)/i);
        if (destMatch && !destino) destino = destMatch[1].trim().toUpperCase();
        // Data de inicio
        const inicioMatch = pageText.match(/In[ií]cio:\s*(\d{2}\/\d{2}\/\d{4})/i);
        if (inicioMatch && !dataInicio) dataInicio = inicioMatch[1];
    }
    return { destino, dataInicio };
}

function validarDestino() {
    if (!parsedMeta.destino) return true;
    if (!baseSelecionada) return true;

    if (!parsedMeta.destino.includes(baseSelecionada) && parsedMeta.destino !== baseSelecionada) {
        return new Promise((resolve) => {
            showModal(
                'Base Diferente Detectada',
                `O romaneio inserido é do airhub <strong>${parsedMeta.destino}</strong>, mas você selecionou <strong>${baseSelecionada}</strong>.<br><br>Deseja continuar mesmo assim?`,
                'warning',
                () => resolve(true),
                () => { resetUpload(); resolve(false); }
            );
        });
    }
    return true;
}

// ============================================================
// VALIDACAO DE DATA (Item 2)
// ============================================================
function validarData() {
    if (!parsedMeta.dataInicio) return true;

    const parts = parsedMeta.dataInicio.split('/');
    if (parts.length !== 3) return true;
    const dataRomaneio = new Date(parts[2], parts[1] - 1, parts[0]);
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    dataRomaneio.setHours(0, 0, 0, 0);

    if (dataRomaneio < hoje) {
        return new Promise((resolve) => {
            showModal(
                'Romaneio de Data Anterior',
                `Este romaneio é do dia <strong>${parsedMeta.dataInicio}</strong>.<br><br>Deseja prosseguir mesmo assim?`,
                'warning',
                () => resolve(true),
                () => { resetUpload(); resolve(false); }
            );
        });
    }
    return true;
}

// ============================================================
// MODAL CUSTOMIZADO (substituindo confirm/alert nativo)
// ============================================================
function showModal(titulo, mensagem, tipo, onConfirm, onCancel) {
    // Remove modal anterior se existir
    const existing = document.getElementById('customModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customModal';
    overlay.className = 'modal-overlay';

    const iconMap = {
        warning: '⚠️',
        error: '❌',
        success: '✅',
        info: 'ℹ️'
    };

    overlay.innerHTML = `
        <div class="modal-box">
            <div class="modal-icon">${iconMap[tipo] || '⚠️'}</div>
            <h2 class="modal-title">${titulo}</h2>
            <p class="modal-message">${mensagem}</p>
            <div class="modal-actions">
                <button class="btn btn-primary modal-btn-confirm">Sim, continuar</button>
                <button class="btn btn-secondary modal-btn-cancel">Cancelar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.modal-btn-confirm').addEventListener('click', () => {
        overlay.remove();
        if (onConfirm) onConfirm();
    });

    overlay.querySelector('.modal-btn-cancel').addEventListener('click', () => {
        overlay.remove();
        if (onCancel) onCancel();
    });

    // Fecha com ESC
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
            if (onCancel) onCancel();
        }
    };
    document.addEventListener('keydown', escHandler);
}


// ============================================================
// PARSING DO PDF
// ============================================================
function parseRomaneios(pagesText) {
    const result = {};
    let currentMeta = null;

    for (const pageText of pagesText) {
        const hasMetadata = /Ve[ií]culo:/i.test(pageText);

        if (hasMetadata) {
            const idMatch = pageText.match(/ID\s+(\d{13,19})/);
            const romaneioId = idMatch ? idMatch[1] : '';

            const veiculoMatch = pageText.match(/Ve[ií]culo:\s*([^\s]+(?:\s+[^\s]+)?(?:\s+[^\s]+)?)/i);
            let veiculo = veiculoMatch ? veiculoMatch[1].trim() : '';
            veiculo = veiculo.replace(/Doca:.*/, '').trim();
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

        const meta = currentMeta || { romaneioId: '', veiculo: '', lacre: '', doca: '', operador: '', horario: '' };

        const containerPattern = /(\d{10,19})\s*(?:\[master\])?\s+(\d+)\s+([A-Z][A-Z0-9]{1,10}_[A-Z0-9]+)/gi;
        let match;
        while ((match = containerPattern.exec(pageText)) !== null) {
            const hu = match[1];
            const pacotes = parseInt(match[2]);
            const canalizacao = match[3].toUpperCase();

            const entry = {
                hu, pacotes, canalizacao,
                canalizacaoKey: canalizacao,
                veiculo: meta.veiculo,
                lacre: meta.lacre,
                doca: meta.doca,
                operador: meta.operador,
                horario: meta.horario,
                romaneioId: meta.romaneioId
            };
            if (!result[canalizacao]) result[canalizacao] = [];
            result[canalizacao].push(entry);
        }
    }
    return result;
}


// Agrupa HUs por equipamento/veiculo
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
// STEP 2 - HUB CENTRAL (Item 3)
// ============================================================
function showHub() {
    showStep(2);
    renderHubSummary();
}

function renderHubSummary() {
    const keys = Object.keys(parsedData).sort();
    let totalHUs = 0, totalPacotes = 0;

    for (const key of keys) {
        const items = parsedData[key];
        totalHUs += items.length;
        totalPacotes += items.reduce((sum, item) => sum + item.pacotes, 0);
    }

    // Conta equipamentos
    const totalEquip = equipamentos.length;
    const laminas = equipamentos.filter(e => isLamina(e.veiculo)).length;
    const porao = totalEquip - laminas;

    hubSummary.innerHTML = `
        <div class="hub-cards">
            <div class="card"><div class="card-value">${keys.length}</div><div class="card-label">Canalizações</div></div>
            <div class="card"><div class="card-value">${totalHUs}</div><div class="card-label">HUs</div></div>
            <div class="card"><div class="card-value">${totalPacotes.toLocaleString('pt-BR')}</div><div class="card-label">Pacotes</div></div>
            <div class="card"><div class="card-value">${totalEquip}</div><div class="card-label">Equipamentos</div></div>
            <div class="card"><div class="card-value">${laminas} ✈️</div><div class="card-label">Lâminas</div></div>
            <div class="card"><div class="card-value">${porao} 📥</div><div class="card-label">Porão</div></div>
        </div>
        <div class="hub-canais">
            ${keys.map(k => {
                const c = getCanalizacaoColor(k);
                const cnt = parsedData[k].length;
                return `<span class="canal-badge" style="background:${c.main}">${k} (${cnt})</span>`;
            }).join(' ')}
        </div>
    `;
}


// ============================================================
// STEP 3 - RECEBIMENTO DE EQUIPAMENTOS (Item 4)
// ============================================================
function renderRecebimento() {
    const laminasDiv = document.getElementById('recebimentoLaminas');
    const poraoDiv = document.getElementById('recebimentoPorao');
    const historicoDiv = document.getElementById('recebimentoHistorico');

    laminasDiv.innerHTML = '';
    poraoDiv.innerHTML = '';

    // Separa equipamentos por tipo
    const eqLaminas = equipamentos.filter(e => isLamina(e.veiculo));
    const eqPorao = equipamentos.filter(e => !isLamina(e.veiculo));

    // Renderiza laminas
    if (eqLaminas.length === 0) {
        laminasDiv.innerHTML = '<p class="empty-carreta">Nenhuma lâmina neste romaneio</p>';
    } else {
        for (const eq of eqLaminas) {
            laminasDiv.appendChild(criarItemRecebimento(eq));
        }
    }

    // Renderiza porao
    if (eqPorao.length === 0) {
        poraoDiv.innerHTML = '<p class="empty-carreta">Nenhum equipamento de porão neste romaneio</p>';
    } else {
        for (const eq of eqPorao) {
            poraoDiv.appendChild(criarItemRecebimento(eq));
        }
    }

    // Historico de chegada
    renderHistoricoRecebimento(historicoDiv);

    // Botao finalizar recebimento (aparece se pelo menos 1 foi recebido)
    let btnFinalizar = document.getElementById('btnFinalizarRecebimento');
    if (!btnFinalizar) {
        btnFinalizar = document.createElement('button');
        btnFinalizar.id = 'btnFinalizarRecebimento';
        btnFinalizar.className = 'btn btn-success';
        btnFinalizar.textContent = '✅ Finalizar Recebimento';
        btnFinalizar.style.marginTop = '20px';
        btnFinalizar.addEventListener('click', finalizarRecebimento);
        document.getElementById('recebimentoHistorico').after(btnFinalizar);
    }
    const totalChegados = Object.keys(recebimentoState.chegados).length;
    btnFinalizar.style.display = totalChegados > 0 ? 'block' : 'none';
    btnFinalizar.style.margin = '20px auto';
}

function criarItemRecebimento(eq) {
    const vid = eq.veiculo || 'SEM_VEICULO';
    const icon = getVeiculoIcon(eq.veiculo);
    const totalHUs = eq.hus.length;
    const totalPcts = eq.hus.reduce((s, h) => s + h.pacotes, 0);
    const canais = Object.keys(eq.canalizacoes).join(', ');
    const jaChegou = recebimentoState.chegados[vid];

    const item = document.createElement('div');
    item.className = `equipamento-item ${jaChegou ? 'recebido' : 'aguardando'}`;

    if (jaChegou) {
        const hora = jaChegou.hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const data = jaChegou.hora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        item.innerHTML = `
            <div class="eq-info">
                <span class="eq-icon">${icon}</span>
                <span class="eq-veiculo">${eq.veiculo || 'Sem veículo'}</span>
                <span class="eq-detail">${totalHUs} HUs · ${totalPcts.toLocaleString('pt-BR')} pcts · ${canais}</span>
            </div>
            <span class="recebido-hora">✅ Chegou ${data} ${hora}</span>
        `;
    } else {
        item.innerHTML = `
            <div class="eq-info">
                <span class="eq-icon">${icon}</span>
                <span class="eq-veiculo">${eq.veiculo || 'Sem veículo'}</span>
                <span class="eq-detail">${totalHUs} HUs · ${totalPcts.toLocaleString('pt-BR')} pcts · ${canais}</span>
            </div>
            <button class="btn-chegou">Registrar Recebimento</button>
        `;
        item.querySelector('.btn-chegou').addEventListener('click', () => {
            registrarChegada(vid);
        });
    }
    return item;
}


function registrarChegada(veiculoId) {
    recebimentoOrdem++;
    recebimentoState.chegados[veiculoId] = {
        hora: new Date(),
        ordem: recebimentoOrdem
    };
    renderRecebimento();
}

function renderHistoricoRecebimento(container) {
    container.innerHTML = '';
    const chegados = Object.entries(recebimentoState.chegados)
        .sort((a, b) => a[1].ordem - b[1].ordem);

    if (chegados.length === 0) {
        container.innerHTML = '<p class="empty-carreta">Nenhum equipamento recebido ainda</p>';
        return;
    }

    for (const [vid, info] of chegados) {
        const eq = equipamentos.find(e => (e.veiculo || 'SEM_VEICULO') === vid);
        const icon = eq ? getVeiculoIcon(eq.veiculo) : '📦';
        const hora = info.hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const data = info.hora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const div = document.createElement('div');
        div.className = 'historico-item';
        div.innerHTML = `<span>${info.ordem}º ${icon} <strong>${vid}</strong></span><span>Chegou ${data} às ${hora}</span>`;
        container.appendChild(div);
    }
}

// ============================================================
// FINALIZAR RECEBIMENTO - verifica nao-recebidos e gera PDF
// ============================================================
function finalizarRecebimento() {
    const todosVeiculos = equipamentos.map(e => e.veiculo || 'SEM_VEICULO');
    const naoRecebidos = todosVeiculos.filter(v => !recebimentoState.chegados[v]);

    if (naoRecebidos.length > 0) {
        const listaStr = naoRecebidos.map(v => `• ${getVeiculoIcon(equipamentos.find(e => (e.veiculo || 'SEM_VEICULO') === v)?.veiculo)} ${v}`).join('<br>');
        showModal(
            'Equipamentos Não Recebidos',
            `Os seguintes equipamentos <strong>não foram registrados</strong>:<br><br>${listaStr}<br><br>Confirma que eles realmente não chegaram?`,
            'warning',
            () => { gerarPDFResumoRecebimento(); },
            null // nao faz nada, volta pra tela
        );
    } else {
        gerarPDFResumoRecebimento();
    }
}

function gerarPDFResumoRecebimento() {
    // Monta conteudo do resumo pra imprimir
    const resumoDiv = document.createElement('div');
    resumoDiv.id = 'resumoRecebimentoPrint';
    resumoDiv.className = 'resumo-recebimento-print';

    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR');
    const horaStr = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let html = `
        <h2>Resumo de Recebimento de Equipamentos</h2>
        <p class="resumo-meta">Base: <strong>${baseSelecionada}</strong> | Gerado em: ${dataStr} às ${horaStr}</p>
        <h3>Equipamentos Recebidos (${Object.keys(recebimentoState.chegados).length})</h3>
        <table class="resumo-table">
            <thead><tr><th>#</th><th>Tipo</th><th>Equipamento</th><th>HUs</th><th>Pacotes</th><th>Data</th><th>Hora</th></tr></thead>
            <tbody>
    `;

    const chegados = Object.entries(recebimentoState.chegados)
        .sort((a, b) => a[1].ordem - b[1].ordem);

    for (const [vid, info] of chegados) {
        const eq = equipamentos.find(e => (e.veiculo || 'SEM_VEICULO') === vid);
        const icon = eq ? getVeiculoIcon(eq.veiculo) : '📦';
        const tipo = eq && isLamina(eq.veiculo) ? 'Lâmina' : 'Porão';
        const totalHUs = eq ? eq.hus.length : 0;
        const totalPcts = eq ? eq.hus.reduce((s, h) => s + h.pacotes, 0) : 0;
        const data = info.hora.toLocaleDateString('pt-BR');
        const hora = info.hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        html += `<tr><td>${info.ordem}º</td><td>${icon} ${tipo}</td><td><strong>${vid}</strong></td><td>${totalHUs}</td><td>${totalPcts.toLocaleString('pt-BR')}</td><td>${data}</td><td>${hora}</td></tr>`;
    }
    html += `</tbody></table>`;

    // Nao recebidos
    const todosVeiculos = equipamentos.map(e => e.veiculo || 'SEM_VEICULO');
    const naoRecebidos = todosVeiculos.filter(v => !recebimentoState.chegados[v]);

    if (naoRecebidos.length > 0) {
        html += `<h3 class="resumo-alerta">⚠️ Equipamentos NÃO Recebidos (${naoRecebidos.length})</h3><ul class="resumo-nao-recebidos">`;
        for (const v of naoRecebidos) {
            const eq = equipamentos.find(e => (e.veiculo || 'SEM_VEICULO') === v);
            const icon = eq ? getVeiculoIcon(eq.veiculo) : '📦';
            html += `<li>${icon} <strong>${v}</strong></li>`;
        }
        html += `</ul>`;
    } else {
        html += `<p class="resumo-ok">✅ Todos os equipamentos foram recebidos!</p>`;
    }

    resumoDiv.innerHTML = html;
    document.body.appendChild(resumoDiv);

    // Imprime
    document.body.classList.add('print-resumo-recebimento');
    window.print();
    setTimeout(() => {
        document.body.classList.remove('print-resumo-recebimento');
        resumoDiv.remove();
    }, 500);
}

// ============================================================
// STEP 4 - QR CODES PARA BIPAGEM
// ============================================================
function renderAllQRCodes() {
    const container = document.getElementById('allQrCodesContainer');
    container.innerHTML = '';
    const keys = Object.keys(parsedData).sort();

    // Botoes de impressao
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
            <h2 style="color: ${color.main}">CANALIZAÇÃO ${key}</h2>
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
// STEP 5 - EXPEDICAO DE CARRETAS (Item 8 - sem botao Chegou)
// ============================================================
function iniciarExpedicao() {
    const keys = Object.keys(parsedData).sort();

    if (carregamentoState.canalizacoesOrdem.length === 0) {
        carregamentoState.canalizacoesOrdem = keys;
        carregamentoState.carretaAtualIdx = 0;
        carregamentoState.grupoAtual = [];
    }

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

    renderEquipamentosExpedicao(grupo);
    renderCarretaConteudo('_current', carretaIdx);
    updateCarregamentoButtons();
    renderAddCanalizacao(grupo);

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

    const available = carregamentoState.canalizacoesOrdem.filter(canal => {
        if (grupoAtual.includes(canal)) return false;
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


// Expedicao - lista equipamentos para alocar (SEM botao "Chegou", Item 8)
// Usa a ordem de chegada do recebimento se disponivel
function renderEquipamentosExpedicao(grupo) {
    equipamentosLista.innerHTML = '';

    if (grupo.length === 0) {
        equipamentosLista.innerHTML = '<p class="empty-carreta">Adicione canalizações nesta carreta usando os botões acima.</p>';
        return;
    }

    // Filtra equipamentos que tem HUs nao alocadas para o grupo atual
    let aguardando = equipamentos.filter(eq => {
        return grupo.some(canal => {
            if (!eq.canalizacoes[canal]) return false;
            return eq.canalizacoes[canal].some(hu => !isHuAlocadaGlobal(canal, hu.hu));
        });
    });

    if (aguardando.length === 0) {
        equipamentosLista.innerHTML = '<p class="all-done">✅ Todos os equipamentos destas canalizações já foram alocados!</p>';
        return;
    }

    // Ordena pela ordem de chegada do recebimento (quem chegou primeiro, aloca primeiro)
    aguardando.sort((a, b) => {
        const vidA = a.veiculo || 'SEM_VEICULO';
        const vidB = b.veiculo || 'SEM_VEICULO';
        const chegouA = recebimentoState.chegados[vidA];
        const chegouB = recebimentoState.chegados[vidB];
        if (chegouA && chegouB) return chegouA.ordem - chegouB.ordem;
        if (chegouA) return -1;
        if (chegouB) return 1;
        return 0;
    });

    for (const eq of aguardando) {
        let husCanal = [];
        for (const canal of grupo) {
            if (eq.canalizacoes[canal]) {
                husCanal = husCanal.concat(eq.canalizacoes[canal].filter(hu => !isHuAlocadaGlobal(canal, hu.hu)));
            }
        }
        const totalPcts = husCanal.reduce((s, h) => s + h.pacotes, 0);
        const icon = getVeiculoIcon(eq.veiculo);
        const vid = eq.veiculo || 'SEM_VEICULO';
        const chegou = recebimentoState.chegados[vid];
        const horaStr = chegou ? ` · chegou ${chegou.hora.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}` : '';

        const item = document.createElement('div');
        item.className = 'equipamento-item aguardando';
        item.innerHTML = `
            <div class="eq-info">
                <span class="eq-icon">${icon}</span>
                <span class="eq-veiculo">${eq.veiculo || 'Sem veículo'}</span>
                <span class="eq-detail">${husCanal.length} HUs · ${totalPcts.toLocaleString('pt-BR')} pcts${horaStr}</span>
            </div>
            <button class="btn-alocar">Alocar na Carreta</button>
        `;
        item.querySelector('.btn-alocar').addEventListener('click', () => {
            alocarEquipamentoNaCarreta(eq.veiculo, grupo);
        });
        equipamentosLista.appendChild(item);
    }
}

// Aloca equipamento direto na carreta (sem precisar de "Chegou")
function alocarEquipamentoNaCarreta(veiculo, grupo) {
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


function renderCarretaConteudo(key, carretaIdx) {
    const carreta = carretas[key][carretaIdx];
    carretaConteudo.innerHTML = '';

    if (carreta.hus.length === 0) {
        carretaConteudo.innerHTML = '<p class="empty-carreta">Nenhuma HU alocada ainda. Aloque os equipamentos da lista.</p>';
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
    renderCarregamento();
}

function updateCarregamentoButtons() {
    const carreta = getCarretaAtual();
    btnFecharCarreta.style.display = carreta.hus.length > 0 ? 'inline-block' : 'none';
    btnExpedirCarreta.style.display = carreta.hus.length > 0 ? 'inline-block' : 'none';
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

    carretas['_current'].push({
        placa: '', hus: [], expedida: false, fechada: false,
        ordemEquipamentos: [], canalizacoes: []
    });

    carregamentoState.carretaAtualIdx = carretas['_current'].length - 1;
    carregamentoState.grupoAtual = [];
    renderCarregamento();
}

function expedirCarretaAtual() {
    if (!validarPlacaAtual()) return;

    const carretaIdx = carregamentoState.carretaAtualIdx;
    carretas['_current'][carretaIdx].expedida = true;
    carretas['_current'][carretaIdx].fechada = true;

    const allDone = carregamentoState.canalizacoesOrdem.every(canal => {
        return !equipamentos.some(eq => {
            if (!eq.canalizacoes[canal]) return false;
            return eq.canalizacoes[canal].some(hu => !isHuAlocadaGlobal(canal, hu.hu));
        });
    });

    if (!allDone) {
        carretas['_current'].push({
            placa: '', hus: [], expedida: false, fechada: false,
            ordemEquipamentos: [], canalizacoes: []
        });
        carregamentoState.carretaAtualIdx = carretas['_current'].length - 1;
        carregamentoState.grupoAtual = [];
        renderCarregamento();
    }

    renderExpedidas();
    showStep(6);
}

// ============================================================
// STEP 6 - CARRETAS EXPEDIDAS
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
            <span>Equip: ${carreta.ordemEquipamentos.map((v, idx) => `${idx+1}º ${getVeiculoIcon(v)} ${v}`).join(' | ')}</span>
        `;
        section.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'qr-grid';
        for (const hu of carreta.hus) {
            grid.appendChild(createQRCard(hu, color));
        }
        section.appendChild(grid);

        const btnActions = document.createElement('div');
        btnActions.className = 'carreta-exp-actions';
        btnActions.innerHTML = `
            <button class="btn btn-primary btn-print-carreta">🖨️ Imprimir ${nome} (PDF)</button>
            <button class="btn btn-warning btn-print-zebra">🏷️ Imprimir Etiquetas</button>
        `;
        btnActions.querySelector('.btn-print-carreta').addEventListener('click', () => printCarreta(i));
        btnActions.querySelector('.btn-print-zebra').addEventListener('click', () => printCarretaZebra(i));
        section.appendChild(btnActions);

        carretasExpedidas.appendChild(section);
    }

    // Botao voltar ao carregamento se ainda tem HUs
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
        backBtn.textContent = '← Continuar Expedição';
        backBtn.addEventListener('click', () => { showStep(5); renderCarregamento(); });
        carretasExpedidas.appendChild(backBtn);
    }
}


// Impressao de carreta (PDF normal)
function printCarreta(idx) {
    document.body.classList.add('print-single-carreta');
    const sections = document.querySelectorAll('.carreta-expedida');
    sections.forEach(s => {
        if (parseInt(s.dataset.idx) === idx) s.classList.add('print-visible');
        else s.classList.remove('print-visible');
    });
    window.print();
    setTimeout(() => {
        document.body.classList.remove('print-single-carreta');
        sections.forEach(s => s.classList.remove('print-visible'));
    }, 500);
}

// Impressao de carreta (formato Zebra - etiqueta via EPL)
function printCarretaZebra(idx) {
    const carreta = carretas['_current'][idx];
    if (!carreta) return;
    gerarEPLeImprimir(carreta.hus);
}

// ============================================================
// STEP 7 - VISUALIZACAO POR EQUIPAMENTOS (Item 5)
// ============================================================
function renderVisualizacaoEquipamentos() {
    const container = document.getElementById('visualizacaoEquipamentos');
    container.innerHTML = '';

    // Ordena: laminas primeiro, depois porao, por nome
    const sorted = [...equipamentos].sort((a, b) => {
        const aLam = isLamina(a.veiculo) ? 0 : 1;
        const bLam = isLamina(b.veiculo) ? 0 : 1;
        if (aLam !== bLam) return aLam - bLam;
        return (a.veiculo || '').localeCompare(b.veiculo || '');
    });

    for (const eq of sorted) {
        const vid = eq.veiculo || 'SEM_VEICULO';
        const icon = getVeiculoIcon(eq.veiculo);
        const totalHUs = eq.hus.length;
        const totalPcts = eq.hus.reduce((s, h) => s + h.pacotes, 0);
        const canais = Object.keys(eq.canalizacoes).join(', ');
        const tipo = isLamina(eq.veiculo) ? 'Lâmina' : 'Porão';

        const accordion = document.createElement('div');
        accordion.className = 'accordion-item';

        const header = document.createElement('div');
        header.className = 'accordion-header';
        header.innerHTML = `
            <div class="accordion-title">
                <span class="eq-icon">${icon}</span>
                <strong>${eq.veiculo || 'Sem veículo'}</strong>
                <span class="accordion-badge">${tipo}</span>
            </div>
            <div class="accordion-meta">
                <span>${totalHUs} HUs · ${totalPcts.toLocaleString('pt-BR')} pcts</span>
                <span>${canais}</span>
                <span class="accordion-arrow">▼</span>
            </div>
        `;

        const body = document.createElement('div');
        body.className = 'accordion-body';
        body.style.display = 'none';

        // Botoes de impressao por equipamento
        const eqActions = document.createElement('div');
        eqActions.className = 'eq-print-actions';
        eqActions.innerHTML = `
            <button class="btn btn-primary btn-sm">🖨️ Imprimir (PDF)</button>
            <button class="btn btn-warning btn-sm">🏷️ Imprimir Etiquetas</button>
        `;
        eqActions.querySelector('.btn-primary').addEventListener('click', (e) => {
            e.stopPropagation();
            imprimirEquipamentoPDF(vid);
        });
        eqActions.querySelector('.btn-warning').addEventListener('click', (e) => {
            e.stopPropagation();
            imprimirEquipamentoZebra(vid);
        });
        body.appendChild(eqActions);

        // QR Grid do equipamento
        const grid = document.createElement('div');
        grid.className = 'qr-grid';
        grid.dataset.equip = vid;
        for (const hu of eq.hus) {
            const color = getCanalizacaoColor(hu.canalizacao);
            grid.appendChild(createQRCard(hu, color));
        }
        body.appendChild(grid);
        accordion.appendChild(header);
        accordion.appendChild(body);

        // Toggle accordion
        header.addEventListener('click', () => {
            const isOpen = body.style.display !== 'none';
            body.style.display = isOpen ? 'none' : 'block';
            header.querySelector('.accordion-arrow').textContent = isOpen ? '▼' : '▲';
        });

        container.appendChild(accordion);
    }
}


// Impressao por equipamento (PDF normal)
function imprimirEquipamentoPDF(vid) {
    // Marca somente o grid desse equipamento como visivel
    const grids = document.querySelectorAll('#visualizacaoEquipamentos .qr-grid');
    grids.forEach(g => {
        if (g.dataset.equip === vid) g.classList.add('print-visible');
        else g.classList.remove('print-visible');
    });
    document.body.classList.add('print-equip');
    window.print();
    setTimeout(() => {
        document.body.classList.remove('print-equip');
        grids.forEach(g => g.classList.remove('print-visible'));
    }, 500);
}

// Impressao por equipamento (Zebra EPL)
function imprimirEquipamentoZebra(vid) {
    const eq = equipamentos.find(e => (e.veiculo || 'SEM_VEICULO') === vid);
    if (!eq) return;
    gerarEPLeImprimir(eq.hus);
}

// Imprimir TODOS equipamentos em PDF (fallback sem etiquetadora)
function imprimirTodosEquipamentosPDF() {
    document.body.classList.add('print-equip-all');
    window.print();
    setTimeout(() => document.body.classList.remove('print-equip-all'), 500);
}

// Imprimir TODOS equipamentos em Zebra EPL
function imprimirTodosEquipamentosZebra() {
    const allHUs = equipamentos.flatMap(e => e.hus);
    gerarEPLeImprimir(allHUs);
}

// ============================================================
// GERACAO DE EPL2 PARA IMPRESSORAS ZEBRA (GC420t / ZT411)
// Cada HU gera uma etiqueta individual com QR code
// Formato: etiqueta 50x25mm (largura 400 dots, altura 200 dots a 203dpi)
// ============================================================
function gerarEPLeImprimir(hus) {
    let eplContent = '';

    for (const hu of hus) {
        // EPL2 - cada etiqueta individual
        // N = limpa buffer, q400 = largura label, Q200 = altura label
        eplContent += '\nN\n';
        eplContent += 'q400\n';
        eplContent += 'Q200,24\n';
        // Codigo de barras 2D (QR Code): posicao x10 y10, modelo 2, cell size 4
        eplContent += `b10,10,Q,s4,"${hu.hu}"\n`;
        // Texto: HU number
        eplContent += `A170,15,0,2,1,1,N,"${hu.hu}"\n`;
        // Texto: pacotes
        eplContent += `A170,45,0,2,1,1,N,"${hu.pacotes} pacotes"\n`;
        // Texto: veiculo
        if (hu.veiculo) {
            eplContent += `A170,75,0,2,1,1,N,"${getVeiculoIcon(hu.veiculo) === '✈️' ? 'LAM' : 'POR'} ${hu.veiculo}"\n`;
        }
        // Texto: canalizacao
        eplContent += `A170,105,0,2,1,1,N,"${hu.canalizacao}"\n`;
        // Imprime 1 etiqueta
        eplContent += 'P1\n';
    }

    // Abre janela com conteudo EPL pra copiar/enviar pra impressora
    const blob = new Blob([eplContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    // Abre em nova janela pra o usuario enviar pra impressora (ou salvar)
    const win = window.open('', '_blank', 'width=700,height=500');
    if (win) {
        win.document.write(`
            <html><head><title>Etiquetas EPL - Zebra</title>
            <style>
                body { font-family: monospace; padding: 20px; background: #1a1a2e; color: #0f0; }
                h2 { color: #fff; font-family: sans-serif; }
                p { color: #ccc; font-family: sans-serif; font-size: 14px; }
                pre { background: #16213e; padding: 15px; border-radius: 8px; overflow: auto; max-height: 300px; font-size: 12px; }
                .actions { margin: 15px 0; }
                button { padding: 10px 20px; margin-right: 10px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
                .btn-copy { background: #0f0; color: #000; }
                .btn-download { background: #4361ee; color: #fff; }
            </style></head><body>
            <h2>🏷️ Etiquetas EPL Geradas (${hus.length} etiquetas)</h2>
            <p>Compatível com <strong>Zebra GC420t</strong> e <strong>Zebra ZT411</strong>.<br>
            Copie o conteúdo e envie para a impressora via driver, ou baixe o arquivo .epl</p>
            <div class="actions">
                <button class="btn-copy" onclick="navigator.clipboard.writeText(document.getElementById('eplCode').textContent).then(()=>alert('Copiado!'))">📋 Copiar EPL</button>
                <button class="btn-download" onclick="downloadEPL()">💾 Baixar .epl</button>
            </div>
            <pre id="eplCode">${eplContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            <script>
                function downloadEPL() {
                    const a = document.createElement('a');
                    a.href = '${url}';
                    a.download = 'etiquetas_${new Date().toISOString().slice(0,10)}.epl';
                    a.click();
                }
            </script>
            </body></html>
        `);
    }
}

// ============================================================
// RESET
// ============================================================
function resetUpload() {
    fileInput.value = '';
    uploadArea.style.display = 'block';
    fileInfo.style.display = 'none';
    loading.style.display = 'none';
}

function resetAll() {
    fileInput.value = '';
    uploadArea.style.display = 'block';
    fileInfo.style.display = 'none';
    loading.style.display = 'none';

    parsedData = {};
    parsedMeta = {};
    equipamentos = [];
    carretas = {};
    recebimentoState = { chegados: {} };
    recebimentoOrdem = 0;
    carregamentoState = { canalizacaoAtual: null, carretaAtualIdx: 0, ordemChegada: [], canalizacoesOrdem: [], grupoAtual: [] };
    colorIndex = 0;
    canalizacaoColors = {};
    operacaoIniciada = false;

    hubSummary.innerHTML = '';
    document.getElementById('allQrCodesContainer').innerHTML = '';
    equipamentosLista.innerHTML = '';
    carretaConteudo.innerHTML = '';
    carretasExpedidas.innerHTML = '';
    document.getElementById('visualizacaoEquipamentos').innerHTML = '';

    showStep(0);
}
