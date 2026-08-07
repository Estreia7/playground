// RNT (Registo Nacional de Alojamento Local) lookup — Turismo de Portugal.
// The registry page is plain server-rendered ASP.NET, so a simple HTTPS GET
// is enough; no browser involved. Structure (verified against nr=179862):
//   - "RNAL nº NNNNNN/AL" header + "Registado em YYYY-MM-DD"
//   - ShowRecord table  -> name, opening date, building-era, utilization title
//   - Modalidade block  -> "Apartamento" / "Moradia" / ...
//   - Capacidade table  -> Nº Utentes / Quartos / Camas / Dormitórios / Beliches
//   - Localização table -> street parts + postal code + freguesia/concelho/distrito
//   - Titulares table   -> quality, NIF, name, contacts (email/phone)
//   - Seguro table      -> company, policy, start, validity ("Sem informação..." when absent)
// A bogus AL number returns the search page instead (no ShowRecord table).

const cheerio = require('cheerio');
const logger = require('./logger');

const RNT_BASE = 'https://rnt.turismodeportugal.pt/RNT/RNAL.aspx?nr=';
const FETCH_TIMEOUT_MS = 30_000;

async function fetchRnt(alNumber, signal) {
  if (process.env.SCRAPER_STUB === '1') return stubRnt(alNumber);

  const url = `${RNT_BASE}${encodeURIComponent(String(alNumber))}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.('abort', onAbort, { once: true });

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`RNT HTTP ${res.status}`);
    const html = await res.text();
    return parseRnt(html, alNumber);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

function parseRnt(html, alNumber) {
  const $ = cheerio.load(html);

  const showRecord = $('table[id*="wtShowRecordAlocajamento"]');
  if (showRecord.length === 0) {
    return { status: 'not-found', alNumber: String(alNumber) };
  }

  const out = {
    status: 'found',
    alNumber: String(alNumber),
    name: null,
    registeredAt: null,
    openedAt: null,
    modalidade: null,
    capacity: { utentes: null, quartos: null, camas: null },
    address: {
      tipoVia: null,
      via: null,
      porta: null,
      andar: null,
      lado: null,
      postalCode: null,
      localidade: null,
      freguesia: null,
      concelho: null,
      distrito: null,
      full: null,
    },
    owners: [],
    insurance: { status: 'none', company: null, policy: null, startDate: null, validUntil: null },
  };

  // --- Registration date: "Registado em <b>YYYY-MM-DD</b>" -----------------
  const bodyText = $('body').text();
  const regDate = bodyText.match(/Registado em\s*(\d{4}-\d{2}-\d{2})/);
  if (regDate) out.registeredAt = regDate[1];

  // --- ShowRecord caption/value rows ----------------------------------------
  showRecord.find('tr').each((_, tr) => {
    const caption = clean($(tr).find('td.ShowRecord_Caption').text());
    const value = clean($(tr).find('td.ShowRecord_Value').text());
    if (!caption) return;
    if (/Nome do Alojamento/i.test(caption)) out.name = value || null;
    else if (/Data de abertura/i.test(caption)) out.openedAt = value || null;
  });

  // --- Modalidade -----------------------------------------------------------
  const modalidade = clean($('[id*="wtModalidade"] .Bold').first().text());
  if (modalidade) out.modalidade = modalidade;

  // --- Capacidade: header row + value row, same column order ---------------
  const capTable = $('[id*="wtCapacidade"] table').first();
  if (capTable.length) {
    const headers = [];
    capTable.find('tr').first().find('td').each((_, td) => headers.push(clean($(td).text())));
    const values = [];
    capTable.find('tr').eq(1).find('td').each((_, td) => values.push(clean($(td).text())));
    headers.forEach((h, i) => {
      const n = parseInt(values[i], 10);
      if (!Number.isFinite(n)) return;
      if (/Utentes/i.test(h)) out.capacity.utentes = n;
      else if (/Quartos/i.test(h)) out.capacity.quartos = n;
      else if (/Camas/i.test(h)) out.capacity.camas = n;
    });
  }

  // --- Localização table ----------------------------------------------------
  const localRow = $('table[id*="wtTableRecords_Local"] tbody tr').first();
  if (localRow.length) {
    const cells = localRow.find('td');
    // Column order: Tipo de via | Designação | Porta | Andar | Lado |
    //               Código Postal | Localidade Postal | Localidade | Info Geográfica
    out.address.tipoVia = cellDesktopText($, cells.eq(0)) || null;
    out.address.via = clean(cells.eq(1).text()) || null;
    out.address.porta = clean(cells.eq(2).text()) || null;
    out.address.andar = clean(cells.eq(3).text()) || null;
    out.address.lado = clean(cells.eq(4).text()) || null;
    out.address.postalCode = clean(cells.eq(5).text()) || null;
    out.address.localidade = clean(cells.eq(7).text()) || clean(cells.eq(6).text()) || null;

    const geo = cells.eq(8).text();
    const freguesia = geo.match(/Freguesia:\s*([^\n]+?)(?=Concelho:|Distrito:|$)/);
    const concelho = geo.match(/Concelho:\s*([^\n]+?)(?=Freguesia:|Distrito:|$)/);
    const distrito = geo.match(/Distrito:\s*([^\n]+?)(?=Freguesia:|Concelho:|$)/);
    if (freguesia) out.address.freguesia = clean(freguesia[1]);
    if (concelho) out.address.concelho = clean(concelho[1]);
    if (distrito) out.address.distrito = clean(distrito[1]);

    out.address.full = buildFullAddress(out.address);
  }

  // --- Titulares ------------------------------------------------------------
  $('table[id*="wtTableRecords_Titular"] tbody tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 3) return;
    const contactsText = clean(cells.eq(3).text());
    const email = contactsText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const phone = contactsText.match(/(?:\+?\d[\d\s]{7,})/);
    out.owners.push({
      quality: clean(cells.eq(0).text()) || null,
      nif: clean(cells.eq(1).text()) || null,
      name: clean(cells.eq(2).text()) || null,
      email: email ? email[0] : null,
      phone: phone ? clean(phone[0]) : null,
    });
  });

  // --- Seguro ---------------------------------------------------------------
  const seguroRow = $('table[id*="wtTableRecords_Seguro"] tbody tr').first();
  if (seguroRow.length) {
    const cells = seguroRow.find('td');
    const firstText = clean(cells.eq(0).text());
    if (cells.length >= 4 && !/Sem informa/i.test(firstText)) {
      out.insurance.company = firstText || null;
      out.insurance.policy = clean(cells.eq(1).text()) || null;
      out.insurance.startDate = parseDate(cells.eq(2).text());
      out.insurance.validUntil = parseDate(cells.eq(3).text());
      if (out.insurance.validUntil) {
        const today = new Date().toISOString().slice(0, 10);
        out.insurance.status = out.insurance.validUntil >= today ? 'valid' : 'expired';
      } else {
        // A named company without a readable validity — treat as valid-unknown.
        out.insurance.status = out.insurance.company ? 'valid' : 'none';
      }
    }
  }

  return out;
}

// The "Tipo de via" cell renders desktop and smartphone variants; prefer the
// desktop one ("Praceta"), not the concatenated smartphone fallback.
function cellDesktopText($, cell) {
  const desktop = cell.find('.HiddenInSmartphone').first();
  if (desktop.length) return clean(desktop.text());
  return clean(cell.text());
}

function buildFullAddress(a) {
  const street = [a.tipoVia, a.via].filter(Boolean).join(' ');
  const parts = [
    [street, a.porta].filter(Boolean).join(' '),
    [a.postalCode, a.localidade].filter(Boolean).join(' '),
  ].filter((p) => p && p.trim());
  return parts.length ? parts.join(', ') : null;
}

function parseDate(raw) {
  const t = clean(raw);
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function clean(s) {
  return String(s || '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Stub -------------------------------------------------------------------

function stubRnt(alNumber) {
  const seed = parseInt(String(alNumber).slice(-3), 10) || 0;
  const concelhos = ['Albufeira', 'Lagos', 'Portimão', 'Loulé'];
  const insuranceStates = ['valid', 'expired', 'none'];
  const insurance = insuranceStates[seed % 3];
  return {
    status: 'found',
    alNumber: String(alNumber),
    name: `Stub AL ${alNumber}`,
    registeredAt: `20${18 + (seed % 8)}-0${1 + (seed % 9)}-15`,
    openedAt: `20${18 + (seed % 8)}-0${1 + (seed % 9)}-10`,
    modalidade: seed % 2 === 0 ? 'Apartamento' : 'Moradia',
    capacity: { utentes: 2 + (seed % 8), quartos: 1 + (seed % 4), camas: 1 + (seed % 5) },
    address: {
      tipoVia: 'Rua',
      via: `Stub ${seed}`,
      porta: String(1 + (seed % 90)),
      andar: null,
      lado: null,
      postalCode: `82${String(seed % 100).padStart(2, '0')}-1${String(seed % 10)}2`,
      localidade: concelhos[seed % 4],
      freguesia: concelhos[seed % 4],
      concelho: concelhos[seed % 4],
      distrito: 'Faro',
      full: `Rua Stub ${seed} ${1 + (seed % 90)}, 82${String(seed % 100).padStart(2, '0')}-102 ${concelhos[seed % 4]}`,
    },
    owners: [
      {
        quality: 'Proprietário',
        nif: `${seed % 2 === 0 ? '2' : '5'}${String(10000000 + seed * 137).slice(0, 8)}`,
        name: seed % 2 === 0 ? `Stub Owner ${seed}` : `Stub Empresa ${seed}, Lda`,
        email: `owner${seed}@stub.pt`,
        phone: null,
      },
    ],
    insurance: {
      status: insurance,
      company: insurance === 'none' ? null : 'Stub Seguros SA',
      policy: insurance === 'none' ? null : `AP-${seed}`,
      startDate: insurance === 'none' ? null : '2024-01-01',
      validUntil: insurance === 'none' ? null : insurance === 'expired' ? '2025-01-01' : '2027-01-01',
    },
  };
}

module.exports = { fetchRnt, parseRnt };
