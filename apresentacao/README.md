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
