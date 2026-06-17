/**
 * SafeTea Safety Vault — Evidentiary Abuse Affidavit (EAA)
 *
 * An EAA is the affiant's own sworn, first-person account of abuse: who the
 * abuser is, the history, specific incidents, threats, access to weapons,
 * prior reports / protective orders, witnesses, and what the affiant fears.
 * It is designed to be printed, signed before a notary, and used as
 * documentation / potential evidence.
 *
 * IMPORTANT — this is deliberately different from community safety reports.
 * The EAA *names the abuser by design*; that is its legal purpose. It is the
 * affiant's private, encrypted record (stored under the folder DEK), so there
 * is no name/PII screening here.
 *
 * This module owns:
 *   - sanitizeAffidavit(raw)  → normalized, length-capped structured object
 *   - renderAffidavitPdf(...) → Promise<Buffer> formal affidavit PDF (PDFKit)
 *
 * Persistence + encryption live in the route handlers (api/vault/affidavit*),
 * which encrypt the JSON this module sanitizes under the folder DEK.
 */

'use strict';

const PDFDocument = require('pdfkit');

const FREE_MAX = 8000;     // long narrative fields
const MED_MAX = 2000;      // incident / abuser descriptions
const SHORT_MAX = 300;     // names, single-line fields
const LIST_MAX = 50;       // max incidents / witnesses

