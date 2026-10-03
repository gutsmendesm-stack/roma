const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parse, normalizarEquipamento } = require('../consolidado.js');

const header = 'HU\tORIGEM\tDESTINO\tRECEBIMENTO\tADD TO CONTAINER\tEXPEDIÇÃO\tCPT\tLAMINA\tQUANTIDADE\tMASTER\tTOTAL\t';
function row(hu, quantidade, master = '', canal = 'SAL1_A', equip = 'PKC-00021-G3', total = '', valor = '') {
    return [hu, 'BASE_ORIGEM', canal, '2026-10-02 14:00:00', '2026-10-03 09:00:00',
        '2026-10-03 09:01:00', '2026-10-04 12', equip, quantidade, master, total, valor].join('\t');
}
const filha = '1000000000000001';
const outraFilha = '1000000000000002';
const master = '2000000000000000';

test('soma filhas na MASTER e preserva HU avulsa e metadados sem registrar chegada', () => {
    const r = parse([header, row(filha, 20, master), row(outraFilha, 35, master), row('1000000000000003', 145)].join('\n'));
    assert.deepEqual(r.erros, []);
    assert.equal(r.entradas.length, 2);
    assert.equal(r.totalPacotes, 200);
    assert.equal(r.entradas[0].hu, master);
    assert.equal(r.entradas[0].pacotes, 55);
    assert.equal(r.entradas[0].filhas.length, 2);
    assert.equal(r.entradas[0].registrosConsolidado[0].recebimento, '2026-10-02 14:00:00');
    assert.equal(r.entradas[0].registrosConsolidado[0].expedicao, '2026-10-03 09:01:00');
    assert.equal(r.entradas[0].registrosConsolidado[0].cpt, '2026-10-04 12');
});

test('soma ocorrências repetidas sem duplicar filhas nem QR de avulsas', () => {
    const r = parse([header, row(filha, 20, master), row(filha, 35, master), row(outraFilha, 7), row(outraFilha, 11)].join('\n'));
    assert.deepEqual(r.erros, []);
    assert.equal(r.repeticoes, 2);
    assert.equal(r.entradas.length, 2);
    assert.deepEqual(r.entradas[0].filhas, [{ hu: filha, pacotes: 55 }]);
    assert.equal(r.entradas[1].pacotes, 18);
    assert.equal(r.totalPacotes, 73);
});

test('preserva IDs longos e zeros como texto', () => {
    const r = parse([header, row('0012345678901234567', 3, '9999999999999999999')].join('\n'));
    assert.deepEqual(r.erros, []);
    assert.equal(r.entradas[0].hu, '9999999999999999999');
    assert.equal(r.entradas[0].filhas[0].hu, '0012345678901234567');
});

test('padroniza equipamento e aceita mesma lâmina com sufixos diferentes', () => {
    assert.equal(normalizarEquipamento(' PKC-00021-G3 '), 'PKC 21');
    assert.equal(normalizarEquipamento('PAG-6072-VRG'), 'PAG 6072');
    assert.equal(normalizarEquipamento('DNA-3752-C5'), 'DNA 3752 C5');
    assert.equal(normalizarEquipamento('DNA-2633C3'), 'DNA 2633C3');
    const r = parse([header, row(filha, 1, master, 'SAL1_A', 'PAG-00021-VRG'), row(outraFilha, 2, master, 'SAL1_A', 'PAG 21 G3')].join('\n'));
    assert.deepEqual(r.erros, []);
    assert.equal(r.entradas[0].pacotes, 3);
});

test('bloqueia mesma filha em outra MASTER, inclusive quando aparece como avulsa', () => {
    for (const novoMaster of ['', '2000000000000001']) {
        const r = parse([header, row(filha, 1, master), row(filha, 2, novoMaster)].join('\n'));
        assert.ok(r.erros.some(e => e.includes('diferente da linha')));
    }
});

test('bloqueia MASTER com destinos ou equipamentos diferentes', () => {
    for (const [canal, eq] of [['SAL1_B', 'PKC-00021-G3'], ['SAL1_A', 'PAG-00045-G3']]) {
        const r = parse([header, row(filha, 1, master), row(outraFilha, 2, master, canal, eq)].join('\n'));
        assert.ok(r.erros.some(e => e.includes('código')));
    }
});

test('bloqueia código usado como MASTER e HU filha de outra MASTER', () => {
    const r = parse([header, row(filha, 1, master), row(master, 2, '2000000000000001')].join('\n'));
    assert.ok(r.erros.some(e => e.includes('também é uma MASTER')));
});

test('bloqueia linha inválida e notação científica sem aceitar silenciosamente', () => {
    for (const linha of [row('2.43051E+15', 1), row(filha, '-5'), row(filha, '2,5'), row(filha, '', master), row(filha, '1', '2.43E+15'), row(filha, '1', '', 'BASE'), row(filha, '1', '', 'SAL1_A', '')]) {
        const r = parse([header, row(outraFilha, 4), linha].join('\n'));
        assert.ok(r.erros.some(e => e.startsWith('Linha 3:')));
    }
});

