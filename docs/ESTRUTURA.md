# Estrutura do site — Liga GLC Roraima (v2)

Atualizado em 19/10/2026 (rev. 10: ícones dos tipos de deck com tooltip).

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

## Ícones dos tipos de deck

`htmlTipo(tipo, { base, comTexto })` em `assets/js/data.js` mostra o ícone de `assets/img/tipos/<slug>.png` com tooltip (mouse, teclado e toque; CSS `.tipo-ic` em `style.css`). Aparece no pop-up de resultados (ao lado do nome), no histórico do perfil e na decklist; no painel, na linha do resultado, na conferência e no cartão da decklist. Tipo sem ícone aparece só como texto.

Os ícones são desenhos próprios da liga (selo quadrado colorido com símbolo genérico: folha, chama, gota, raio, espiral, impacto, lua, engrenagem, garras, anel). Não use os símbolos oficiais de energia/tipo do Pokémon TCG. Para criar ou mudar um ícone: edite `fonte/<slug>.svg`, gere o PNG de 96 px com o mesmo nome e, se for um tipo novo, inclua o slug em `TIPOS_COM_ICONE` (`data.js`) e o nome em `tipos_pokemon` (`config.json`).

## Decklist de reserva

Todo jogador do Top 3 de um evento com resultado tem o botão "Decklist" no pop-up e "Ver decklist" no perfil. Sem imagem nem lista em texto cadastradas, o site mostra `assets/img/decklists/sem-imagem.svg` ("Decklist em breve"). Se a imagem enviada ainda não foi publicada pelo GitHub Pages, também aparece a reserva. A função é `decklistTop3()` em `assets/js/data.js`.

## Histórico dos jogadores

O histórico de cada jogador é montado a partir de `resultados.json` (colocações por evento) e `decklists.json`. Os dados ficam em um só lugar: ao registrar um evento, o perfil de todos os participantes se atualiza sozinho.

## Dados de teste

Os dados de teste foram removidos em 19/10/2026. Registros de teste novos levam `"teste": true`.

## Arquivos

```
index.html                 estrutura fixa: cabeçalho, palco das seções, rodapé
assets/
  css/style.css            estilos, cores do logo em variáveis, modo claro e escuro
  js/data.js               carrega data/*.json e utilitários (datas, status, escape)
  js/main.js               menu, roteador com slide, páginas, pop-up de resultados e carrossel
  icons/GLCRR-logo.png     logo da liga (cabeçalho, Início e ícone da aba)
  images/fotos/            fotos do carrossel (.jpg, .jpeg, .png, .webp)
  img/decklists/           imagens de decklist: [evento_id]-[posicao]-[jogador_id].jpg (enviadas pelo painel)
                           e sem-imagem.svg (reserva "Decklist em breve")
  img/tipos/               ícones dos tipos de deck: [slug].png (96 px), arte própria da liga;
                           fonte/[slug].svg é o original editável
  img/jogadores/           ícones dos jogadores, enviados pelo painel: [jogador_id]-[AAAAMMDDhhmmss].webp/.png (256 px)
data/
  config.json              temporada, Instagram, pasta de fotos, repositório GitHub, tipos de evento, tipos de deck (tipos_pokemon)
  eventos.json             eventos
  resultados.json          colocações por evento
  jogadores.json           perfis (só apelido e cidade)
  decklists.json           listas do Top 3
  banlist.json             banlist (atualizada só sob pedido)
  fotos.json               reserva do carrossel: lista de nomes de arquivo
docs/
  ESTRUTURA.md             este arquivo
  REGRAS-LOCAIS.md         regras próprias da liga e regra do ranking
admin/                     painel administrativo (fora do menu, noindex)
  index.html               login e telas do painel
  admin.css                estilos do painel (usa os tokens de style.css)
  admin.js                 login, sessão, roteamento interno e telas
  cripto.js                cifra da chave do GitHub com a senha (PBKDF2 + AES-GCM)
  github.js                leitura e gravação pela API de conteúdo do GitHub
  regras-jogadores.js      regras do cadastro de jogadores (slug, apelido parecido, validação, idade), sem DOM
  tela-jogadores.js        tela Jogadores: lista, busca, cadastro e edição
  regras-eventos.js        regras de eventos (id, validação) e de resultados (classificação, empates), sem DOM
  tela-eventos.js          tela Eventos: lista, cadastro, edição e exclusão
  tela-resultados.js       tela Resultados: lançamento manual com conferência, correção, exclusão e decklists do Top 3
  imagens.js               preparo de imagens no navegador (recorte, redução, regravação sem metadados)
  gerar-acesso.html/.js    gerador do registro cifrado de cada organizador
  usuarios.json            registros cifrados dos organizadores
  testes/                  testes no Node (node --test admin/testes/*.test.js)
```

