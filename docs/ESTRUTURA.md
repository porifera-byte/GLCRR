# Estrutura do site — Liga GLC Roraima (v2)

Atualizado em 16/10/2026 (rev. 2).

Site estático (HTML, CSS e JS puros) publicado no GitHub Pages. É uma página única: cada seção é uma âncora em `index.html` e a troca entre seções desliza na ordem do menu.

## Seções (âncoras)

| Âncora | Conteúdo | Dados usados |
|---|---|---|
| `#inicio` | Logo, texto principal, botão do Instagram, carrossel de fotos e menu de botões flutuantes | `config.json`, pasta de fotos |
| `#calendario` | Próximos eventos e eventos realizados | `eventos.json` |
| `#ranking` | Participações e colocações da temporada (sem pontos até a regra ser definida) | `resultados.json`, `eventos.json`, `jogadores.json`, `config.json` |
| `#regras` | Resumo do GLC, regras locais e banlist | `banlist.json` |
| `#jogadores` | Cartões dos jogadores com totais | `jogadores.json`, `resultados.json` |
| `#jogadores/<id>` | Perfil: totais, histórico de eventos, colocação, V-D-E e decklist do Top 3 | `jogadores.json`, `resultados.json`, `decklists.json`, `eventos.json` |

Não há seções próprias de Decklists nem de Inscrições:
- **Inscrições:** botão "Inscreva-se" nos próximos eventos do Calendário, com o link do Google Forms (`inscricao_url`).
- **Decklists:** aparecem no pop-up de resultados do evento (Top 3) e no histórico do perfil do jogador.

## Pop-up de resultados

No Calendário, cada evento realizado com resultados tem o botão "Resultados". Ele abre um pop-up com a classificação, um botão "Perfil" por jogador (leva a `#jogadores/<id>`) e, no Top 3, um botão "Decklist" que mostra a imagem da lista. O mesmo pop-up abre pelo botão "Classificação do evento" no perfil. Esc, o X ou um clique fora fecham.

## Histórico dos jogadores

O histórico de cada jogador é montado a partir de `resultados.json` (colocações por evento) e `decklists.json`. Os dados ficam em um só lugar: ao registrar um evento, o perfil de todos os participantes se atualiza sozinho.

## Dados de teste

Os jogadores Kaio, Rosso, Saymon e Vinicius, os resultados dos 2 eventos e as 6 decklists em `assets/img/decklists/` são de teste. Todos têm `"teste": true` no JSON. Para limpar, apague esses registros e as imagens.

## Arquivos

```
index.html                 estrutura fixa: cabeçalho, palco das seções, rodapé
assets/
  css/style.css            estilos, cores do logo em variáveis, modo claro e escuro
  js/data.js               carrega data/*.json e utilitários (datas, status, escape)
  js/main.js               menu, roteador com slide, páginas, pop-up de resultados e carrossel
  icons/GLCRR-logo.png     logo da liga (cabeçalho, Início e ícone da aba)
  images/fotos/            fotos do carrossel (.jpg, .jpeg, .png, .webp)
  img/decklists/           imagens de decklist: [evento_id]-[posicao]-[jogador_id].png/.jpg
data/
  config.json              temporada, Instagram, pasta de fotos, repositório GitHub, tipos de evento
  eventos.json             eventos
  resultados.json          colocações por evento
  jogadores.json           perfis (só apelido e cidade)
  decklists.json           listas do Top 3
  banlist.json             banlist (atualizada só sob pedido)
  fotos.json               reserva do carrossel: lista de nomes de arquivo
docs/
  ESTRUTURA.md             este arquivo
  REGRAS-LOCAIS.md         regras próprias da liga e regra do ranking
```

## Carrossel de fotos

1. O site pede à API do GitHub a lista de arquivos de `assets/images/fotos/`. Dono e repositório vêm de `config.json` (`github.owner` e `github.repo`); se estiverem vazios, são deduzidos do endereço `<usuario>.github.io/<repo>`.
2. Se a API falhar (limite de 60 consultas por hora por visitante, ou domínio próprio), usa `data/fotos.json`.
3. Ordem: nome do arquivo. Para controlar a ordem, nomeie `foto-01.jpg`, `foto-02.jpg`...
4. Fotos com menos de 500 KB e sem rosto identificável de jogadores.

## Campos dos JSON

- **eventos.json**: `id` (AAAA-MM-DD-slug), `nome`, `data` (AAAA-MM-DD), `horario`, `local`, `vagas`, `tipo` (Torneio Anual, Amistoso, Encontro da comunidade), `status` (vazio = calculado; ou Agendado, Inscrições abertas, Encerrado), `inscricao_url`, `descricao`.
- **resultados.json**: `evento_id`, `colocacoes` [{`posicao`, `jogador_id`, `vitorias`, `derrotas`, `empates`, `obs` (opcional: empate, drop)}].
- **jogadores.json**: `id`, `apelido`, `cidade` (opcional), `desde` (ano).
- **decklists.json**: `evento_id`, `jogador_id`, `posicao` (1 a 3), `tipo_pokemon`, `lista_texto` (opcional), `imagem` (opcional).
- **banlist.json**: `atualizado_em`, `fonte`, `cartas` [{`nome`, `colecao`, `numero`}].

Status calculado: data passada = Encerrado; futura com link real de Google Forms = Inscrições abertas; futura sem link = Agendado.

## Como testar

Os JSON não carregam com o arquivo aberto direto (file://). Use a extensão Live Server do VS Code ou teste no GitHub Pages.
