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

## Paleta

Amostrada do próprio arquivo do logo: **azul-marinho `#0C2259`** e **verde
`#409942`**. O azul domina (fundos escuros, títulos, ícones, cartões de
destaque) e o verde entra como acento único — chips, círculos de ícone sobre
fundo escuro e as linhas de destaque. Tudo vive nas constantes `C` no topo do
script; trocar ali repinta o deck inteiro, inclusive os ícones.

## Logo da marca no rodapé

Salve o logo nesta pasta como `logo-nebutech.svg` (ideal) ou `logo-nebutech.png`
e rode o gerador de novo: ele entra no rodapé de todos os slides, à esquerda,
alinhado com a numeração.

- **Nitidez:** se o arquivo tiver menos de 1600 px de largura, ele é reamostrado
  com Lanczos e recebe uma máscara de nitidez leve. Isso aumenta a definição sem
  mexer em cor, proporção ou em qualquer elemento do logo. Um SVG dispensa o
  tratamento — sai perfeito em qualquer tamanho.
- **Encaixe:** o logo é ajustado dentro de uma caixa de 1,35 × 0,5 pol
  preservando a proporção, então qualquer versão (horizontal, quadrada ou
  empilhada) cabe sem quebrar o layout.
- **Fundo removido:** o branco do arquivo vira transparência pela cobertura de
  tinta de cada pixel, o que preserva as bordas suavizadas do desenho.
- **Fundos escuros:** nos slides 1, 4, 7 e 11 é usada uma versão invertida,
  gerada automaticamente — o azul-marinho da marca vira branco e o verde é
  preservado. Se a NebuTech tiver uma versão negativa oficial, ela é preferível:
  salve como `logo-nebutech-negativo.png` e aponte no script.

Sem o arquivo, o rodapé permanece na linha de texto original.

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
