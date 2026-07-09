# Contexto do Projeto - Leitor de Romaneios

## O que é
Ferramenta web para operação de carga aérea (Mercado Livre). Lê PDFs de romaneios de expedição, extrai HUs (unidades de manuseio) com QR codes, e organiza distribuição em carretas.

## Repositório
- GitHub: `gutsmendesm-stack/roma`
- Hospedagem: GitHub Pages ou Cloudflare Pages
- Arquivos: `index.html`, `app.js`, `styles.css`

## Fluxo da aplicação
1. **Upload PDF** → extrai texto de todas as páginas
2. **Resumo + QR Codes** → mostra totais por canalização, gera QR codes de todas as HUs (para bipagem inicial no aparelho)
3. **Carregamento** → carretas começam VAZIAS, usuário adiciona canalizações via botões "+", marca equipamentos conforme chegam no terminal
4. **Expedição** → fecha carreta (placa obrigatória), gera QR codes daquela carreta para bipar novamente

## Conceitos da operação
- **HU** = Unidade de manuseio (container com pacotes)
- **Canalização** = destino/rota (ex: SAL1_A, SSE1_B, SJP1X_A, XGR2_1A)
- **Equipamento/Veículo** = lâmina/pallet (PAG, PKC) ou porão (DNA, FOS, outros)
- **Ícones**: ✈️ = lâmina (PAG/PKC), 📥 = porão (qualquer outro)
- **Carreta** = veículo rodoviário que leva as HUs (identificada por placa)
- Lâminas chegam primeiro, porão depois (geralmente)
- HU inteira vai para UMA carreta (sem divisão parcial)
- Cada operação é diária (não persiste dados)

## Parsing do PDF
- Páginas de continuação (pag 2/2) herdam metadados da página anterior
- Veículo: limpa caracteres inválidos (lixo JSON do sistema)
- Container regex: `\d{10,19}` (10 a 19 dígitos)
- Canalização regex: `[A-Z][A-Z0-9]{1,10}_[A-Z0-9]+` (aceita qualquer mix alfanumérico)
- `[master]` é opcional no parsing

## Funcionalidades implementadas
- Upload com drag & drop
- QR codes (lib QRious) sempre preto no branco
- Impressão por canalização individual ou tudo junto
- Impressão por carreta expedida
- Remover equipamento de uma carreta (volta pra "aguardando")
- Múltiplas canalizações por carreta (botão "+ canal")
- Placa obrigatória antes de fechar/expedir
- Navegação preserva estado entre etapas
- Bloqueio de inspeção (F12, botão direito, Ctrl+U, Ctrl+S)
- @page CSS remove cabeçalho/rodapé da impressão
- Divisor entre canalizações NÃO aparece na impressão

## Preferências do usuário
- Código com comentários em português, tom natural de desenvolvedor
- Sem ofuscação/minificação (só bloqueios de teclas)
- Preparado para múltiplas bases (canalizações dinâmicas)
- Carretas iniciam VAZIAS (sem canalização predefinida)
- Botão "Iniciar Carregamento" no topo da página

## Libs externas (CDN)
- PDF.js 3.11.174
- QRious 4.0.2

## ============================================================
## BACKLOG - Próximas Implementações (09/07/2026)
## ============================================================

### 1. Seleção de Base (Airhub) antes do upload
- Tela inicial com dropdown/botões para escolher a base do usuário
- Bases disponíveis: BRAPE1, BRAAL1, BRAJP1, BRAMA1, BRAPI1, BRAMT1, BRABA1, BRADF1, BRAGO1, BRACE1, BRARS1, BRAPA1, BRAES1, BRAAM1
- Após upload do PDF, verificar o campo "Destino" do romaneio
- Se o destino não bater com a base selecionada → alerta: "O romaneio inserido é do airhub X mas você selecionou Y. Deseja continuar?"
- Serve para evitar erros de inserção de romaneio na base errada

### 2. Validação de data do romaneio
- Após upload, extrair a data do campo "Início" do romaneio
- Comparar com a data atual
- Se for um romaneio de dia anterior (D-1 ou mais antigo) → alerta: "Este romaneio é do dia DD/MM/AAAA. Deseja prosseguir?"
- Usuário confirma ou cancela
- Maioria usa romaneio do dia, algumas bases usam D-1

### 3. Reestruturação da navegação (nova página inicial pós-upload)
Após inserir o romaneio e validar (base + data), mostrar uma tela hub com:
- Resumo (canalizações, pacotes, HUs, totais - SEM qrcodes nessa tela)
- **Botão "Recebimento de Lâminas"** → tela onde lista os veículos PAG/PKC para marcar chegada com data/hora automática
- **Botão "Recebimento de Containers (Porão)"** → mesma coisa mas para DNA/FOS/outros veículos
- **Botão "Recebimento de Containers (QR Codes)"** → tela atual que mostra todos os QR codes por canalização para bipagem
- **Botão "Expedição de Carretas"** → tela de carregamento/expedição (já não precisa marcar "chegou" pq o recebimento já foi feito)

### 4. Recebimento com data e horário
- Ao clicar em um equipamento na tela de recebimento, registra automaticamente a data e hora de chegada
- Mostra o histórico: "1º ✈️ PAG 00319 G3 — chegou às 09:15"
- Essa informação pode ser usada na expedição (já sabe a ordem de chegada)

### 5. Visualização de HUs por veículo/lâmina
- Novo botão/tela que agrupa QR codes por veículo
- Veículos ficam em cards "recolhidos" (accordion/collapse)
- Ao clicar no veículo, expande mostrando: HUs, pacotes, canalizações, QR codes
- Opção de imprimir por veículo (gera PDF separado por lâmina)

### 6. Impressão em etiquetadora (Zebra)
- Botão para imprimir QR codes em formato de etiqueta
- Layout adaptado para etiquetadoras Zebra (tamanho menor, sem bordas extras)
- Cada etiqueta: QR code + número da HU + pacotes + veículo
- Pode ser um CSS de impressão específico ou gerar formato ZPL

### 7. Alerta ao atualizar página (F5)
- Ao tentar atualizar ou sair da página, mostrar confirmação: "O progresso será perdido. Deseja continuar?"
- Usar evento `beforeunload` do navegador

### 8. Ajuste na expedição
- Não precisa mais do botão "Chegou" na expedição porque o recebimento já foi feito separadamente
- A ordem de chegada vem da tela de recebimento
- Expedição foca só em: adicionar canalizações → alocar HUs → placa → fechar/expedir → imprimir

