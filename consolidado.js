// Leitura do texto tabulado copiado de Excel/Google Sheets, sem converter IDs em números.
(function(root) {
    'use strict';

    function cabecalho(valor) {
        return valor.trim().replace(/^\uFEFF/, '').normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').toUpperCase();
    }

    function quantidade(valor) {
        const texto = valor.trim();
        // Quantidades inteiras, inclusive separador de milhar brasileiro.
        if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(texto)) return null;
        const numero = Number(texto.replace(/\./g, ''));
        return Number.isSafeInteger(numero) ? numero : null;
    }

    function normalizarEquipamento(valor) {
        let nome = valor.trim().toUpperCase().replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ');
        nome = nome.replace(/\b0+(\d+)/g, '$1');
        if (/^(PAG|PKC)\s/.test(nome)) nome = nome.replace(/\s+(G3|VRG|G)\s*$/, '');
        return nome;
    }

    function parse(texto) {
        const erros = [];
        const avisos = [];
        const grupos = new Map();
        const filhas = new Map();
        const linhas = [];
        const totaisInformados = new Map();
        const tabela = texto.replace(/\r\n?/g, '\n').split('\n');
        const primeiraNaoVazia = tabela.findIndex(l => l.trim());
        // Algumas bases copiam também o quadro de insumos/malha acima da tabela.
        const cabecalhoHu = tabela.findIndex(l => {
            const colunas = l.split('\t').map(cabecalho);
            return colunas.includes('HU') && colunas.includes('DESTINO');
        });
        const primeira = cabecalhoHu >= 0 ? cabecalhoHu : primeiraNaoVazia;
        const vazio = { dados: {}, entradas: [], erros, avisos, conferencia: [],
            totalPacotes: 0, linhas: 0, filhasUnicas: 0, repeticoes: 0, masters: 0, avulsas: 0 };
        if (primeira < 0) {
            erros.push('Cole os cabeçalhos e as linhas do consolidado.');
            return vazio;
        }
        if (primeira > primeiraNaoVazia) avisos.push('O resumo acima do cabeçalho HU foi ignorado. A entrada usa as linhas da tabela de HUs.');
        const headers = tabela[primeira].split('\t').map(cabecalho);
        const obrigatorias = ['HU', 'DESTINO', 'LAMINA', 'QUANTIDADE'];
        for (const nome of [...obrigatorias, 'MASTER']) {
            if (headers.filter(h => h === nome).length > 1) erros.push(`A coluna ${nome} está repetida no cabeçalho.`);
        }
        for (const nome of obrigatorias) {
            if (!headers.includes(nome)) erros.push(`Coluna obrigatória ausente: ${nome}.`);
        }
        if (erros.length) return vazio;
        const indices = Object.fromEntries(headers.map((h, i) => [h, i]));
        const totalIdx = headers.indexOf('TOTAL');
        if (!headers.includes('MASTER')) avisos.push('Sem coluna MASTER: todas as HUs serão importadas individualmente.');

        for (let i = primeira + 1; i < tabela.length; i++) {
            if (!tabela[i].trim()) continue;
            const cells = tabela[i].split('\t').map(c => c.trim());
            const obter = nome => cells[indices[nome]] || '';
            const numeroLinha = i + 1;
            // O quadro lateral TOTAL / quantidade não faz parte das HUs.
            if (totalIdx >= 0 && cells[totalIdx]) {
                const canal = cells[totalIdx].toUpperCase();
                const valor = quantidade(cells[totalIdx + 1] || '');
                if (!/^(?:TOTAL|[A-Z][A-Z0-9]{1,10}_[A-Z0-9]+)$/.test(canal) || valor === null) {
                    erros.push(`Linha ${numeroLinha}: total lateral inválido. Confira canalização e quantidade.`);
                } else if (totaisInformados.has(canal) && totaisInformados.get(canal) !== valor) {
                    erros.push(`Linha ${numeroLinha}: há dois totais diferentes para ${canal}.`);
                } else {
                    totaisInformados.set(canal, valor);
                }
            }
            if (![...obrigatorias, 'MASTER'].some(n => obter(n))) continue;
            const hu = obter('HU');
            const master = obter('MASTER');
            const canal = obter('DESTINO').toUpperCase();
            const equipamento = normalizarEquipamento(obter('LAMINA'));
            const pacotes = quantidade(obter('QUANTIDADE'));
            const problemas = [];
            if (!/^\d{10,19}$/.test(hu)) problemas.push('HU deve ter de 10 a 19 dígitos, sem notação científica');
            if (master && !/^\d{10,19}$/.test(master)) problemas.push('MASTER deve ter de 10 a 19 dígitos, sem notação científica');
            if (!/^[A-Z][A-Z0-9]{1,10}_[A-Z0-9]+$/.test(canal)) problemas.push('DESTINO deve ser uma canalização (ex.: SAL1_A)');
            if (!equipamento || !/^[A-Z0-9]+(?: [A-Z0-9]+)*$/.test(equipamento)) problemas.push('LAMINA/equipamento inválido ou vazio');
            if (pacotes === null) problemas.push('QUANTIDADE deve ser um inteiro não negativo');
            if (problemas.length) {
                erros.push(`Linha ${numeroLinha}: ${problemas.join('; ')}.`);
                continue;
            }
            const codigo = master || hu;
            const tipo = master ? 'master' : 'avulsa';
            const anterior = filhas.get(hu);
            if (anterior && (anterior.codigo !== codigo || anterior.canal !== canal || anterior.equipamento !== equipamento)) {
                erros.push(`Linha ${numeroLinha}: HU ${hu} tem MASTER, canalização ou equipamento diferente da linha ${anterior.linha}.`);
            }
            if (!anterior) filhas.set(hu, { codigo, canal, equipamento, linha: numeroLinha });
            const grupo = grupos.get(codigo);
            if (grupo && (grupo.canalizacao !== canal || grupo.veiculo !== equipamento || grupo.tipoHu !== tipo)) {
                erros.push(`Linha ${numeroLinha}: código ${codigo} aparece com canalização, equipamento ou tipo diferente.`);
            }
            if (!grupo) grupos.set(codigo, {
                hu: codigo, pacotes: 0, canalizacao: canal, canalizacaoKey: canal,
                veiculo: equipamento, lacre: '', doca: '', operador: '', horario: '', romaneioId: '',
                tipoHu: tipo, filhas: [], registrosConsolidado: []
            });
            const entrada = grupos.get(codigo);
            entrada.pacotes += pacotes;
            if (!Number.isSafeInteger(entrada.pacotes)) erros.push(`Linha ${numeroLinha}: soma de quantidades acima do limite suportado.`);
            if (master) {
                let filha = entrada.filhas.find(f => f.hu === hu);
                if (!filha) { filha = { hu, pacotes: 0 }; entrada.filhas.push(filha); }
                filha.pacotes += pacotes;
            }
            entrada.registrosConsolidado.push({
                hu, master, pacotes, origem: obter('ORIGEM'), recebimento: obter('RECEBIMENTO'),
                addToContainer: obter('ADD TO CONTAINER'), expedicao: obter('EXPEDIÇÃO') || obter('EXPEDICAO'),
                cpt: obter('CPT'), linha: numeroLinha
            });
            linhas.push({ canal, pacotes });
        }

        // Uma HU que também é código de MASTER de outras filhas é ambígua.
        for (const [hu, filha] of filhas) {
            if (grupos.has(hu) && grupos.get(hu).tipoHu === 'master' && filha.codigo !== hu) {
                erros.push(`HU ${hu} também é uma MASTER de outras linhas. Confira a relação entre as HUs.`);
            }
        }
        const entradas = [...grupos.values()];
        const dados = {};
        for (const entrada of entradas) {
            if (!dados[entrada.canalizacao]) dados[entrada.canalizacao] = [];
            dados[entrada.canalizacao].push(entrada);
        }
        const totalPacotes = linhas.reduce((s, l) => s + l.pacotes, 0);
        if (!Number.isSafeInteger(totalPacotes)) erros.push('A soma total de quantidades está acima do limite suportado.');
        if (!entradas.length) erros.push('Nenhuma HU válida encontrada. Confira as linhas coladas.');
        const calculados = new Map([['TOTAL', totalPacotes]]);
        for (const linha of linhas) calculados.set(linha.canal, (calculados.get(linha.canal) || 0) + linha.pacotes);
        const conferencia = [...totaisInformados].map(([canal, informado]) => {
            const calculado = calculados.get(canal) || 0;
            return { canal, informado, calculado, confere: informado === calculado };
        });
        for (const total of conferencia) {
            if (!total.confere) erros.push(`Total de ${total.canal} divergente: calculado ${total.calculado}, informado ${total.informado}.`);
        }
        if (!conferencia.length) avisos.push('Sem quadro de totais: confira as somas da prévia antes de confirmar.');
        else if (!totaisInformados.has('TOTAL') || [...calculados.keys()].some(c => !totaisInformados.has(c))) {
            avisos.push('O quadro de totais está parcial. Só foi possível comparar os totais informados.');
        }
        return { dados, entradas, erros, avisos, conferencia, totalPacotes,
            linhas: linhas.length, filhasUnicas: filhas.size,
            repeticoes: linhas.length - filhas.size,
            masters: entradas.filter(e => e.tipoHu === 'master').length,
            avulsas: entradas.filter(e => e.tipoHu === 'avulsa').length };
    }

    const api = { parse, normalizarEquipamento };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Consolidado = api;
})(typeof window !== 'undefined' ? window : globalThis);
