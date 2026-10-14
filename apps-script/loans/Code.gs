// Loans log web app. FastAPI is the only caller; see apps-script/loans/README.md.

const SHEET_NAME = "Loans";
const HEADERS = [
  "loan_id",
  "borrowed_at",
  "name",
  "email",
  "item",
  "quantity",
  "reason",
  "due_date",
  "borrow_photo",
  "status",
  "returned_at",
  "return_photo",
  "return_note",
];
const COL = Object.fromEntries(HEADERS.map((h, i) => [h, i]));
const BORROW_FIELDS = [
  "loan_id",
  "borrowed_at",
  "name",
  "email",
  "item",
  "quantity",
  "reason",
  "due_date",
  "borrow_photo",
];
const RETURN_FIELDS = ["loan_id", "email", "returned_at", "return_photo"];
const LOCK_WAIT_MS = 10000;

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return respond({ ok: false, error: "bad_request" });
  }
  if (!isObject(body)) return respond({ ok: false, error: "bad_request" });

  const secret =
    PropertiesService.getScriptProperties().getProperty("LOANS_SECRET");
  if (!secret || body.secret !== secret)
    return respond({ ok: false, error: "unauthorized" });

  if (
    body.action === "borrow" &&
    isObject(body.loan) &&
    hasFields(body.loan, BORROW_FIELDS)
  ) {
    return respond(borrow(body.loan));
  }
  if (body.action === "list" && hasFields(body, ["email"])) {
    return respond(list(body.email));
  }
  if (body.action === "return" && hasFields(body, RETURN_FIELDS)) {
    return respond(returnLoan(body));
  }
  return respond({ ok: false, error: "bad_request" });
}

function borrow(loan) {
  return withLock(() => {
    const sheet = getSheet();
    if (findRow(sheet.getDataRange().getValues(), loan.loan_id) !== -1) {
      return { ok: true, duplicate: true };
    }
    const row = HEADERS.map((h) =>
      h === "quantity" ? Number(loan.quantity) : asText(loan[h]),
    );
    row[COL.status] = "out";
    sheet.appendRow(row);
    return { ok: true, duplicate: false };
  });
}

function list(email) {
  const rows = getSheet().getDataRange().getValues().slice(1);
  const wanted = String(email).toLowerCase();
  const loans = rows
    .filter((row) => String(row[COL.email]).toLowerCase() === wanted)
    .map(toSheetLoan);
  return { ok: true, loans: loans };
}

function returnLoan(req) {
  return withLock(() => {
    const sheet = getSheet();
    const values = sheet.getDataRange().getValues();
    const index = findRow(values, req.loan_id);
    // Unknown loan and someone else's loan must look the same to the caller.
    if (
      index === -1 ||
      String(values[index][COL.email]).toLowerCase() !==
        String(req.email).toLowerCase()
    ) {
      return { ok: false, error: "not_found" };
    }
    if (values[index][COL.status] !== "out")
      return { ok: false, error: "already_returned" };
    sheet
      .getRange(index + 1, COL.status + 1, 1, 4)
      .setValues([
        [
          "returned",
          asText(req.returned_at),
          asText(req.return_photo),
          asText(req.return_note),
        ],
      ]);
    return { ok: true };
  });
}

function toSheetLoan(row) {
  return {
    loan_id: String(row[COL.loan_id]),
    borrowed_at: isoTimestamp(row[COL.borrowed_at]),
    item: fromText(row[COL.item]),
    quantity: Number(row[COL.quantity]),
    reason: fromText(row[COL.reason]),
    due_date: isoDate(row[COL.due_date]),
    borrow_photo: fromText(row[COL.borrow_photo]),
    status: row[COL.status],
    returned_at: isoTimestamp(row[COL.returned_at]),
    return_photo: fromText(row[COL.return_photo]),
    return_note: fromText(row[COL.return_note]),
  };
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    // Plain-text format so Sheets never evaluates or auto-converts what students type.
    // quantity stays numeric.
    sheet.getRange(1, 1, sheet.getMaxRows(), COL.quantity).setNumberFormat("@");
    sheet
      .getRange(
        1,
        COL.quantity + 2,
        sheet.getMaxRows(),
        HEADERS.length - COL.quantity - 1,
      )
      .setNumberFormat("@");
  }
  return sheet;
}

function findRow(values, loanId) {
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][COL.loan_id]) === String(loanId)) return i;
  }
  return -1;
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(LOCK_WAIT_MS);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Formula-injection guard: a leading apostrophe makes Sheets store the rest as literal text.
function asText(value) {
  if (value === undefined || value === null) return "";
  const s = String(value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function fromText(value) {
  if (value === "" || value === null) return null;
  const s = String(value);
  // Sheets normally hides the guard apostrophe; strip it if it was kept as content.
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

function isoTimestamp(value) {
  if (value instanceof Date)
    return Utilities.formatDate(value, "UTC", "yyyy-MM-dd'T'HH:mm:ss'Z'");
  return fromText(value);
}

function isoDate(value) {
  if (value instanceof Date)
    return Utilities.formatDate(value, "UTC", "yyyy-MM-dd");
  return fromText(value);
}

function hasFields(obj, fields) {
  return fields.every(
    (f) => obj[f] !== undefined && obj[f] !== null && obj[f] !== "",
  );
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
