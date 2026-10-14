// A stand-in for Brønnøysundregistrene's open API (GET /enheter/{orgnr}) in end-to-end tests,
// so tests never depend on the real registry. Start: node e2e/support/brreg-stub.mjs [port]
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? process.env.BRREG_STUB_PORT ?? 3199);

/** Fixed answers; any other number is an active AS named after the number. */
export const SPECIAL = {
  974000008: { status: 410, body: { organisasjonsnummer: '974000008', slettedato: '2021-05-01' } },
  910000004: { status: 404, body: { feilmelding: 'Ingen enhet funnet' } },
  987654325: { status: 200, body: { ...active('987654325', 'KONKURS MAT AS'), konkurs: true } },
  920000002: {
    status: 200,
    body: { ...active('920000002', 'AVVIKLING MAT AS'), underAvvikling: true },
  },
};

function active(orgNumber, name = `E2E TESTKJØKKEN ${orgNumber} AS`) {
  return {
    organisasjonsnummer: orgNumber,
    navn: name,
    organisasjonsform: { kode: 'AS', beskrivelse: 'Aksjeselskap' },
    forretningsadresse: { adresse: ['Testveien 1'], postnummer: '0155', poststed: 'OSLO' },
    konkurs: false,
    underAvvikling: false,
    underTvangsavviklingEllerTvangsopplosning: false,
  };
}

createServer((req, res) => {
  const match = /\/enheter\/(\d{9})$/.exec(req.url ?? '');
  const answer = match
    ? (SPECIAL[match[1]] ?? { status: 200, body: active(match[1]) })
    : { status: 404, body: {} };
  res.writeHead(answer.status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(answer.body));
}).listen(port, '127.0.0.1', () => console.log(`brreg stub on http://127.0.0.1:${port}`));
