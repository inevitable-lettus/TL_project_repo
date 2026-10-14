# Loans log: Google Sheet + Apps Script

Borrow and return events are written to a Google Sheet by a small Apps Script web app (`Code.gs`).
Only our backend (FastAPI) calls it; browsers never do.
This guide is for the lab staff member who sets it up. No Apps Script experience needed.

## Setup

1. **Sign in to Google as the account that should own the log.** Use the lab or staff account, not a student's: whoever deploys the script owns the Sheet and every row in it.
2. **Create the Sheet and paste the code.**
   - Create a new Google Sheet (any name).
   - Open **Extensions → Apps Script**.
   - Delete everything in the editor's `Code.gs` and paste in the contents of this folder's `Code.gs`.
   - Click **Save** (the disk icon).
3. **Add the shared secret.**
   - Make a long random value. On a Mac or Linux terminal: `openssl rand -hex 32`.
   - In the Apps Script editor open **Project Settings** (the gear icon) → **Script Properties** → **Add script property**.
   - Property: `LOANS_SECRET`. Value: the random value. Click **Save script properties**.
4. **Deploy as a web app.**
   - Click **Deploy → New deployment**. Next to "Select type", click the gear and choose **Web app**.
   - **Execute as: Me.** **Who has access: Anyone.**
   - Click **Deploy**, then **Authorize access** and allow it with the same account. Google may warn that the app is unverified: choose **Advanced → Go to (project name)**. It is your own script.
   - Copy the **Web app URL** (it ends in `/exec`).
5. **Tell the backend.** In the server's `.env` file add:
   ```
   LOANS_SCRIPT_URL=<the web app URL>
   LOANS_SCRIPT_SECRET=<the same random value as LOANS_SECRET>
   ```
   Then restart the backend.
6. **Smoke test.** From any terminal:
   ```bash
   curl -sL -X POST -H 'Content-Type: application/json' \
     -d '{"secret":"<the secret>","action":"list","email":"nobody@example.com"}' \
     "$LOANS_SCRIPT_URL"
   ```
   Expected answer: `{"ok":true,"loans":[]}`. A `Loans` tab with a header row now exists in the Sheet.
   `{"ok":false,"error":"unauthorized"}` means the two secrets don't match.

## Gotchas

- **Changing the code:** after editing, use **Deploy → Manage deployments → (pencil) Edit → Version: New version → Deploy**. The URL stays the same. **Deploy → New deployment** creates a *new* URL, and the backend keeps calling the old one until `.env` is updated.
- **Rotating the secret:** change it in both places (Script Properties and the server's `.env`), then restart the backend.
- **Don't rename the `Loans` tab, and don't reorder or insert columns.** The script reads columns by position.
- **Don't edit the `loan_id`, `email` or `status` cells by hand.** The script finds loans by them.
- Sorting and filtering rows is fine: loans are found by `loan_id`, never by row number.
- **Excel copy:** File → Download → Microsoft Excel (.xlsx).

## Why "Anyone" access is safe here

"Anyone" only means Google won't ask the caller to sign in. Every request must carry the secret in its body, and anything without it gets `unauthorized` and changes nothing. Even with the secret, the script can only read, add and update rows in its own `Loans` tab; it cannot read or touch anything else in the Google account. The browser never sees the URL or the secret: only the backend holds them. **This repository is public, so never commit the web app URL or the secret.** They belong in the server's `.env` only.