test('compara totais laterais inclusive em linhas sem HU; aceita milhares brasileiros', () => {
    const r = parse([header, row(filha, '1.234', '', 'SAL1_A', 'PKC-00021-G3', 'SAL1_A', '1.234'), '\t'.repeat(10) + 'TOTAL\t1.234'].join('\n'));
    assert.deepEqual(r.erros, []);
    assert.equal(r.totalPacotes, 1234);
    assert.equal(r.linhas, 1);
    assert.equal(r.conferencia.length, 2);
    assert.ok(r.conferencia.every(t => t.confere));
});

test('bloqueia totais divergentes, malformados e contraditórios', () => {
    for (const linhas of [
        [row(filha, 4, '', 'SAL1_A', 'PKC-00021-G3', 'TOTAL', 5)],
        [row(filha, 4, '', 'SAL1_A', 'PKC-00021-G3', 'TOTAL', '')],
        [row(filha, 4, '', 'SAL1_A', 'PKC-00021-G3', 'TOTAL', 4), '\t'.repeat(10) + 'TOTAL\t5']
    ]) assert.ok(parse([header, ...linhas].join('\n')).erros.length);
});

test('aceita cabeçalhos reordenados, acentos, CRLF e campos opcionais ausentes', () => {
    const r = parse('quantidade\tdestino\tlâmina\thu\r\n20\tsal1_a\tPKC-00021-G3\t' + filha + '\r\n');
    assert.deepEqual(r.erros, []);
    assert.equal(r.avulsas, 1);
    assert.equal(r.totalPacotes, 20);
    assert.ok(r.avisos.some(a => a.includes('Sem coluna MASTER')));
    assert.ok(r.avisos.some(a => a.includes('Sem quadro')));
});

test('exige colunas e não aceita cabeçalhos duplicados ou dados vazios', () => {
    assert.ok(parse('').erros.length);
    assert.ok(parse('HU DESTINO LAMINA QUANTIDADE\n').erros.length);
    assert.ok(parse('HU\tHU\tDESTINO\tLAMINA\tQUANTIDADE').erros.some(e => e.includes('repetida')));
    assert.ok(parse(header).erros.length);
});

test('recusa soma acima do limite inteiro seguro', () => {
    assert.ok(parse([header, row(filha, String(Number.MAX_SAFE_INTEGER)), row(filha, 1)].join('\n')).erros.some(e => e.includes('limite')));
});

// Mesmas distribuições e quantidades da referência, com IDs sintéticos.
function referencia() {
    const grupos = [
        ['SAL1_A', 'PKC-00021-G3', [181,295]],
        ['SAL1_A', 'PAG-00105-G3', [253,195,224,232]],
        ['SAL1_A', 'PAG-00045-G3', [284,340,6,93,200,245]],
        ['SAL1_A', 'PAG-6072-VRG', [221,214,149,203,102]],
        ['SAL1_A', 'DNA-3752-C5', [2,7,10,1,1,11,1,74,187]],
        ['SAL1_A', 'DNA-5779-C5', [180,6,142,1,18,1,73]],
        ['SAL1_A', 'PAG-6072-VRG', [119,2,4,77]],
        ['SAL1_B', 'DNA-3752-C5', [25,136,53]],
        ['SAL1_B', 'PAG-6072-VRG', [145], false],
        ['SSE1_A', 'DNA-5344-C1', [4,294,305,177,180]],
        ['SSE1_A', 'DNA-5785-C2', [156,164,171,119,44]],
        ['SSE1_A', 'DNA-2633C3', [220,254,5,127]],
        ['SSE1_A', 'DNA-5344-C1', [4,32,7,1,26,14,1,2,1]],
        ['SSE1_B', 'DNA-5779-C5', [34,10]],
        ['SSE1_B', 'DNA-5344-C1', [71,2], false]
    ];
    const totais = [['SAL1_A',4354],['SAL1_B',359],['SSE1_A',2308],['SSE1_B',117],['TOTAL',7138]];
    let id = 0;
    return [header, ...grupos.flatMap(([canal, eq, quantidades, temMaster = true], g) => quantidades.map(q => {
        const total = totais[id];
        id++;
        return row(String(1000000000000000n + BigInt(id)), q, temMaster ? String(2000000000000000n + BigInt(g)) : '', canal, eq, total?.[0] || '', total?.[1] || '');
    }))].join('\n');
}

test('referência de 68 linhas confere 13 MASTERs, 3 avulsas e 7.138 pacotes', () => {
    const r = parse(referencia());
    assert.deepEqual(r.erros, []);
    assert.equal(r.linhas, 68);
    assert.equal(r.masters, 13);
    assert.equal(r.avulsas, 3);
    assert.equal(r.entradas.length, 16);
    assert.equal(r.totalPacotes, 7138);
    assert.deepEqual(Object.fromEntries(r.conferencia.map(t => [t.canal, t.calculado])), {SAL1_A:4354,SAL1_B:359,SSE1_A:2308,SSE1_B:117,TOTAL:7138});
    assert.equal(new Set(r.entradas.map(e => e.veiculo)).size, 9);
});

module.exports = { referencia };
