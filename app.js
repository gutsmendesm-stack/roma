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
btnNovoUpload.addEventListener('click', () => {
    showModal(
        'Nova Operação',
        'Todo o progresso atual será perdido.<br><br>Deseja iniciar uma nova operação?',
        'warning',
        () => { resetAll(); },
        null
    );
});

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
document.getElementById('btnImprimirEtiqNavegador').addEventListener('click', imprimirTodosEtiquetasNavegador);


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
        const hojeStr = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return new Promise((resolve) => {
            showModal(
                'Romaneio de Data Anterior',
                `Este romaneio é do dia <strong>${parsedMeta.dataInicio}</strong>.<br>Hoje é <strong>${hojeStr}</strong>.<br><br>Deseja prosseguir mesmo assim?`,
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

    // Se nao tem onConfirm E nao tem onCancel, mostra so botao OK
    const soOk = !onConfirm && !onCancel;
    const botoesHtml = soOk
        ? `<button class="btn btn-primary modal-btn-confirm">OK</button>`
        : `<button class="btn btn-primary modal-btn-confirm">Sim, continuar</button>
           <button class="btn btn-secondary modal-btn-cancel">Cancelar</button>`;

    overlay.innerHTML = `
        <div class="modal-box">
            <div class="modal-icon">${iconMap[tipo] || '⚠️'}</div>
            <h2 class="modal-title">${titulo}</h2>
            <p class="modal-message">${mensagem}</p>
            <div class="modal-actions">
                ${botoesHtml}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('.modal-btn-confirm').addEventListener('click', () => {
        overlay.remove();
        if (onConfirm) onConfirm();
    });

    const cancelBtn = overlay.querySelector('.modal-btn-cancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            if (onCancel) onCancel();
        });
    }

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


// Agrupa HUs por equipamento/veiculo (normaliza nome pra evitar duplicatas)
function buildEquipamentos(data) {
    const veiculoMap = {};
    for (const key of Object.keys(data)) {
        for (const entry of data[key]) {
            // Normaliza: trim, uppercase, remove espaços extras, normaliza zeros a esquerda
            const vid = normalizarNomeVeiculo(entry.veiculo);
            if (!veiculoMap[vid]) {
                veiculoMap[vid] = { veiculo: vid !== 'SEM_VEICULO' ? vid : '', hus: [], canalizacoes: {} };
            }
            veiculoMap[vid].hus.push(entry);
            if (!veiculoMap[vid].canalizacoes[key]) veiculoMap[vid].canalizacoes[key] = [];
            veiculoMap[vid].canalizacoes[key].push(entry);
        }
    }
    return Object.values(veiculoMap);
}

// Normaliza nome do veiculo para agrupar corretamente
// Ex: "PAG 000266 G3" e "PAG 00266 G3" viram "PAG 266 G3"
// Remove zeros a esquerda da parte numerica
function normalizarNomeVeiculo(veiculo) {
    if (!veiculo) return 'SEM_VEICULO';
    let nome = veiculo.trim().replace(/\s+/g, ' ').toUpperCase();
    // Remove zeros a esquerda de sequencias numericas
    // "PAG 00044 G3" -> "PAG 44 G3", "PAG 000266 G3" -> "PAG 266 G3"
    nome = nome.replace(/\b0+(\d+)/g, '$1');
    return nome;
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
    const vid = normalizarNomeVeiculo(eq.veiculo);
    const icon = getVeiculoIcon(eq.veiculo);
    const totalHUs = eq.hus.length;
    const totalPcts = eq.hus.reduce((s, h) => s + h.pacotes, 0);
    const canais = Object.keys(eq.canalizacoes);
    const canaisStr = canais.join(', ');
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
                <span class="eq-detail">${totalHUs} HUs · ${totalPcts.toLocaleString('pt-BR')} pcts · ${canaisStr}</span>
            </div>
            <span class="recebido-hora">✅ Chegou ${data} ${hora}</span>
        `;
    } else {
        item.innerHTML = `
            <div class="eq-info">
                <span class="eq-icon">${icon}</span>
                <span class="eq-veiculo">${eq.veiculo || 'Sem veículo'}</span>
                <span class="eq-detail">${totalHUs} HUs · ${totalPcts.toLocaleString('pt-BR')} pcts · ${canaisStr}</span>
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
        const eq = equipamentos.find(e => normalizarNomeVeiculo(e.veiculo) === vid);
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
    const todosVeiculos = equipamentos.map(e => normalizarNomeVeiculo(e.veiculo));
    const naoRecebidos = todosVeiculos.filter(v => !recebimentoState.chegados[v]);

    if (naoRecebidos.length > 0) {
        const listaStr = naoRecebidos.map(v => `• ${getVeiculoIcon(equipamentos.find(e => normalizarNomeVeiculo(e.veiculo) === v)?.veiculo)} ${v}`).join('<br>');
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
        const eq = equipamentos.find(e => normalizarNomeVeiculo(e.veiculo) === vid);
        const icon = eq ? getVeiculoIcon(eq.veiculo) : '📦';
        const tipo = eq && isLamina(eq.veiculo) ? 'Lâmina' : 'Porão';
        const totalHUs = eq ? eq.hus.length : 0;
        const totalPcts = eq ? eq.hus.reduce((s, h) => s + h.pacotes, 0) : 0;
        const husLista = eq ? eq.hus.map(h => h.hu).join(', ') : '';
        const data = info.hora.toLocaleDateString('pt-BR');
        const hora = info.hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        html += `<tr><td>${info.ordem}º</td><td>${icon} ${tipo}</td><td><strong>${vid}</strong></td><td>${totalHUs}</td><td>${totalPcts.toLocaleString('pt-BR')}</td><td>${data}</td><td>${hora}</td></tr>`;
        html += `<tr><td colspan="7" class="resumo-hus-row">HUs: ${husLista}</td></tr>`;
    }
    html += `</tbody></table>`;

    // Nao recebidos
    const todosVeiculos = equipamentos.map(e => normalizarNomeVeiculo(e.veiculo));
    const naoRecebidos = todosVeiculos.filter(v => !recebimentoState.chegados[v]);

    if (naoRecebidos.length > 0) {
        html += `<h3 class="resumo-alerta">⚠️ Equipamentos NÃO Recebidos (${naoRecebidos.length})</h3><ul class="resumo-nao-recebidos">`;
        for (const v of naoRecebidos) {
            const eq = equipamentos.find(e => normalizarNomeVeiculo(e.veiculo) === v);
            const icon = eq ? getVeiculoIcon(eq.veiculo) : '📦';
            const totalHUs = eq ? eq.hus.length : 0;
            const husLista = eq ? eq.hus.map(h => h.hu).join(', ') : '';
            html += `<li>${icon} <strong>${v}</strong> — ${totalHUs} HUs<br><span class="resumo-hus-detalhe">${husLista}</span></li>`;
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
        const v = normalizarNomeVeiculo(hu.veiculo);
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
    carreta.hus = carreta.hus.filter(h => normalizarNomeVeiculo(h.veiculo) !== veiculo);
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
            <button class="btn btn-warning btn-print-zebra">🏷️ Etiquetas (Zebra)</button>
            <button class="btn btn-secondary btn-print-outras">🖨️ Etiquetas (Outras Impressoras)</button>
        `;
        btnActions.querySelector('.btn-print-carreta').addEventListener('click', () => printCarreta(i));
        btnActions.querySelector('.btn-print-zebra').addEventListener('click', () => printCarretaZebra(i));
        btnActions.querySelector('.btn-print-outras').addEventListener('click', () => imprimirEtiquetasNavegador(carreta.hus));
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

// Impressao de carreta (formato Zebra - etiqueta via Browser Print SDK)
function printCarretaZebra(idx) {
    const carreta = carretas['_current'][idx];
    if (!carreta) return;
    enviarParaZebra(carreta.hus);
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
            <button class="btn btn-warning btn-sm">🏷️ Zebra</button>
            <button class="btn btn-secondary btn-sm">🖨️ Outras Impressoras</button>
        `;
        eqActions.querySelector('.btn-primary').addEventListener('click', (e) => {
            e.stopPropagation();
            imprimirEquipamentoPDF(vid);
        });
        eqActions.querySelector('.btn-warning').addEventListener('click', (e) => {
            e.stopPropagation();
            imprimirEquipamentoZebra(vid);
        });
        eqActions.querySelector('.btn-secondary').addEventListener('click', (e) => {
            e.stopPropagation();
            imprimirEtiquetasNavegadorEquip(vid);
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

// Impressao por equipamento (Zebra EPL via Browser Print SDK)
function imprimirEquipamentoZebra(vid) {
    const eq = equipamentos.find(e => normalizarNomeVeiculo(e.veiculo) === vid);
    if (!eq) return;
    enviarParaZebra(eq.hus);
}

// Imprimir TODOS equipamentos em PDF (fallback sem etiquetadora)
function imprimirTodosEquipamentosPDF() {
    document.body.classList.add('print-equip-all');
    window.print();
    setTimeout(() => document.body.classList.remove('print-equip-all'), 500);
}

// Imprimir TODOS equipamentos em Zebra EPL via Browser Print SDK
function imprimirTodosEquipamentosZebra() {
    const allHUs = equipamentos.flatMap(e => e.hus);
    enviarParaZebra(allHUs);
}

// Imprimir etiquetas via navegador (funciona com qualquer impressora)
function imprimirEtiquetasNavegador(hus) {
    // Se nao tem formato, pergunta
    if (!etiquetaFormato) {
        mostrarSeletorFormato(hus);
        // Redireciona pra navegador depois de escolher
        // Gambiarra: marca flag temporaria
        window._imprimirViaNavegador = true;
        return;
    }

    // Cria container temporario com etiquetas formatadas individualmente
    let printDiv = document.getElementById('etiquetasNavegadorPrint');
    if (printDiv) printDiv.remove();

    printDiv = document.createElement('div');
    printDiv.id = 'etiquetasNavegadorPrint';
    printDiv.className = 'etiquetas-navegador-print';
    printDiv.dataset.formato = etiquetaFormato;

    for (const hu of hus) {
        const etiqueta = document.createElement('div');
        etiqueta.className = `etiqueta-individual etiqueta-${etiquetaFormato}`;

        const canvas = document.createElement('canvas');
        try {
            new QRious({
                element: canvas,
                value: hu.hu,
                size: etiquetaFormato === 'quadrada' ? 250 : 150,
                foreground: '#000000',
                background: '#ffffff',
                level: 'M'
            });
        } catch (err) {}

        etiqueta.appendChild(canvas);

        const info = document.createElement('div');
        info.className = 'etiqueta-info';
        info.innerHTML = `
            <div class="etiqueta-hu">${hu.hu}</div>
            <div class="etiqueta-pacotes">${hu.pacotes} pacotes</div>
            ${hu.veiculo ? `<div class="etiqueta-veiculo">${isLamina(hu.veiculo) ? 'LAM' : 'POR'} ${normalizarNomeVeiculo(hu.veiculo)}</div>` : ''}
            <div class="etiqueta-canal">${hu.canalizacao}</div>
        `;
        etiqueta.appendChild(info);
        printDiv.appendChild(etiqueta);
    }

    document.body.appendChild(printDiv);
    document.body.classList.add('print-etiquetas-navegador');
    window.print();
    setTimeout(() => {
        document.body.classList.remove('print-etiquetas-navegador');
        printDiv.remove();
    }, 500);
}

// Versao por equipamento (outras impressoras)
function imprimirEtiquetasNavegadorEquip(vid) {
    const eq = equipamentos.find(e => normalizarNomeVeiculo(e.veiculo) === vid);
    if (!eq) return;
    imprimirEtiquetasNavegador(eq.hus);
}

// Versao todos (outras impressoras)
function imprimirTodosEtiquetasNavegador() {
    const allHUs = equipamentos.flatMap(e => e.hus);
    imprimirEtiquetasNavegador(allHUs);
}

// ============================================================
// ZEBRA BROWSER PRINT SDK - Impressao direta de etiquetas
// Compativel com Zebra GC420t e ZT411 (linguagem EPL2)
// Requer: Zebra Browser Print Agent instalado no PC
// ============================================================
let zebraPrinter = null; // impressora selecionada
let etiquetaFormato = localStorage.getItem('etiquetaFormato') || ''; // 'quadrada' ou 'retangular'

function enviarParaZebra(hus) {
    // Se nao escolheu formato ainda, pergunta
    if (!etiquetaFormato) {
        mostrarSeletorFormato(hus);
        return;
    }

    // Se ja tem impressora selecionada, manda direto
    if (zebraPrinter) {
        enviarEPLParaImpressora(zebraPrinter, hus);
        return;
    }

    // Tenta encontrar impressora via SDK
    if (typeof BrowserPrint === 'undefined') {
        mostrarGuiaConfiguracao();
        return;
    }

    // Busca impressora padrao
    BrowserPrint.getDefaultDevice('printer',
        function(device) {
            if (device) {
                zebraPrinter = device;
                enviarEPLParaImpressora(device, hus);
            } else {
                buscarImpressorasZebra(hus);
            }
        },
        function(error) {
            mostrarGuiaConfiguracao();
        }
    );
}

// ============================================================
// SELETOR DE FORMATO DA ETIQUETA
// ============================================================
function mostrarSeletorFormato(hus) {
    const existing = document.getElementById('customModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customModal';
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal-box">
            <div class="modal-icon">🏷️</div>
            <h2 class="modal-title">Formato da Etiqueta</h2>
            <p class="modal-message">Qual o formato da etiqueta na sua impressora?</p>

            <div class="formato-opcoes">
                <button class="btn-formato" id="btnFormatoQuadrada">
                    <div class="formato-preview formato-quadrada"></div>
                    <strong>Quadrada</strong>
                    <span>100 x 100 mm (10x10cm)</span>
                </button>
                <button class="btn-formato" id="btnFormatoRetangular">
                    <div class="formato-preview formato-retangular"></div>
                    <strong>Retangular</strong>
                    <span>100 x 50 mm (10x5cm)</span>
                </button>
            </div>

            <p class="formato-hint">Essa escolha fica salva para as próximas vezes. Você pode trocar depois nas configurações.</p>

            <div class="modal-actions" style="margin-top: 15px;">
                <button class="btn btn-secondary modal-btn-cancel">Cancelar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#btnFormatoQuadrada').addEventListener('click', () => {
        etiquetaFormato = 'quadrada';
        localStorage.setItem('etiquetaFormato', 'quadrada');
        overlay.remove();
        enviarParaZebra(hus);
    });

    overlay.querySelector('#btnFormatoRetangular').addEventListener('click', () => {
        etiquetaFormato = 'retangular';
        localStorage.setItem('etiquetaFormato', 'retangular');
        overlay.remove();
        enviarParaZebra(hus);
    });

    overlay.querySelector('.modal-btn-cancel').addEventListener('click', () => {
        overlay.remove();
    });
}

// ============================================================
// GUIA DE CONFIGURACAO DA IMPRESSORA (passo a passo simples)
// ============================================================
function mostrarGuiaConfiguracao() {
    const existing = document.getElementById('customModal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customModal';
    overlay.className = 'modal-overlay';

    overlay.innerHTML = `
        <div class="modal-box modal-box-large">
            <div class="modal-icon">🖨️</div>
            <h2 class="modal-title">Configurar Impressora de Etiquetas</h2>
            <p class="modal-message">Siga os passos abaixo para conectar sua Zebra. É só na primeira vez!</p>

            <div class="setup-steps">
                <div class="setup-step">
                    <div class="setup-step-number">1</div>
                    <div class="setup-step-content">
                        <strong>Baixe o programa</strong>
                        <p>Clique no botão abaixo para baixar o conector da Zebra (é rápido):</p>
                        <a href="https://www.zebra.com/us/en/support-downloads/printer-software/by-request-software.html" target="_blank" class="btn btn-primary btn-sm">⬇️ Baixar Zebra Browser Print</a>
                    </div>
                </div>

                <div class="setup-step">
                    <div class="setup-step-number">2</div>
                    <div class="setup-step-content">
                        <strong>Instale e abra o programa</strong>
                        <p>Execute o arquivo baixado e siga a instalação normal (Próximo, Próximo, Concluir). O programa vai abrir automaticamente.</p>
                    </div>
                </div>

                <div class="setup-step">
                    <div class="setup-step-number">3</div>
                    <div class="setup-step-content">
                        <strong>Libere o acesso no navegador</strong>
                        <p>Clique no botão abaixo, vai abrir uma página com aviso de segurança. Clique em <strong>"Avançado"</strong> e depois <strong>"Continuar"</strong>.</p>
                        <a href="https://localhost:9101/ssl_support" target="_blank" class="btn btn-warning btn-sm">🔓 Liberar Acesso</a>
                    </div>
                </div>

                <div class="setup-step">
                    <div class="setup-step-number">4</div>
                    <div class="setup-step-content">
                        <strong>Pronto! Teste a impressora</strong>
                        <p>Depois de liberar, clique em "Testar Conexão" abaixo:</p>
                        <button class="btn btn-success btn-sm" id="btnTestarZebra">✅ Testar Conexão</button>
                        <span id="zebraTestResult" class="setup-test-result"></span>
                    </div>
                </div>
            </div>

            <div class="modal-actions" style="margin-top: 20px;">
                <button class="btn btn-secondary modal-btn-cancel">Fechar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Botao fechar
    overlay.querySelector('.modal-btn-cancel').addEventListener('click', () => {
        overlay.remove();
    });

    // Botao testar
    overlay.querySelector('#btnTestarZebra').addEventListener('click', () => {
        testarConexaoZebra();
    });

    // ESC fecha
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function testarConexaoZebra() {
    const resultEl = document.getElementById('zebraTestResult');
    resultEl.textContent = '⏳ Testando...';
    resultEl.style.color = '#555';

    if (typeof BrowserPrint === 'undefined') {
        resultEl.textContent = '❌ Programa não detectado. Verifique se instalou e abriu o Zebra Browser Print.';
        resultEl.style.color = '#dc2626';
        return;
    }

    BrowserPrint.getDefaultDevice('printer',
        function(device) {
            if (device) {
                zebraPrinter = device;
                resultEl.textContent = `✅ Conectado! Impressora: ${device.name || device.uid || 'Zebra'}`;
                resultEl.style.color = '#059669';
            } else {
                BrowserPrint.getLocalDevices(
                    function(devices) {
                        let printers = [];
                        if (Array.isArray(devices)) printers = devices;
                        else if (devices && devices.printer) printers = devices.printer;

                        if (printers.length > 0) {
                            zebraPrinter = printers[0];
                            resultEl.textContent = `✅ Conectado! Impressora: ${printers[0].name || printers[0].uid || 'Zebra'}`;
                            resultEl.style.color = '#059669';
                        } else {
                            resultEl.textContent = '⚠️ Programa conectado, mas nenhuma impressora encontrada. A Zebra está ligada?';
                            resultEl.style.color = '#d97706';
                        }
                    },
                    function() {
                        resultEl.textContent = '❌ Não conseguiu buscar impressoras. Tente liberar o acesso (passo 3).';
                        resultEl.style.color = '#dc2626';
                    },
                    'printer'
                );
            }
        },
        function(error) {
            resultEl.textContent = '❌ Sem comunicação. Verifique se o programa está aberto e se liberou o acesso (passo 3).';
            resultEl.style.color = '#dc2626';
        }
    );
}

function buscarImpressorasZebra(hus) {
    BrowserPrint.getLocalDevices(
        function(devices) {
            let printers = [];
            if (Array.isArray(devices)) {
                printers = devices;
            } else if (devices && devices.printer) {
                printers = devices.printer;
            } else if (devices && typeof devices === 'object') {
                try { printers = Array.from(devices); } catch(e) { printers = []; }
            }

            if (printers.length === 0) {
                mostrarErroZebra('Nenhuma impressora Zebra encontrada na rede.');
                return;
            }

            if (printers.length === 1) {
                zebraPrinter = printers[0];
                enviarEPLParaImpressora(printers[0], hus);
            } else {
                // Multiplas impressoras - deixa usuario escolher
                mostrarSeletorImpressora(printers, hus);
            }
        },
        function(error) {
            mostrarErroZebra(error);
        },
        'printer'
    );
}

function mostrarSeletorImpressora(printers, hus) {
    const lista = printers.map((p, i) => `<button class="btn btn-primary modal-printer-btn" data-idx="${i}" style="margin:5px;display:block;width:100%">${p.name || p.uid || 'Impressora ' + (i+1)}</button>`).join('');

    showModal(
        'Selecione a Impressora',
        `Foram encontradas <strong>${printers.length}</strong> impressoras Zebra:<br><br>${lista}`,
        'info',
        null,
        null
    );

    // Adiciona evento nos botoes apos o modal aparecer
    setTimeout(() => {
        document.querySelectorAll('.modal-printer-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                zebraPrinter = printers[idx];
                const modal = document.getElementById('customModal');
                if (modal) modal.remove();
                enviarEPLParaImpressora(printers[idx], hus);
            });
        });
    }, 100);
}

function enviarEPLParaImpressora(device, hus) {
    // Gera EPL2 para todas as HUs (uma etiqueta por HU)
    // Formato depende da escolha do usuario
    const isQuadrada = etiquetaFormato === 'quadrada';
    // Quadrada: 100x100mm = 812x812 dots @ 203dpi
    // Retangular: 100x50mm = 812x406 dots @ 203dpi
    const larguraLabel = 812;
    const alturaLabel = isQuadrada ? 812 : 406;
    const cellSize = isQuadrada ? 10 : 6;

    let eplContent = '';

    for (const hu of hus) {
        eplContent += '\nN\n';
        eplContent += `q${larguraLabel}\n`;
        eplContent += `Q${alturaLabel},24\n`;

        if (isQuadrada) {
            // Quadrada 100x100mm: QR grande centralizado em cima, texto embaixo
            // QR code centralizado: x ~200, y 30, cell size 10 (QR ~300x300 dots)
            eplContent += `b200,30,Q,s${cellSize},"${hu.hu}"\n`;
            // Textos embaixo do QR
            eplContent += `A50,520,0,4,1,1,N,"${hu.hu}"\n`;
            eplContent += `A50,580,0,3,1,1,N,"${hu.pacotes} pacotes"\n`;
            if (hu.veiculo) {
                const tipo = isLamina(hu.veiculo) ? 'LAM' : 'POR';
                eplContent += `A50,630,0,3,1,1,N,"${tipo} ${normalizarNomeVeiculo(hu.veiculo)}"\n`;
            }
            eplContent += `A50,690,0,4,1,1,N,"${hu.canalizacao}"\n`;
        } else {
            // Retangular 100x50mm: QR na esquerda, textos na direita
            // QR code: x 30, y 30, cell size 6 (QR ~200x200 dots)
            eplContent += `b30,30,Q,s${cellSize},"${hu.hu}"\n`;
            // Textos do lado direito
            eplContent += `A320,40,0,3,1,1,N,"${hu.hu}"\n`;
            eplContent += `A320,100,0,2,1,1,N,"${hu.pacotes} pacotes"\n`;
            if (hu.veiculo) {
                const tipo = isLamina(hu.veiculo) ? 'LAM' : 'POR';
                eplContent += `A320,150,0,2,1,1,N,"${tipo} ${normalizarNomeVeiculo(hu.veiculo)}"\n`;
            }
            eplContent += `A320,210,0,3,1,1,N,"${hu.canalizacao}"\n`;
        }

        eplContent += 'P1\n';
    }

    // Envia pro dispositivo via Browser Print SDK
    device.send(eplContent,
        function() {
            showModal(
                'Etiquetas Enviadas!',
                `<strong>${hus.length}</strong> etiqueta(s) enviada(s) para a impressora <strong>${device.name || 'Zebra'}</strong>.<br><br>Formato: <strong>${isQuadrada ? 'Quadrada 100x100mm' : 'Retangular 100x50mm'}</strong>`,
                'success',
                null,
                null
            );
        },
        function(error) {
            showModal(
                'Erro na Impressão',
                `Não foi possível enviar para a impressora.<br><br>Erro: ${error || 'Conexão recusada'}<br><br>Verifique se a impressora está ligada e conectada.`,
                'error',
                null,
                null
            );
        }
    );
}

function mostrarErroZebra(error) {
    mostrarGuiaConfiguracao();
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
