# Policy review checklist

`public/legal.html` was written for a version of Livyato that stored nothing on a server and used an AI service. This version has accounts, a database, file storage and payments, so the text was updated. It is not legal advice. Have a lawyer review all of it.

## What was changed
- Removed every mention of an AI provider. The assistant now uses fixed rules and does not send questions anywhere.
- "Where your data goes": statements are uploaded only if the user signs in and chooses to save them.
- Section 3 (information involved): added accounts, saved statements and payment details.
- Section 5 (lawful basis): added running accounts, saving statements and payments.
- Section 9: now about transfers outside South Africa by hosting, database, storage and payment providers.
- Section 10 (third parties): now lists Netlify, Supabase and Paystack.
- Section 12 (retention): saved statements are kept until deleted or the account is closed. Payment records are kept as the law requires.
- Cookie page and "information held by others": hosting is now Netlify, and payment records sit with the payment provider.

## What you must confirm or still change
- Every statement that says "we do not hold copies", "in your browser" or "not uploaded" and has not been updated above. Search the file for `browser`.
- The Data Deletion and Data Access sections: describe how a user deletes their account (the "Delete my account" button, which calls `api/account.js`) and how they ask for a copy of their data.
- Section 9: choose provider regions near South Africa where offered, and check the claim in the policy matches what you actually set up.
- Section 10: if you change provider (for example a different host or payment company), update the table.
- Add your company name, registration number, contact details and Information Officer if they are not already filled in.
- Security section: only claim measures you really have. This code provides HTTPS (Netlify), private file storage, row-level security and an append-only audit log. Confirm Supabase backups and email settings.
- Refund and cancellation terms: match them to how you set up the Paystack plan.
- If you add any analytics, AI service or other provider later, update the policy first.