## Painel administrativo (`admin/`)

Página separada da SPA, sem link no menu e com `noindex`. Visitantes do site não baixam o código do painel.

- **Login:** cada organizador tem um registro em `usuarios.json` com usuário, salt, iv e a chave fine-grained do GitHub cifrada com a senha (PBKDF2-SHA256, 600 mil iterações, AES-GCM). Senha errada não decifra nada. O registro é gerado em `gerar-acesso.html`, no navegador do próprio organizador; a senha e a chave nunca saem do aparelho.
- **Sessão:** a chave decifrada fica no `sessionStorage` e some ao fechar a aba. Chave recusada pelo GitHub (expirada ou revogada) encerra a sessão.
- **Gravação:** commit direto na `main` pela API de conteúdo, com o `sha` atual e mensagem `[painel:<usuario>] ...`. Em conflito, relê, reaplica e tenta de novo (até 3 vezes). O JSON é validado antes de gravar.
- **Dados:** públicos em `data/` (GLCRR); nome real e nascimento em `jogadores-privado.json` e rascunhos do suíço em `rascunhos/` (repositório privado GLC-privado).
- **Segurança extra:** CSP restrita (só scripts próprios e `api.github.com`), sem referrer, não abre dentro de moldura.
- **Rotas internas:** `#inicio`, `#jogadores`, `#jogadores/novo`, `#jogadores/<id>`, `#eventos`, `#eventos/novo`, `#eventos/<id>`, `#resultados`, `#resultados/<evento_id>`. Cada tela fica em `tela-<nome>.js` e se registra em `window.TELAS_PAINEL`.
- **Ícone do jogador:** opcional, enviado pelo painel. O painel recorta em quadrado, reduz para 256 px e regrava a imagem (some o GPS e outros dados ocultos). O organizador confirma que não há rosto nem arte, carta ou logo oficial da Pokémon. O nome do arquivo leva data e hora, para o navegador não mostrar o ícone antigo; o arquivo anterior é apagado. Sem ícone, o avatar mostra a inicial.
- **Exclusão de jogador:** só para quem não aparece em nenhum resultado ou decklist. Apaga o registro público, o privado e o ícone, com confirmação.
- **Jogadores:** apelido, cidade e "desde" vão para `data/jogadores.json` (público); nome completo e nascimento vão para `jogadores-privado.json` (GLC-privado). O id é o slug do apelido e não muda. Apelido parecido com outro jogador pede confirmação antes de gravar. A idade aparece só no painel. Mensagens de commit levam só o id do jogador.
- **Eventos:** grava `data/eventos.json` (ordenado por data). O id (`AAAA-MM-DD-slug`) acompanha data e nome enquanto o evento não tem resultado nem decklist; depois fica fixo. Status vazio = automático. Link que não é de Google Forms gera aviso. Exclusão só sem resultado nem decklist.
- **Resultados:** uma linha por jogador (posição, jogador, V, D, E, obs), com subir/descer e "Numerar pela ordem". Posição repetida exige "empate" em todos os empatados. "Conferir" mostra a tabela no formato da conferência (Template B) com avisos (buraco na classificação, vitórias ≠ derrotas, data futura); só então "Publicar" grava `data/resultados.json`, substituindo o resultado anterior do evento. A digitação fica em rascunho no `sessionStorage` da aba (só ids e números). Apagar resultado só se o evento não tiver decklist.
- **Tipo do deck:** cada linha do resultado tem o seletor "Tipo do deck" (opcional, para todos os jogadores), com a lista `tipos_pokemon` de `config.json`. Um tipo antigo fora da lista continua aceito no mesmo resultado. O site mostra o tipo na classificação do pop-up, no perfil e na decklist (`tipoDoDeck()` em `assets/js/data.js`: primeiro o da linha do resultado, depois o de decklists antigas).
- **Decklists do Top 3:** na tela do resultado publicado, um cartão por jogador do Top 3 com envio de imagem (PNG, JPEG ou WEBP; o painel reduz para no máximo 1600 px e grava JPEG sem metadados) e lista em texto; o tipo vem da linha do resultado. O organizador confirma que a imagem não mostra nome completo, documento, rosto nem outro dado pessoal. Enviar de novo substitui a imagem. "Usar a reserva" tira a imagem; "Apagar decklist" remove o registro. Ao corrigir um resultado, a posição das decklists acompanha; quem tem decklist e sai do Top 3 bloqueia a publicação até a decklist ser apagada.
- **Telas:** Início, Jogadores, Eventos e Resultados prontas. Torneio suíço chega nas etapas 4 e 5.