function str(v, max) {
  if (v == null) return '';
  var s = String(v).replace(/\u0000/g, '').trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

function sanitizeAffidavit(raw) {
  var a = (raw && typeof raw === 'object') ? raw : {};
  var affiant = (a.affiant && typeof a.affiant === 'object') ? a.affiant : {};
  var abuser = (a.abuser && typeof a.abuser === 'object') ? a.abuser : {};

  var incidents = Array.isArray(a.incidents) ? a.incidents.slice(0, LIST_MAX).map(function (i) {
    i = (i && typeof i === 'object') ? i : {};
    return {
      date: str(i.date, SHORT_MAX),
      location: str(i.location, SHORT_MAX),
      description: str(i.description, MED_MAX),
      injuries: str(i.injuries, SHORT_MAX),
      police_report: str(i.police_report, SHORT_MAX),
      medical: str(i.medical, SHORT_MAX),
    };
  }).filter(function (i) {
    return i.date || i.location || i.description || i.injuries || i.police_report || i.medical;
  }) : [];

  var witnesses = Array.isArray(a.witnesses) ? a.witnesses.slice(0, LIST_MAX).map(function (w) {
    w = (w && typeof w === 'object') ? w : {};
    return {
      name: str(w.name, SHORT_MAX),
      relationship: str(w.relationship, SHORT_MAX),
      contact: str(w.contact, SHORT_MAX),
    };
  }).filter(function (w) { return w.name || w.relationship || w.contact; }) : [];

  return {
    affiant: {
      full_name: str(affiant.full_name, SHORT_MAX),
      dob: str(affiant.dob, SHORT_MAX),
      contact: str(affiant.contact, SHORT_MAX),
    },
    abuser: {
      full_name: str(abuser.full_name, SHORT_MAX),
      aliases: str(abuser.aliases, SHORT_MAX),
      relationship: str(abuser.relationship, SHORT_MAX),
      dob: str(abuser.dob, SHORT_MAX),
      description: str(abuser.description, MED_MAX),
      address: str(abuser.address, SHORT_MAX),
      vehicle: str(abuser.vehicle, SHORT_MAX),
      workplace: str(abuser.workplace, SHORT_MAX),
    },
    relationship_context: str(a.relationship_context, FREE_MAX),
    abuse_history: str(a.abuse_history, FREE_MAX),
    incidents: incidents,
    threats: str(a.threats, FREE_MAX),
    weapons: str(a.weapons, MED_MAX),
    prior_actions: str(a.prior_actions, FREE_MAX),
    witnesses: witnesses,
    safety_concerns: str(a.safety_concerns, FREE_MAX),
    sworn_statement: str(a.sworn_statement, FREE_MAX),
  };
}

// ─── PDF rendering ───────────────────────────────────────────────────────

var INK = '#111';
var MUTED = '#666';
var LINE = '#ccc';
var ACCENT = '#8a4b5e';
var CONTENT_W = 468; // LETTER minus 54pt margins

function renderAffidavitPdf(opts) {
  var affidavit = opts.affidavit || {};
  var exhibits = Array.isArray(opts.exhibits) ? opts.exhibits : [];
  var generatedAt = opts.generatedAt || new Date();
  var folderTitle = opts.folderTitle || '';

  return new Promise(function (resolve, reject) {
    try {
      var doc = new PDFDocument({
        size: 'LETTER',
        margin: 54,
        info: {
          Title: 'Evidentiary Abuse Affidavit',
          Producer: 'SafeTea',
          Creator: 'SafeTea Safety Vault',
        },
      });
      var chunks = [];
      doc.on('data', function (c) { chunks.push(c); });
      doc.on('end', function () { resolve(Buffer.concat(chunks)); });
      doc.on('error', reject);

      var left = doc.page.margins.left;
      var counter = { n: 0 };

      function ensureSpace(need) {
        if (doc.y + (need || 60) > doc.page.height - doc.page.margins.bottom - 24) doc.addPage();
      }
      function para(text) {
        if (!text) return;
        ensureSpace(40);
        doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(text, left, doc.y, { width: CONTENT_W, lineGap: 2 });
        doc.moveDown(0.5);
      }
      function section(title, bodyFn) {
        counter.n += 1;
        ensureSpace(60);
        doc.moveDown(0.4);
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(counter.n + '.  ' + title, left, doc.y, { width: CONTENT_W });
        doc.moveDown(0.2);
        doc.font('Helvetica');
        bodyFn();
      }
      function kv(label, value) {
        if (!value) return;
        ensureSpace(24);
        doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(10).text(label + ': ', { continued: true });
        doc.fillColor(INK).font('Helvetica').fontSize(10).text(value, { width: CONTENT_W });
      }
      function rule() {
        doc.moveDown(0.3);
        doc.strokeColor(LINE).lineWidth(0.5).moveTo(left, doc.y).lineTo(left + CONTENT_W, doc.y).stroke();
        doc.moveDown(0.4);
      }

      // ─── Header ───
      doc.fillColor('#E8A0B5').font('Helvetica-Bold').fontSize(13).text('SafeTea Safety Vault');
      doc.moveDown(0.4);
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(19).text('EVIDENTIARY ABUSE AFFIDAVIT', { align: 'center' });
      doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text(
        'A sworn statement for documentation and potential evidentiary use', { align: 'center' });
      doc.moveDown(0.8);

      doc.fillColor(INK).font('Helvetica').fontSize(10.5);
      doc.text('STATE OF ____________________________', left, doc.y);
      doc.text('COUNTY OF __________________________', left, doc.y);
      doc.moveDown(0.6);

      var affiantName = (affidavit.affiant && affidavit.affiant.full_name) || '____________________________';
      doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(
        'I, ' + affiantName + ', being first duly sworn upon oath, depose and state the following of my own personal knowledge:',
        left, doc.y, { width: CONTENT_W, lineGap: 2 });
      doc.moveDown(0.6);

      // ─── Sections ───
      section('Affiant', function () {
        kv('Full name', affidavit.affiant.full_name);
        kv('Date of birth', affidavit.affiant.dob);
        kv('Contact', affidavit.affiant.contact);
      });

      section('Person this affidavit concerns', function () {
        var ab = affidavit.abuser || {};
        kv('Full name', ab.full_name);
        kv('Also known as', ab.aliases);
        kv('Relationship to me', ab.relationship);
        kv('Date of birth', ab.dob);
        kv('Home / last known address', ab.address);
        kv('Workplace', ab.workplace);
        kv('Vehicle', ab.vehicle);
        if (ab.description) { doc.moveDown(0.2); para(ab.description); }
      });

      if (affidavit.relationship_context) {
        section('Relationship and background', function () { para(affidavit.relationship_context); });
      }
      if (affidavit.abuse_history) {
        section('History of abuse', function () { para(affidavit.abuse_history); });
      }

      if (affidavit.incidents && affidavit.incidents.length) {
        section('Specific incidents', function () {
          affidavit.incidents.forEach(function (inc, idx) {
            ensureSpace(50);
            doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(10).text(
              'Incident ' + (idx + 1) + (inc.date ? ' — ' + inc.date : ''), left, doc.y, { width: CONTENT_W });
            doc.font('Helvetica').fillColor(INK);
            kv('Location', inc.location);
            if (inc.description) para(inc.description);
            kv('Injuries', inc.injuries);
            kv('Police report', inc.police_report);
            kv('Medical treatment', inc.medical);
            if (idx < affidavit.incidents.length - 1) rule();
          });
        });
      }

      if (affidavit.threats) {
        section('Threats made', function () { para(affidavit.threats); });
      }
      if (affidavit.weapons) {
        section('Access to weapons', function () { para(affidavit.weapons); });
      }
      if (affidavit.prior_actions) {
        section('Prior reports, protective orders, police and medical contacts', function () { para(affidavit.prior_actions); });
      }

      if (affidavit.witnesses && affidavit.witnesses.length) {
        section('Witnesses', function () {
          affidavit.witnesses.forEach(function (w) {
            var lineParts = [w.name, w.relationship, w.contact].filter(Boolean);
            ensureSpace(20);
            doc.fillColor(INK).font('Helvetica').fontSize(10).text('• ' + lineParts.join(' — '), left, doc.y, { width: CONTENT_W });
          });
        });
      }

      if (affidavit.safety_concerns) {
        section('My safety concerns', function () { para(affidavit.safety_concerns); });
      }
      if (affidavit.sworn_statement) {
        section('Statement in my own words', function () { para(affidavit.sworn_statement); });
      }

      section('Exhibits', function () {
        if (!exhibits.length) {
          doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(10).text(
            'No files were attached to this record at the time of generation.', left, doc.y, { width: CONTENT_W });
          return;
        }
        doc.fillColor(INK).font('Helvetica').fontSize(10).text(
          'The following files are stored with this record in the SafeTea Safety Vault and are incorporated by reference:',
          left, doc.y, { width: CONTENT_W, lineGap: 2 });
        doc.moveDown(0.3);
        exhibits.forEach(function (ex, idx) {
          ensureSpace(18);
          var label = 'Exhibit ' + exhibitLabel(idx) + ' — ' + (ex.name || 'file');
          if (ex.type) label += '  (' + ex.type + ')';
          doc.fillColor(INK).font('Helvetica').fontSize(10).text(label, left, doc.y, { width: CONTENT_W });
        });
      });

      // ─── Affiant signature ───
      doc.moveDown(1.2);
      ensureSpace(120);
      doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(
        'I declare under penalty of perjury that the foregoing is true and correct to the best of my knowledge.',
        left, doc.y, { width: CONTENT_W, lineGap: 2 });
      doc.moveDown(1.2);
      sigLine(doc, left, 'Signature of Affiant');
      doc.moveDown(0.6);
      doc.fillColor(INK).font('Helvetica').fontSize(10).text(
        'Printed name: ' + (affidavit.affiant.full_name || '____________________________'), left, doc.y);
      doc.text('Date: ____________________________', left, doc.y);

      // ─── Notary jurat ───
      doc.moveDown(1.4);
      ensureSpace(150);
      doc.strokeColor(LINE).lineWidth(0.5).rect(left, doc.y, CONTENT_W, 0).stroke();
      doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(10).text('NOTARY ACKNOWLEDGMENT (JURAT)', left, doc.y + 6, { width: CONTENT_W });
      doc.moveDown(0.6);
      doc.fillColor(INK).font('Helvetica').fontSize(10.5).text(
        'Subscribed and sworn to (or affirmed) before me on this ______ day of ______________, 20______, ' +
        'by ____________________________ (name of affiant), proved to me on the basis of satisfactory evidence to be the person who appeared before me.',
        left, doc.y, { width: CONTENT_W, lineGap: 2 });
      doc.moveDown(1.2);
      sigLine(doc, left, 'Signature of Notary Public');
      doc.moveDown(0.6);
      doc.fillColor(INK).font('Helvetica').fontSize(10).text('My commission expires: ____________________', left, doc.y);
      doc.text('(Affix notary seal here)', left, doc.y + 4);

      // ─── Footer disclaimer on every page ───
      var range = doc.bufferedPageRange();
      for (var i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor('#999').font('Helvetica').fontSize(7.5).text(
          'Prepared by the affiant using SafeTea on ' + generatedAt.toLocaleString() +
          '. This becomes a sworn legal document only when signed before a notary or authorized official. ' +
          'Consider review by a licensed attorney or a domestic-violence advocate.',
          left, doc.page.height - 40, { width: CONTENT_W, align: 'center' });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function sigLine(doc, left, label) {
  doc.strokeColor('#333').lineWidth(0.8).moveTo(left, doc.y + 14).lineTo(left + 250, doc.y + 14).stroke();
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(label, left, doc.y + 18);
}

function exhibitLabel(idx) {
  // A, B, ... Z, AA, AB, ...
  var s = '';
  idx = idx + 1;
  while (idx > 0) {
    var r = (idx - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

module.exports = { sanitizeAffidavit, renderAffidavitPdf, _limits: { FREE_MAX, MED_MAX, SHORT_MAX, LIST_MAX } };
