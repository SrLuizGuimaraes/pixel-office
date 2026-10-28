# Novidades

O que entrou em cada versão do Pixel Office. Cada versão tem a sua seção aqui, e o texto dela vira as notas da
[release no GitHub](https://github.com/SrLuizGuimaraes/pixel-office/releases) (`npm run release`), que o Pixel Office abre em
**Configurações › Sobre › Ver o que mudou**.

O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), e os números seguem o
[versionamento semântico](https://semver.org/lang/pt-BR/): correção sobe o último número (0.2.**1**), novidade sobe o
do meio (0.**3**.0).

## [Não lançado]

## [1.0.3] - 2026-10-28

Primeira versão pública do Pixel Office.

### Novo

- **Escritório virtual dos seus agentes do Claude Code.** Cada projeto vira uma sala e cada agente, um personagem em pixel art
  que mostra em tempo real o que está fazendo, com contas, uso de 5 horas e semanal, terminal, mensagens e permissões
  pelo escritório (veja o README).
- **Três vistas além da 2D:** Escritório 3D (`?escritorio=3d`), Prédio em andares (`?escritorio=predio`) e Vista isométrica
  em pixel art (`?escritorio=iso`), todas pelos botões da barra do topo.
- **Botão de pixel art.** Em Configurações › Aparência, o interruptor "Pixel art" (ligado por padrão) troca os pixels nítidos
  por imagens suavizadas nas vistas 2D, 3D e isométrica.
- **Shopping, dojo, clube de tiro, quadra e kartódromo,** com economia de moedinhas, funcionários fixos nas lojas, compras,
  cinema, lutas, pênaltis, tiro ao alvo e corridas de kart entre os agentes.
- **Pacote de palavrões (opcional).** Em Configurações, os personagens podem soltar xingamentos de humor nas derrotas,
  provocações e reclamações.
- **Terreno em quarteirões,** com ruas, faixas de pedestres, praça e jardins em volta do escritório.
- **Quem conclui o projeto fica mais 24 h** de folga no escritório antes de ir embora.
- **Pixel Office World desligado por padrão:** não há servidor de mundo; o recurso só liga com `PIXEL_OFFICE_WORLD_URL`.
