import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NfsePdfGenerator } from './NfsePdfGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify = Fastify({ logger: true });

// Register multipart support for file uploads
await fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Root route
fastify.get('/', async (request, reply) => {
  return {
    message: 'NFS-e Nacional PDF Generator API is running in JavaScript/Fastify.',
    endpoints: {
      'POST /api/pdf': 'Generates PDF from uploaded NFS-e XML file (form-data: xml)',
      'GET /docs': 'Swagger API documentation and playground'
    }
  };
});

// Serve OpenAPI Specification
fastify.get('/api/openapi.json', async (request, reply) => {
  const specPath = path.join(__dirname, 'openapi.json');
  const spec = fs.readFileSync(specPath, 'utf8');
  reply.header('Content-Type', 'application/json; charset=utf-8');
  return JSON.parse(spec);
});

// Serve Swagger UI HTML
fastify.get('/docs', async (request, reply) => {
  const docsPath = path.join(__dirname, 'docs.html');
  const html = fs.readFileSync(docsPath, 'utf8');
  reply.header('Content-Type', 'text/html; charset=utf-8');
  return html;
});

// Generate PDF endpoint
fastify.post('/api/pdf', async (request, reply) => {
  const data = await request.file();
  if (!data || data.fieldname !== 'xml') {
    reply.status(400);
    return { error: 'No XML file uploaded. Please make sure the field name is "xml".' };
  }

  // Consume stream to buffer
  const chunks = [];
  for await (const chunk of data.file) {
    chunks.push(chunk);
  }
  const xmlContent = Buffer.concat(chunks).toString('utf8');

  try {
    const generator = new NfsePdfGenerator();
    
    // Default SVG logo (shield icon)
    const svgLogo = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
      <path fill-rule="evenodd" d="M8 14.933a1 1 0 0 0 .1-.025q.114-.034.294-.118c.24-.113.547-.29.893-.533a10.7 10.7 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39c-.651-.213-1.75-.56-2.837-.855C9.552 1.29 8.531 1.067 8 1.067zM5.072.56C6.157.265 7.31 0 8 0s1.843.265 2.928.56c1.11.3 2.229.655 2.887.87a1.54 1.54 0 0 1 1.044 1.262c.596 4.477-.787 7.795-2.465 9.99a11.8 11.8 0 0 1-2.517 2.453 7 7 0 0 1-1.048.625c-.28.132-.581.24-.829.24s-.548-.108-.829-.24a7 7 0 0 1-1.048-.625 11.8 11.8 0 0 1-2.517-2.453C1.928 10.487.545 7.169 1.141 2.692A1.54 1.54 0 0 1 2.185 1.43 63 63 0 0 1 5.072.56"/>
    </svg>`;

    generator.parseXml(xmlContent);
    generator.setLogoSvg(svgLogo);
    generator.setHeaderInfo({
      municipalityLine: 'Prefeitura Municipal',
      secretariatLine: 'Secretaria de Finanças',
    });

    const doc = await generator.generate();

    // Collect PDF stream into a buffer
    const pdfChunks = [];
    doc.on('data', (chunk) => pdfChunks.push(chunk));
    
    const pdfBuffer = await new Promise((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(pdfChunks)));
      doc.on('error', (err) => reject(err));
    });

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', 'inline; filename="nfse.pdf"');
    reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
    reply.header('Pragma', 'public');
    
    return pdfBuffer;
  } catch (err) {
    fastify.log.error(err);
    reply.status(500);
    return { error: 'Failed to generate PDF: ' + err.message };
  }
});

// Run server
const port = process.env.PORT || 8000;
const host = '0.0.0.0';

try {
  await fastify.listen({ port, host });
  console.log(`Server listening on http://${host}:${port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
