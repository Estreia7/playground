import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { cleanStreet, houseNumber, buildAttempts } = require("../backend/lib/geocode.js");

/* RNT street fields as typed into the registry (live records, October 2026).
   Before cleaning, Nominatim found none of these and the whole dossier fell
   back to one parish-centre pin. */

test("cleanStreet drops building, block and unit details", () => {
  assert.equal(
    cleanStreet("Rua", "Manuel da Fonseca, condomínio Vila Sol F5, Bloco 5, Fracção U"),
    "Rua Manuel da Fonseca"
  );
  assert.equal(cleanStreet("Rua", "da Alagoa, Edifício Infante"), "Rua da Alagoa");
  assert.equal(cleanStreet("Rua", 'do Farol, Fracção Autónoma "O"'), "Rua do Farol");
  assert.equal(cleanStreet("Rua", "Comandante Dionísio Casanova Viegas, Nº5 B"), "Rua Comandante Dionísio Casanova Viegas");
  assert.equal(cleanStreet("Avenida", "Comunidades Lusíadas torre 8"), "Avenida Comunidades Lusíadas");
  assert.equal(cleanStreet("Urbanização", "Vila Rosa LOTE 4"), "Urbanização Vila Rosa");
});

test("cleanStreet cuts at dash separators and glued abbreviations", () => {
  assert.equal(cleanStreet("Rua", "Rua AGOSTO AZUL- TRES CASTELOS. EDF. CLUBE PRAIA MAR B2"), "Rua AGOSTO AZUL");
  assert.equal(
    cleanStreet("Avenida", "Avenida Comunidades Lusíadas- COND.PARAISO SOL DA ROCHA BLOCO A"),
    "Avenida Comunidades Lusíadas"
  );
  assert.equal(cleanStreet("Rua", "Rua Alto Pacheco - Terraços do Vau"), "Rua Alto Pacheco");
});

test("cleanStreet removes the repeated street type", () => {
  assert.equal(cleanStreet("Rua", "Rua Diogo Cão"), "Rua Diogo Cão");
  assert.equal(cleanStreet("Alameda", "ALAMEDA DO CONVENTO - APARTAMENTOS"), "Alameda DO CONVENTO");
});

test("cleanStreet keeps real names that only look like keywords", () => {
  assert.equal(cleanStreet("Rua", "Condeixa Nova"), "Rua Condeixa Nova");
  assert.equal(cleanStreet("Rua", "Dr. José-Maria Andrade"), "Rua Dr. José-Maria Andrade");
  assert.equal(cleanStreet("Volta", "do Tomilho"), "Volta do Tomilho");
});

test("cleanStreet gives up on unnamed streets", () => {
  assert.equal(cleanStreet("Avenida", "Sem Nome"), null);
  assert.equal(cleanStreet("Rua", ""), null);
});

test("houseNumber accepts door numbers, not building codes", () => {
  assert.equal(houseNumber("78"), "78");
  assert.equal(houseNumber("61A"), "61A");
  assert.equal(houseNumber("5 b"), "5B");
  assert.equal(houseNumber("EM21"), null);
  assert.equal(houseNumber(null), null);
});

test("buildAttempts tries the street before the town before the parish", () => {
  const attempts = buildAttempts({
    tipoVia: "Rua",
    via: 'do Farol, Fracção Autónoma "O"',
    porta: "78",
    postalCode: "8125-199",
    localidade: "Vilamoura",
    freguesia: "Quarteira",
    concelho: "Loulé",
    distrito: "Faro",
    full: null,
  });
  assert.deepEqual(
    attempts.map((a: { precision: string }) => a.precision),
    ["street", "street", "street", "street", "postal", "locality", "locality"]
  );
  assert.equal(attempts[0].params.street, "78 Rua do Farol");
  assert.equal(attempts[0].params.city, "Vilamoura");
  assert.equal(attempts[5].params.q, "Vilamoura, Loulé, Faro, Portugal");
  assert.equal(attempts[6].params.q, "Quarteira, Loulé, Faro, Portugal");
});
