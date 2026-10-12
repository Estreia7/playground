import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseRnt, sanitizeEmail } = require("../backend/lib/rnt.js");

/* Owner contacts from the RNAL portal (Registo Nacional de Alojamento Local).
   The cells below are copied from live records, October 2026. */

function page(contactsCell: string): string {
  return (
    '<table id="x_wtShowRecordAlocajamento"></table>' +
    '<table id="x_wtTableRecords_Titular"><tbody><tr>' +
    "<td>Proprietário</td><td>109254864</td><td>Owner</td>" +
    `<td>${contactsCell}</td>` +
    "</tr></tbody></table>"
  );
}

const ICON_MAIL = '<div class="OSInline" style="margin-right: 5px;"><span class="fa fa-fw fa-envelope-o"></span></div>';
const ICON_PHONE = '<span class="fa fa-fw fa-mobile-phone"></span>';

function owner(cell: string) {
  return parseRnt(page(cell), "1").owners[0];
}

test("email alone in the nested-div layout is read once", () => {
  // AL 177879: used to come out as "helena.soares@me.comhelena.soares".
  const o = owner(`<div>${ICON_MAIL}helena.soares@me.com</div>`);
  assert.equal(o.email, "helena.soares@me.com");
  assert.equal(o.phone, null);
});

test("phone and email in the nested-div layout are both read", () => {
  // AL 134245: the email used to be lost to "luar4497@gmail.com960058172luar4497".
  const o = owner(
    `<div class="OSInline" style="margin-right: 5px;">${ICON_PHONE}960058172</div><div>${ICON_MAIL}luar4497@gmail.com</div>`
  );
  assert.equal(o.email, "luar4497@gmail.com");
  assert.equal(o.phone, "960058172");

  const intl = owner(
    `<div class="OSInline" style="margin-right: 5px;">${ICON_PHONE}+351960257184</div><div>${ICON_MAIL}ramos.boavida@outlook.pt</div>`
  );
  assert.equal(intl.email, "ramos.boavida@outlook.pt");
  assert.equal(intl.phone, "+351960257184");
});

test("the older <br> layout still parses", () => {
  const o = owner("912345678<br>joao@gmail.com");
  assert.equal(o.email, "joao@gmail.com");
  assert.equal(o.phone, "912345678");
  const sameLine = owner("912 345 678 joao@gmail.com");
  assert.equal(sameLine.email, "joao@gmail.com");
  assert.equal(sameLine.phone, "912 345 678");
});

test("no contacts gives nulls", () => {
  const o = owner("");
  assert.equal(o.email, null);
  assert.equal(o.phone, null);
});

test("cached emails read twice are repaired", () => {
  assert.equal(sanitizeEmail("helena.soares@me.comhelena.soares"), "helena.soares@me.com");
  assert.equal(sanitizeEmail("bedandsun@hotmail.combedandsun"), "bedandsun@hotmail.com");
  assert.equal(sanitizeEmail("vania@alojamentolocal.comvania"), "vania@alojamentolocal.com");
  assert.equal(sanitizeEmail("rui@sapo.ptrui"), "rui@sapo.pt");
});

test("valid emails are left alone, including ones ending with their own name", () => {
  assert.equal(sanitizeEmail("m@x.com"), "m@x.com");
  assert.equal(sanitizeEmail("info@dominio.info"), "info@dominio.info");
  assert.equal(sanitizeEmail("20anos@gmail.com"), "20anos@gmail.com");
  assert.equal(sanitizeEmail("Ana@Ana.PT"), "ana@ana.pt");
});

test("phone digits glued in front are still stripped", () => {
  assert.equal(sanitizeEmail("912345678joao@gmail.com"), "joao@gmail.com");
  assert.equal(sanitizeEmail("+351912345678joao@gmail.com"), "joao@gmail.com");
  assert.equal(sanitizeEmail("not an email"), null);
});
