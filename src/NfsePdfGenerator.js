import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import SVGtoPDF from 'svg-to-pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MM_TO_PT = 2.834645;
const mm = (v) => v * MM_TO_PT;

export class NfsePdfGenerator {
  constructor() {
    this.doc = new PDFDocument({
      size: 'A4',
      margins: {
        top: mm(5),
        bottom: mm(5),
        left: mm(5),
        right: mm(5)
      },
      autoPageBreak: false, // Prevent PDFKit from auto-creating page 2 and mixing coordinates
      bufferPages: true
    });
    this.margin = mm(5);
    this.logoSvg = null;
    this.headerInfo = {
      municipalityLine: null,
      secretariatLine: null,
      phoneLine: null,
      emailLine: null,
    };
    this.data = {};
    this.qrBuffer = null;
  }

  setLogoSvg(svgContent) {
    this.logoSvg = svgContent;
    return this;
  }

  setHeaderInfo(headerInfo) {
    this.headerInfo = { ...this.headerInfo, ...headerInfo };
    return this;
  }

  getY() {
    return this.doc.y;
  }

  setY(y) {
    this.doc.y = y;
  }

  setXY(x, y) {
    this.doc.x = x;
    this.doc.y = y;
  }

  cell(text, x, y, w, h, align = 'left', bold = false, fontSize = 8, isMulti = false) {
    this.doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(fontSize)
        .fillColor('#000000');
    
    this.doc.text(text || '', x, y, {
      width: w,
      align: align,
      lineBreak: isMulti
    });
  }

  multiCell(text, x, y, w, h, align = 'left', bold = false, fontSize = 8) {
    this.doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(fontSize)
        .fillColor('#000000');
    
    this.doc.text(text || '', x, y, {
      width: w,
      align: align,
      lineBreak: true
    });
  }

  getStringHeight(text, w, bold = false, fontSize = 8) {
    this.doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
    return this.doc.heightOfString(text || '', { width: w });
  }