## Carrossel de fotos

1. O site pede à API do GitHub a lista de arquivos de `assets/images/fotos/`. Dono e repositório vêm de `config.json` (`github.owner` e `github.repo`); se estiverem vazios, são deduzidos do endereço `<usuario>.github.io/<repo>`.
2. Se a API falhar (limite de 60 consultas por hora por visitante, ou domínio próprio), usa `data/fotos.json`.
3. Ordem: nome do arquivo. Para controlar a ordem, nomeie `foto-01.jpg`, `foto-02.jpg`...
4. Fotos com menos de 500 KB e sem rosto identificável de jogadores.

## Campos dos JSON

- **eventos.json**: `id` (AAAA-MM-DD-slug), `nome`, `data` (AAAA-MM-DD), `horario`, `local`, `vagas`, `tipo` (Torneio Anual, Amistoso, Encontro da comunidade), `status` (vazio = calculado; ou Agendado, Inscrições abertas, Encerrado), `inscricao_url`, `descricao`.
- **resultados.json**: `evento_id`, `colocacoes` [{`posicao`, `jogador_id`, `vitorias`, `derrotas`, `empates`, `tipo_pokemon` (opcional, para qualquer colocação), `obs` (opcional: empate, drop)}].
- **jogadores.json**: `id`, `apelido`, `cidade` (opcional), `desde` (ano), `icone` (opcional: caminho em `assets/img/jogadores/`).
- **decklists.json**: `evento_id`, `jogador_id`, `posicao` (1 a 3), `lista_texto` (opcional), `imagem` (opcional; o painel grava `caminho.jpg?v=AAAAMMDDhhmmss` para o navegador não mostrar a imagem antiga do cache).
- **banlist.json**: `atualizado_em`, `fonte`, `cartas` [{`nome`, `colecao`, `numero`}].

Status calculado: data passada = Encerrado; futura com link real de Google Forms = Inscrições abertas; futura sem link = Agendado.

## Versão dos arquivos (cache)

O GitHub Pages deixa `.js` e `.css` em cache no navegador por cerca de 10 minutos. Para o navegador nunca juntar um arquivo novo com outro antigo, as três páginas (`index.html`, `admin/index.html`, `admin/gerar-acesso.html`) carregam todos os scripts e estilos locais com a mesma versão, ex.: `main.js?v=20261019.2`.

**Ao mudar qualquer `.js` ou `.css`, troque a versão nas três páginas, com o mesmo valor** (formato `AAAAMMDD.n`). O teste `admin/testes/versao.test.js` falha se faltar a versão ou se as páginas tiverem versões diferentes.

## Como testar

Os JSON não carregam com o arquivo aberto direto (file://). Use a extensão Live Server do VS Code ou teste no GitHub Pages.
