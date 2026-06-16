# NFS-e Nacional PDF Generator (Node.js & Fastify)

Gerador de PDF para Documento Auxiliar da NFS-e (DANFSe) a partir de arquivos XML da NFS-e Nacional, rodando como um microsserviço Node.js com Fastify.

## Descrição

Este projeto converte arquivos XML de Nota Fiscal de Serviços Eletrônica (NFS-e) no formato nacional em documentos PDF formatados (DANFSe - Documento Auxiliar da NFS-e). É uma solução independente e de alto desempenho baseada em PDFKit.

## Requisitos

- Node.js >= 18
- NPM ou Yarn

## Instalação de Dependências

```bash
npm install
```

## Como Rodar Localmente

```bash
npm run dev
```

O servidor iniciará em `http://localhost:8000`.

## Endpoints Principais

- **GET `/docs`**: Documentação interativa via Swagger UI e playground para testes.
- **POST `/api/pdf`**: Recebe o arquivo XML e retorna o PDF correspondente de forma inline.

### Exemplo de Requisição (curl)

```bash
curl --location 'http://localhost:8000/api/pdf' \
--form 'xml=@"/caminho/para/o/seu/arquivo.xml"'
```