  parseXml(xmlStringOrPath) {
    let xmlContent = xmlStringOrPath;
    if (fs.existsSync(xmlStringOrPath)) {
      xmlContent = fs.readFileSync(xmlStringOrPath, 'utf-8');
    }

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
      removeNSPrefix: true
    });

    const parsed = parser.parse(xmlContent);

    let infNFSe = parsed.NFSe ? parsed.NFSe.infNFSe : parsed.infNFSe;
    if (!infNFSe && parsed.infNFSe) {
      infNFSe = parsed.infNFSe;
    }
    
    if (!infNFSe) {
      throw new Error("Invalid NFS-e XML structure: infNFSe element not found");
    }

    const dps = infNFSe.DPS ? infNFSe.DPS.infDPS : (infNFSe.infDPS || null);
    if (!dps) {
      throw new Error("Invalid NFS-e XML structure: infDPS/DPS element not found");
    }

    const extractText = (val) => {
      if (val == null) return '';
      if (typeof val === 'object') {
        return val['#text'] !== undefined ? String(val['#text']) : '';
      }
      return String(val);
    };

    const id = extractText(infNFSe.Id || '');
    const chaveAcesso = id.replace(/^NFS/, '');

    const opSimpNac = extractText(dps.prest?.regTrib?.opSimpNac);
    const regApTribSN = extractText(dps.prest?.regTrib?.regApTribSN);

    const emit = infNFSe.emit || {};
    const enderEmit = emit.enderNac || {};

    const toma = dps.toma || {};
    const endToma = toma.end || {};
    const endTomaNac = endToma.endNac || endToma.endExt || {};

    const serv = dps.serv || {};
    const cServ = serv.cServ || {};

    const dpsValores = dps.valores || {};
    const infValores = infNFSe.valores || {};

    this.data = {
      chaveAcesso: String(chaveAcesso),
      numeroNfse: extractText(infNFSe.nNFSe),
      localEmissao: extractText(infNFSe.xLocEmi),
      localPrestacao: extractText(infNFSe.xLocPrestacao),
      localIncidencia: extractText(infNFSe.xLocIncid),
      tribNac: extractText(infNFSe.xTribNac),
      dataProcessamento: this.formatDateTime(extractText(infNFSe.dhProc)),
      numeroDFSe: extractText(infNFSe.nDFSe),
      emitente: {
        cnpj: this.formatCnpjCpf(extractText(emit.CNPJ)),
        nome: extractText(emit.xNome),
        IM: extractText(emit.IM),
        logradouro: extractText(enderEmit.xLgr),
        numero: extractText(enderEmit.nro),
        bairro: extractText(enderEmit.xBairro),
        municipio: extractText(enderEmit.cMun),
        uf: extractText(enderEmit.UF),
        cep: this.formatCep(extractText(enderEmit.CEP)),
        fone: this.formatPhone(extractText(emit.fone)),
        email: extractText(emit.email),
      },
      tomador: {
        cnpj: this.formatCnpjCpf(extractText(toma.CNPJ || toma.CPF || toma.NIF || '-')),
        nome: extractText(toma.xNome),
        IM: extractText(toma.IM),
        email: extractText(toma.email),
        logradouro: extractText(endToma.xLgr),
        numero: extractText(endToma.nro),
        complemento: extractText(endToma.xCpl),
        bairro: extractText(endToma.xBairro),
        municipio: extractText(endTomaNac.cMun),
        uf: extractText(endTomaNac.UF || emit.enderNac?.UF),
        cep: this.formatCep(extractText(endTomaNac.CEP)),
        fone: this.formatPhone(extractText(toma.fone)),
      },
      servico: {
        codTribNac: extractText(cServ.cTribNac),
        descricao: extractText(cServ.xDescServ),
      },
      valores: {
        valorServico: parseFloat(extractText(dpsValores.vServPrest?.vServ) || 0),
        valorLiquido: parseFloat(extractText(infValores.vLiq) || 0),
        valorTotalRet: parseFloat(extractText(infValores.vTotalRet) || 0),
        bcIssqn: parseFloat(extractText(infValores.vBC) || 0),
        aliqAplicada: parseFloat(extractText(infValores.pAliqAplic) || 0),
        issqnApurado: parseFloat(extractText(infValores.vISSQN) || 0),
        vRetCSLL: parseFloat(extractText(dpsValores.trib?.tribFed?.piscofins?.vRetCSLL || dpsValores.trib?.tribFed?.vRetCSLL) || 0),
        vRetIRRF: parseFloat(extractText(dpsValores.trib?.tribFed?.vRetIRRF || dpsValores.trib?.vRetIRRF) || 0),
        vRetCP: parseFloat(extractText(dpsValores.trib?.tribFed?.vRetCP || dpsValores.trib?.vRetCP) || 0),
      },
      dps: {
        numero: extractText(dps.nDPS),
        serie: extractText(dps.serie),
        competencia: this.formatDate(extractText(dps.dCompet)),
        dataEmissao: this.formatDateTime(extractText(dps.dhEmi)),
      },
      tributacao: {
        tribISSQN: extractText(dpsValores.trib?.tribMun?.tribISSQN),
        tpRetISSQN: extractText(dpsValores.trib?.tribMun?.tpRetISSQN),
        totTribFed: parseFloat(extractText(dpsValores.trib?.totTrib?.pTotTrib?.pTotTribFed) || 0),
        totTribEst: parseFloat(extractText(dpsValores.trib?.totTrib?.pTotTrib?.pTotTribEst) || 0),
        totTribMun: parseFloat(extractText(dpsValores.trib?.totTrib?.pTotTrib?.pTotTribMun) || 0),
        opSimpNac: extractText(opSimpNac),
        regApTribSN: extractText(regApTribSN),
        vPis: parseFloat(extractText(dpsValores.trib?.tribFed?.piscofins?.vPis || dpsValores.trib?.tribFed?.vPis) || 0),
        vCofins: parseFloat(extractText(dpsValores.trib?.tribFed?.piscofins?.vCofins || dpsValores.trib?.tribFed?.vCofins) || 0),
      }
    };

    return this;
  }

  formatCnpjCpf(value) {
    value = value.replace(/\D/g, '');
    if (value.length === 14) {
      return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    } else if (value.length === 11) {
      return value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    }
    return value;
  }

  formatCep(value) {
    value = value.replace(/\D/g, '');
    if (value.length === 8) {
      return value.replace(/^(\d{5})(\d{3})$/, '$1-$2');
    }
    return value;
  }

  formatPhone(value) {
    value = value.replace(/\D/g, '');
    if (value.length === 11) {
      return `(${value.substring(0, 2)}) ${value.substring(2, 7)}-${value.substring(7)}`;
    } else if (value.length === 10) {
      return `(${value.substring(0, 2)}) ${value.substring(2, 6)}-${value.substring(6)}`;
    }
    return value;
  }

  formatDate(value) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return value;
  }

  formatDateTime(value) {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      return `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}:${match[6]}`;
    }
    return value;
  }

  formatCodTribNac(value) {
    value = value.replace(/\D/g, '');
    if (value.length === 6) {
      return `${value.substring(0, 2)}.${value.substring(2, 4)}.${value.substring(4)}`;
    }
    return value;
  }

  truncateTextToLines(text, width, maxLines, lineHeight = mm(4), suffix = '...') {
    const maxHeight = maxLines * lineHeight;
    if (this.getStringHeight(text, width) <= maxHeight) {
      return text;
    }

    let len = text.length;
    while (len > suffix.length) {
      const truncated = text.substring(0, len) + suffix;
      if (this.getStringHeight(truncated, width) <= maxHeight) {
        return truncated;
      }
      len--;
    }
    return suffix;
  }

  drawDocumentBorder() {
    const pageWidth = mm(210);
    const pageHeight = mm(297);
    
    const x = this.margin - mm(3);
    const y = this.margin - mm(3);
    const w = pageWidth - 2 * (this.margin - mm(2.5));
    const h = pageHeight - 2 * (this.margin - mm(2.5));

    this.doc.lineWidth(0.28)
        .strokeColor('#000000')
        .rect(x, y, w, h)
        .stroke();
  }

  addHorizontalLine(addLineHeight = true) {
    const y = this.getY();
    const pageWidth = mm(210);
    const rightEdge = pageWidth - this.margin;
    
    this.doc.moveTo(this.margin, y)
        .lineTo(rightEdge, y)
        .lineWidth(0.28)
        .strokeColor('#000000')
        .stroke();
        
    if (addLineHeight) {
      this.doc.y = y + mm(2);
    }
  }

  async generate() {
    const qrUrl = `https://www.nfse.gov.br/ConsultaPublica?tpc=1&chave=${this.data.chaveAcesso}`;
    try {
      this.qrBuffer = await QRCode.toBuffer(qrUrl, {
        margin: 0,
        width: 150,
        errorCorrectionLevel: 'L'
      });
    } catch (err) {
      console.error("Failed to generate QR code:", err);
    }

    await this.addHeader();
    this.addHorizontalLine();
    this.addDadosNfse();
    this.addHorizontalLine();
    this.addEmitente();
    this.addHorizontalLine();
    this.addTomador();
    this.addHorizontalLine(false);
    this.addServico();
    this.addHorizontalLine();
    this.addTributacao();
    this.addHorizontalLine();
    this.addValores();
    this.addHorizontalLine();
    this.addTotaisTributos();

    this.drawDocumentBorder();

    this.doc.end();
    return this.doc;
  }

  async addHeader() {
    const startY = this.getY();

    const logoPath = path.join(__dirname, '../assets/logo-nfse-assinatura-horizontal.png');
    if (fs.existsSync(logoPath)) {
      this.doc.image(logoPath, this.margin, startY, { width: mm(50) });
    }

    const centerX = mm(62);
    this.cell('DANFSe v1.0', centerX, startY, mm(50), 4, 'center', true, 9);
    this.cell('Documento Auxiliar da NFS-e', centerX, startY + mm(4), mm(50), 4, 'center', true, 9);

    const rightX = mm(137);
    const blockWidth = mm(55);
    const logoWidth = mm(12);
    const gap = mm(2);
    const textBlockWidth = blockWidth - logoWidth - gap;

    if (this.logoSvg) {
      try {
        SVGtoPDF(this.doc, this.logoSvg, rightX, startY, { width: logoWidth });
      } catch (err) {
        console.error("Failed to render SVG logo:", err);
      }
    }

    const textX = rightX + logoWidth + gap;
    const municipalityLine = this.headerInfo.municipalityLine || `Prefeitura Municipal de ${this.data.localEmissao}`;
    const secretariatLine = this.headerInfo.secretariatLine || 'Secretaria Municipal de Finanças';
    const phoneLine = this.headerInfo.phoneLine || this.data.emitente.fone || '-';
    const emailLine = this.headerInfo.emailLine || this.data.emitente.email || '-';

    this.cell(municipalityLine, textX, startY, textBlockWidth, 3, 'left', true, 8);
    this.cell(secretariatLine, textX, startY + mm(3), textBlockWidth, 2.5, 'left', false, 6);
    this.cell(phoneLine, textX, startY + mm(5.5), textBlockWidth, 2.5, 'left', false, 6);
    this.cell(emailLine, textX, startY + mm(8), textBlockWidth, 2.5, 'left', false, 6);

    this.setY(startY + mm(12) + mm(1));
  }

  addDadosNfse() {
    const col1X = this.margin;
    const col2X = mm(47);
    const col3X = mm(97);
    const col4X = mm(147);
    const col1W = mm(45);
    const col2W = mm(50);
    const col3W = mm(50);
    const col4W = mm(45);

    const startY = this.getY();

    const fullWidth = col1W + col2W + col3W + col4W;
    this.cell('Chave de Acesso da NFS-e', col1X, startY, fullWidth, 4, 'left', true, 7);
    this.cell(this.data.chaveAcesso, col1X, startY + mm(4), fullWidth, 4, 'left', false, 8);

    const row1Y = startY + mm(9);

    const qrSize = mm(18);
    const qrX = col4X + (col4W - qrSize) / 1.5;
    const qrY = row1Y - mm(1);

    if (this.qrBuffer) {
      this.doc.image(this.qrBuffer, qrX, qrY, { width: qrSize });
    }

    this.cell('Número da NFS-e', col1X, row1Y, col1W, 4, 'left', true, 7);
    this.cell('Competência da NFS-e', col2X, row1Y, col2W, 4, 'left', true, 7);
    this.cell('Data e Hora da emissão da NFS-e', col3X, row1Y, col3W, 4, 'left', true, 7);

    const row2Y = row1Y + mm(4);
    this.cell(this.data.numeroNfse, col1X, row2Y, col1W, 4, 'left', false, 8);
    this.cell(this.data.dps.competencia, col2X, row2Y, col2W, 4, 'left', false, 8);
    this.cell(this.data.dataProcessamento, col3X, row2Y, col3W, 4, 'left', false, 8);

    const row3Y = row2Y + mm(5);
    this.cell('Número da DPS', col1X, row3Y, col1W, 4, 'left', true, 7);
    this.cell('Série da DPS', col2X, row3Y, col2W, 4, 'left', true, 7);
    this.cell('Data e Hora da emissão da DPS', col3X, row3Y, col3W, 4, 'left', true, 7);

    const row4Y = row3Y + mm(4);
    this.cell(this.data.dps.numero, col1X, row4Y, col1W, 4, 'left', false, 8);
    this.cell(this.data.dps.serie, col2X, row4Y, col2W, 4, 'left', false, 8);
    this.cell(this.data.dps.dataEmissao, col3X, row4Y, col3W, 4, 'left', false, 8);

    const message = 'A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e';
    this.multiCell(message, col4X, row4Y, col4W - mm(1), 1, 'left', false, 5);
    
    const messageEndY = this.getY();
    this.setY(Math.max(row1Y + qrSize, messageEndY) + mm(2));
  }

  addEmitente() {
    const col1X = this.margin;
    const col2X = mm(47);
    const col3X = mm(97);
    const col4X = mm(147);
    const col1W = mm(45);
    const col2W = mm(50);
    const col3W = mm(50);
    const col4W = mm(45);

    const emit = this.data.emitente;
    const startY = this.getY();

    this.cell('EMITENTE DA NFS-e', col1X, startY, col1W, 4, 'left', true, 7);
    this.cell('CNPJ / CPF / NIF', col2X, startY, col2W, 4, 'left', true, 7);
    this.cell('Inscrição Municipal', col3X, startY, col3W, 4, 'left', true, 7);
    this.cell('Telefone', col4X, startY, col4W, 4, 'left', true, 7);

    this.cell('Prestador do Serviço', col1X, startY + mm(4), col1W, 4, 'left', false, 8);
    this.cell(emit.cnpj, col2X, startY + mm(4), col2W, 4, 'left', false, 8);
    this.cell(emit.IM, col3X, startY + mm(4), col3W, 4, 'left', false, 8);
    this.cell(emit.fone, col4X, startY + mm(4), col4W, 4, 'left', false, 8);

    const row2Y = startY + mm(9);
    this.cell('Nome / Nome Empresarial', col1X, row2Y, col1W, 4, 'left', true, 7);
    this.cell('E-mail', col3X, row2Y, col3W, 4, 'left', true, 7);

    this.cell(emit.nome, col1X, row2Y + mm(4), col1W + col2W, 4, 'left', false, 8);
    this.cell(emit.email, col3X, row2Y + mm(4), col3W, 4, 'left', false, 8);

    const row3Y = row2Y + mm(9);
    this.cell('Endereço', col1X, row3Y, col1W, 4, 'left', true, 7);
    this.cell('Município', col3X, row3Y, col3W, 4, 'left', true, 7);
    this.cell('CEP', col4X, row3Y, col4W, 4, 'left', true, 7);

    const endereco = `${emit.logradouro}, ${emit.numero}, ${emit.bairro}`;
    this.cell(endereco, col1X, row3Y + mm(4), col1W + col2W, 4, 'left', false, 8);
    this.cell(`${this.data.localEmissao} - ${emit.uf}`, col3X, row3Y + mm(4), col3W, 4, 'left', false, 8);
    this.cell(emit.cep, col4X, row3Y + mm(4), col4W, 4, 'left', false, 8);

    const opSimpNacMap = {
      '1': 'Não Optante',
      '2': 'Optante - Microempreendedor Individual (MEI)',
      '3': 'Optante - Microempresa ou Empresa de Pequeno Porte (ME/EPP)',
    };
    const regApTribSNMap = {
      '1': 'Regime de apuração dos tributos federais e municipal pelo SN',
      '2': 'Regime de apuração dos tributos federais pelo SN e o ISSQN pela NFS-e conforme respectiva legislação municipal do tributo',
      '3': 'Regime de apuração dos tributos federais e municipal pela NFS-e conforme respectivas legislações federal e municipal de cada tributo',
    };

    const opSimpNac = this.data.tributacao.opSimpNac;
    const regApTribSN = this.data.tributacao.regApTribSN;
    const descSimples = opSimpNacMap[opSimpNac] || opSimpNacMap['1'];
    const descReg = regApTribSNMap[regApTribSN] || '-';

    const row4Y = row3Y + mm(9);
    this.cell('Simples Nacional na Data de Competência', col1X, row4Y, col1W, 4, 'left', true, 7);
    this.cell('Regime de Apuração Tributária pelo SN', col3X, row4Y, col3W + col4W, 4, 'left', true, 7);

    this.cell(descSimples, col1X, row4Y + mm(4), col1W + col2W, 4, 'left', false, 8);
    this.multiCell(descReg, col3X, row4Y + mm(4), col3W + col4W, 4, 'left', false, 8);

    const descRegEndY = this.getY();
    this.setY(Math.max(descRegEndY, row4Y + mm(8)) + mm(1));
  }

  addTomador() {
    const col1X = this.margin;
    const col2X = mm(47);
    const col3X = mm(97);
    const col4X = mm(147);
    const col1W = mm(45);
    const col2W = mm(50);
    const col3W = mm(50);
    const col4W = mm(45);

    const toma = this.data.tomador;
    const startY = this.getY();

    this.cell('TOMADOR DO SERVIÇO', col1X, startY, col1W, 4, 'left', true, 7);
    this.cell('CNPJ / CPF / NIF', col2X, startY, col2W, 4, 'left', true, 7);
    this.cell('Inscrição Municipal', col3X, startY, col3W, 4, 'left', true, 7);
    this.cell('Telefone', col4X, startY, col4W, 4, 'left', true, 7);

    this.cell('', col1X, startY + mm(4), col1W, 4, 'left', false, 8);
    this.cell(toma.cnpj, col2X, startY + mm(4), col2W, 4, 'left', false, 8);
    this.cell(toma.IM, col3X, startY + mm(4), col3W, 4, 'left', false, 8);
    this.cell(toma.fone, col4X, startY + mm(4), col4W, 4, 'left', false, 8);

    const row2Y = startY + mm(9);
    this.cell('Nome / Nome Empresarial', col1X, row2Y, col1W, 4, 'left', true, 7);
    this.cell('E-mail', col3X, row2Y, col3W, 4, 'left', true, 7);

    this.cell(toma.nome, col1X, row2Y + mm(4), col1W + col2W, 4, 'left', false, 8);
    this.cell(toma.email, col3X, row2Y + mm(4), col3W, 4, 'left', false, 8);

    const row3Y = row2Y + mm(9);
    this.cell('Endereço', col1X, row3Y, col1W, 4, 'left', true, 7);
    this.cell('Município', col3X, row3Y, col3W, 4, 'left', true, 7);
    this.cell('CEP', col4X, row3Y, col4W, 4, 'left', true, 7);

    let endereco = `${toma.logradouro}, ${toma.numero}`;
    if (toma.complemento) {
      endereco += `, ${toma.complemento}`;
    }
    endereco += `, ${toma.bairro}`;

    let municipioTomador = this.data.localIncidencia;
    if (toma.uf) {
      municipioTomador += ` - ${toma.uf}`;
    }

    this.cell(endereco, col1X, row3Y + mm(4), col1W + col2W, 4, 'left', false, 8);
    this.cell(municipioTomador, col3X, row3Y + mm(4), col3W, 4, 'left', false, 8);
    this.cell(toma.cep, col4X, row3Y + mm(4), col4W, 4, 'left', false, 8);

    this.setY(row3Y + mm(9));
    this.addHorizontalLine(false);
    this.cell('INTERMEDIÁRIO DO SERVIÇO NÃO IDENTIFICADO NA NFS-e', this.margin, this.getY(), mm(200), 4, 'center', false, 7);
    this.setY(this.getY() + mm(4));
  }

  addServico() {
    const col1X = this.margin;
    const col2X = mm(47);
    const col3X = mm(97);
    const col4X = mm(147);
    const col1W = mm(45);
    const col2W = mm(50);
    const col3W = mm(50);
    const col4W = mm(45);

    const serv = this.data.servico;
    const startY = this.getY();

    this.cell('SERVIÇO PRESTADO', col1X, startY, mm(200), 4, 'left', true, 7);

    const headersY = startY + mm(4);
    this.cell('Código de Tributação Nacional', col1X, headersY, col1W, 4, 'left', true, 7);
    this.cell('Código de Tributação Municipal', col2X, headersY, col2W, 4, 'left', true, 7);
    this.cell('Local da Prestação', col3X, headersY, col3W, 4, 'left', true, 7);
    this.cell('País da Prestação', col4X, headersY, col4W, 4, 'left', true, 7);

    const dataY = headersY + mm(4);
    const codTribFormatted = this.formatCodTribNac(serv.codTribNac);
    const codTrib = this.truncateTextToLines(`${codTribFormatted} - ${this.data.tribNac}`, col1W, 3);

    this.multiCell(codTrib, col1X, dataY, col1W, 4, 'left', false, 8);
    const codTribHeight = this.getStringHeight(codTrib, col1W, false, 8);

    let localPrestacao = this.data.localPrestacao;
    if (this.data.emitente.uf) {
      localPrestacao += ` - ${this.data.emitente.uf}`;
    }

    this.cell('-', col2X, dataY, col2W, 4, 'left', false, 8);
    this.cell(localPrestacao, col3X, dataY, col3W, 4, 'left', false, 8);
    this.cell('-', col4X, dataY, col4W, 4, 'left', false, 8);

    const descY = dataY + codTribHeight;
    this.cell('Descrição do Serviço', col1X, descY, col1W, 4, 'left', true, 7);

    const descCleaned = serv.descricao.replace(/\\r\\n|\\n|\\r|\r\n|\r/g, '\n');
    this.multiCell(descCleaned, col2X, descY, col2W + col3W + col4W, 4, 'left', false, 8);

    const descEndY = this.getY();
    this.setY(Math.max(descEndY, descY + mm(4)) + mm(2));
  }

  addTributacao() {
    const col1X = this.margin;
    const col2X = mm(47);
    const col3X = mm(97);
    const col4X = mm(147);
    const col1W = mm(45);
    const col2W = mm(50);
    const col3W = mm(50);
    const col4W = mm(45);

    const startY = this.getY();
    this.cell('TRIBUTAÇÃO MUNICIPAL', col1X, startY, mm(200), 4, 'left', true, 7);

    const row1Y = startY + mm(4);
    this.cell('Tributação do ISSQN', col1X, row1Y, col1W, 4, 'left', true, 7);
    this.cell('País Resultado da Prestação do Serviço', col2X, row1Y, col2W, 4, 'left', true, 7);
    this.cell('Município de Incidência do ISSQN', col3X, row1Y, col3W, 4, 'left', true, 7);
    this.cell('Regime Especial de Tributação', col4X, row1Y, col4W, 4, 'left', true, 7);

    let localIncidencia = this.data.localIncidencia;
    if (this.data.emitente.uf) {
      localIncidencia += ` - ${this.data.emitente.uf}`;
    }

    this.cell('Operação Tributável', col1X, row1Y + mm(4), col1W, 4, 'left', false, 8);
    this.cell('-', col2X, row1Y + mm(4), col2W, 4, 'left', false, 8);
    this.cell(localIncidencia, col3X, row1Y + mm(4), col3W, 4, 'left', false, 8);
    this.cell('Nenhum', col4X, row1Y + mm(4), col4W, 4, 'left', false, 8);

    const row2Y = row1Y + mm(9);
    this.cell('Tipo de Imunidade', col1X, row2Y, col1W, 4, 'left', true, 7);
    this.cell('Suspensão da Exigibilidade do ISSQN', col2X, row2Y, col2W, 4, 'left', true, 7);
    this.cell('Número Processo Suspensão', col3X, row2Y, col3W, 4, 'left', true, 7);
    this.cell('Benefício Municipal', col4X, row2Y, col4W, 4, 'left', true, 7);

    this.cell('-', col1X, row2Y + mm(4), col1W, 4, 'left', false, 8);
    this.cell('Não', col2X, row2Y + mm(4), col2W, 4, 'left', false, 8);
    this.cell('-', col3X, row2Y + mm(4), col3W, 4, 'left', false, 8);
    this.cell('-', col4X, row2Y + mm(4), col4W, 4, 'left', false, 8);

    const row3Y = row2Y + mm(9);
    this.cell('Valor do Serviço', col1X, row3Y, col1W, 4, 'left', true, 7);
    this.cell('Desconto Incondicionado', col2X, row3Y, col2W, 4, 'left', true, 7);
    this.cell('Total Deduções/Reduções', col3X, row3Y, col3W, 4, 'left', true, 7);
    this.cell('Cálculo do BM', col4X, row3Y, col4W, 4, 'left', true, 7);

    this.cell(`R$ ${this.formatMoney(this.data.valores.valorServico)}`, col1X, row3Y + mm(4), col1W, 4, 'left', false, 8);
    this.cell('-', col2X, row3Y + mm(4), col2W, 4, 'left', false, 8);
    this.cell('-', col3X, row3Y + mm(4), col3W, 4, 'left', false, 8);
    this.cell('-', col4X, row3Y + mm(4), col4W, 4, 'left', false, 8);

    const row4Y = row3Y + mm(9);
    this.cell('BC ISSQN', col1X, row4Y, col1W, 4, 'left', true, 7);
    this.cell('Alíquota Aplicada', col2X, row4Y, col2W, 4, 'left', true, 7);
    this.cell('Retenção do ISSQN', col3X, row4Y, col3W, 4, 'left', true, 7);
    this.cell('ISSQN Apurado', col4X, row4Y, col4W, 4, 'left', true, 7);

    const tpRetISSQNMap = {
      '1': 'Não Retido',
      '2': 'Retido pelo Tomador',
      '3': 'Retido pelo Intermediário',
    };
    const retencaoIssqn = tpRetISSQNMap[this.data.tributacao.tpRetISSQN] || '-';

    this.cell(this.data.valores.bcIssqn > 0 ? `R$ ${this.formatMoney(this.data.valores.bcIssqn)}` : '-', col1X, row4Y + mm(4), col1W, 4, 'left', false, 8);
    this.cell(this.data.valores.aliqAplicada > 0 ? `${this.formatMoney(this.data.valores.aliqAplicada)}%` : '-', col2X, row4Y + mm(4), col2W, 4, 'left', false, 8);
    this.cell(retencaoIssqn, col3X, row4Y + mm(4), col3W, 4, 'left', false, 8);
    this.cell(this.data.valores.issqnApurado > 0 ? `R$ ${this.formatMoney(this.data.valores.issqnApurado)}` : '-', col4X, row4Y + mm(4), col4W, 4, 'left', false, 8);

    this.setY(row4Y + mm(9));
    this.addHorizontalLine();
    
    const row5Y = this.getY();
    this.cell('TRIBUTAÇÃO FEDERAL', col1X, row5Y, mm(200), 4, 'left', true, 7);

    const row5HeadersY = row5Y + mm(4);
    this.cell('IRRF', col1X, row5HeadersY, col1W, 4, 'left', true, 7);
    this.cell('Contribuição Previdenciária - Retida', col2X, row5HeadersY, col2W, 4, 'left', true, 7);
    this.cell('Contribuições Sociais - Retidas', col3X, row5HeadersY, col3W, 4, 'left', true, 7);
    this.cell('Descrição Contrib. Sociais - Retidas', col4X, row5HeadersY, col4W, 4, 'left', true, 7);

    const vRetIRRFVal = this.data.valores.vRetIRRF;
    const vRetCPVal = this.data.valores.vRetCP;
    const vRetCSLLVal = this.data.valores.vRetCSLL;
    
    const irrfText = vRetIRRFVal > 0 ? `R$ ${this.formatMoney(vRetIRRFVal)}` : '-';
    const cpText = vRetCPVal > 0 ? `R$ ${this.formatMoney(vRetCPVal)}` : '-';
    const csllText = vRetCSLLVal > 0 ? `R$ ${this.formatMoney(vRetCSLLVal)}` : '-';

    const row5DataY = row5HeadersY + mm(4);
    this.cell(irrfText, col1X, row5DataY, col1W, 4, 'left', false, 8);
    this.cell(cpText, col2X, row5DataY, col2W, 4, 'left', false, 8);
    this.cell(csllText, col3X, row5DataY, col3W, 4, 'left', false, 8);
    this.cell('-', col4X, row5DataY, col4W, 4, 'left', false, 8);

    const row6HeadersY = row5DataY + mm(5);
    this.cell('PIS - Débito Apuração Própria', col1X, row6HeadersY, col1W, 4, 'left', true, 7);
    this.cell('COFINS - Débito Apuração Própria', col2X, row6HeadersY, col2W, 4, 'left', true, 7);

    const vPisVal = this.data.tributacao.vPis;
    const vCofinsVal = this.data.tributacao.vCofins;
    const pisText = vPisVal > 0 ? `R$ ${this.formatMoney(vPisVal)}` : '-';
    const cofinsText = vCofinsVal > 0 ? `R$ ${this.formatMoney(vCofinsVal)}` : '-';

    const row6DataY = row6HeadersY + mm(4);
    this.cell(pisText, col1X, row6DataY, col1W, 4, 'left', false, 8);
    this.cell(cofinsText, col2X, row6DataY, col2W, 4, 'left', false, 8);

    this.setY(row6DataY + mm(5));
  }

  addValores() {
    const col1X = this.margin;
    const col2X = mm(47);
    const col3X = mm(97);
    const col4X = mm(147);
    const col1W = mm(45);
    const col2W = mm(50);
    const col3W = mm(50);
    const col4W = mm(45);

    const startY = this.getY();
    this.cell('VALOR TOTAL DA NFS-E', col1X, startY, mm(200), 4, 'left', true, 7);

    const row1Y = startY + mm(4);
    this.cell('Valor do Serviço', col1X, row1Y, col1W, 4, 'left', true, 7);
    this.cell('Desconto Condicionado', col2X, row1Y, col2W, 4, 'left', true, 7);
    this.cell('Desconto Incondicionado', col3X, row1Y, col3W, 4, 'left', true, 7);
    this.cell('ISSQN Retido', col4X, row1Y, col4W, 4, 'left', true, 7);

    const tpRetISSQN = this.data.tributacao.tpRetISSQN;
    const issqnRetido = ['2', '3'].includes(tpRetISSQN) && this.data.valores.issqnApurado > 0
        ? `R$ ${this.formatMoney(this.data.valores.issqnApurado)}`
        : '-';

    this.cell(`R$ ${this.formatMoney(this.data.valores.valorServico)}`, col1X, row1Y + mm(4), col1W, 4, 'left', false, 8);
    this.cell('-', col2X, row1Y + mm(4), col2W, 4, 'left', false, 8);
    this.cell('-', col3X, row1Y + mm(4), col3W, 4, 'left', false, 8);
    this.cell(issqnRetido, col4X, row1Y + mm(4), col4W, 4, 'left', false, 8);

    const row2Y = row1Y + mm(9);
    this.cell('Total das Retenções Federais', col1X, row2Y, col1W, 4, 'left', true, 7);
    this.cell('PIS/COFINS - Débito Apur. Própria', col2X, row2Y, col2W, 4, 'left', true, 7);
    this.cell('Valor Líquido da NFS-e', col4X, row2Y, col4W, 4, 'left', true, 7);

    const vRetCSLLVal = this.data.valores.vRetCSLL;
    const retCSLLText = vRetCSLLVal > 0 ? `R$ ${this.formatMoney(vRetCSLLVal)}` : '-';
    
    const totalPisCofinsApria = (this.data.tributacao.vPis || 0) + (this.data.tributacao.vCofins || 0);
    const totalPisCofinsApriaText = totalPisCofinsApria > 0 ? `R$ ${this.formatMoney(totalPisCofinsApria)}` : '-';

    this.cell(retCSLLText, col1X, row2Y + mm(4), col1W, 4, 'left', false, 8);
    this.cell(totalPisCofinsApriaText, col2X, row2Y + mm(4), col2W, 4, 'left', false, 8);
    this.cell(`R$ ${this.formatMoney(this.data.valores.valorLiquido)}`, col4X, row2Y + mm(4), col4W, 4, 'left', true, 8);

    this.setY(row2Y + mm(9));
  }

  addTotaisTributos() {
    const col1X = this.margin;
    const col2X = mm(62);
    const col3X = mm(122);
    const col1W = mm(60);
    const col2W = mm(60);
    const col3W = mm(60);

    const startY = this.getY();
    this.cell('TOTAIS APROXIMADOS DOS TRIBUTOS', col1X, startY, mm(200), 4, 'left', true, 7);

    const headersY = startY + mm(4);
    this.cell('Federais', col1X, headersY, col1W, 4, 'left', true, 7);
    this.cell('Estaduais', col2X, headersY, col2W, 4, 'left', true, 7);
    this.cell('Municípios', col3X, headersY, col3W, 4, 'left', true, 7);

    const dataY = headersY + mm(4);
    this.cell(`${this.formatMoney(this.data.tributacao.totTribFed)} %`, col1X, dataY, col1W, 4, 'left', false, 8);
    this.cell(`${this.formatMoney(this.data.tributacao.totTribEst)} %`, col2X, dataY, col2W, 4, 'left', false, 8);
    this.cell(`${this.formatMoney(this.data.tributacao.totTribMun)} %`, col3X, dataY, col3W, 4, 'left', false, 8);

    this.setY(dataY + mm(8));
    this.cell('INFORMAÇÕES COMPLEMENTARES', this.margin, this.getY(), mm(200), 4, 'left', true, 7);
  }

  formatMoney(value) {
    if (value == null || isNaN(value)) return '0,00';
    return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
