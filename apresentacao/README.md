# Apresentação — Ácido Hipocloroso (HClO)

Deck institucional/comercial em português (11 slides, 16:9) sobre o ácido hipocloroso.

## Arquivos

| Arquivo | Uso |
|---|---|
| `Acido-Hipocloroso-Apresentacao.pptx` | Versão editável (PowerPoint, Google Slides, Keynote) |
| `Acido-Hipocloroso-Apresentacao.pdf` | Versão para envio/impressão |
| `gerar_apresentacao.js` | Script que gera o `.pptx` |

## Roteiro dos slides

1. Capa
2. Agenda
3. O que é o ácido hipocloroso
4. Uma tecnologia que o seu corpo já usa (origem natural)
5. Higienizar não é desinfetar
6. Segurança para o uso diário
7. Espectro de ação (vírus e bactérias)
8. Onde o HClO já é protagonista
9. Por que empresas práticas já fizeram a troca
10. Catálogo técnico (ativo, tempo de ação, duração, modo de aplicar)
11. Conclusão e chamada para ação

## Movimento

O deck tem transição entre slides e animação de entrada nos elementos:

- **Transições:** *push* para cima nos slides claros; *fade* nos slides escuros
  (1, 4, 7 e 11), marcando as viradas de capítulo.
- **Animação:** cada bloco entra subindo levemente com fade (~0,5 s), em cascata
  de 0,13 s entre os blocos — título, texto de apoio e depois os cartões, na
  ordem de leitura. Rodapé e numeração não animam.

Os parâmetros ficam no bloco de pós-processamento do script (`STAGGER`, `DUR`,
`RISE` e o mapa `TRANSICOES`). Para desligar o movimento, basta remover a
chamada `aplicarMovimento(OUT)` no final do arquivo.

## Antes de apresentar

Dois pontos precisam dos dados oficiais do produto — não foram inventados:

- **Slide 10 (Catálogo técnico):** substituir as descrições por concentração, tempo de
  ação, duração/validade e instruções de aplicação da ficha técnica.
- **Slide 11 (Conclusão):** inserir contato, site e redes da empresa.

Cada slide tem notas do apresentador (aba "Notas" no PowerPoint).

## Regerando o arquivo

```bash
npm install pptxgenjs react react-dom react-icons sharp
node gerar_apresentacao.js
```

O sistema de design (cores, fontes, espaçamentos) fica no topo do script, nas constantes
`C`, `F` e `M` — alterar ali propaga para todos os slides.
