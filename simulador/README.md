# Simulador ENEM

Este diretório contém a experiência de prova e a lógica usada pela rota do simulador no Portal Atlas.

## Objetivo

- carregar questões e gabaritos das provas locais;
- configurar e executar simulados por área e duração;
- apresentar o total de acertos, erros e questões em branco.

## Entradas principais

- `simulado.html` — tela de configuração e execução do simulado;
- `simulado.js` — lógica do simulador e carregamento das questões;
- `../dados/provas/` e `../dados/gabaritos/` — arquivos de banco de questões e gabaritos.

## Acesso pelo portal

Acesse o portal em `../portal/index.html`, entre com sua conta e escolha **Configurar prova** na página inicial. A rota `../portal/simulado.html` encaminha para a tela do simulado. Sirva o repositório por HTTP para permitir o carregamento dos arquivos locais.

O parser (`parser.js`, compartilhado com as ferramentas em `../dados/ferramentas/`) define a área pelo número da questão conforme a ordem da prova de cada ano (até 2016 o 1º dia era Humanas e Natureza). Questões anuladas no gabarito são ignoradas. Questões com `(tem imagem)` são exibidas com a figura quando ela consta em `../assets/imagens/indice.json`; caso contrário, ou se as alternativas forem imagens, são omitidas. O desempenho mostrado é uma contagem de acertos, não uma nota TRI oficial do ENEM.
