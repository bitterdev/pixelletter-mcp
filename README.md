<!-- Author: Fabian Bitter (fabian@bitter.de) -->

# pixelletter-mcp

Local MCP server (stdio) for the [PixelLetter](https://www.pixelletter.de/) HTTPS interface. Hand it a PDF and a destination country and PixelLetter prints, folds, franks and posts the letter, optionally as registered mail. It also sends faxes, cancels orders, reads the account balance and drives the electronic invoice signature.

It pairs with [pdf-letter-mcp](https://github.com/bitterdev/pdf-letter-mcp): that server writes a DIN 5008 letter PDF, this one puts it in the post. `send_letter` takes the absolute path that `create_letter` returns.

The implementation follows the published documentation: the HTTPS handbook, the e-mail handbook, the two signature handbooks, the reference PHP class (version 2.01) and the public error code list. Three values are not printed in those documents, colour printing, GoGreen postage and the NODUPLEX switch, and they are taken from the [hudora/pyPostal](https://github.com/hudora/pyPostal) client that has been sending real orders with them. They are marked as such in the table below. Nothing else is invented.

## How the interface works

Everything is one multipart HTTPS POST to `https://www.pixelletter.de/xml/index.php`. The form field `xml` carries the order document, credentials included, and the fields `uploadfile0`, `uploadfile1` and so on carry the documents. The answer is a small XML document: code `100` means the order was accepted, anything else is an error code from the published list. The final result, including whether the recipient address fitted the address window, arrives by e-mail a few hours later.

## Test mode

Every sending tool needs an explicit `testMode` flag, there is no default. `testMode: true` runs the order exactly like a real one but PixelLetter never prints it, never sends it and never charges for it. `testMode: false` really posts the letter. Set `PIXELLETTER_FORCE_TEST_MODE=true` to pin the whole server to test mode while wiring things up.

## Install

```bash
npm install
npm run build
```

Register the server in Claude Code:

```bash
claude mcp add pixelletter \
  --env PIXELLETTER_EMAIL=you@example.com \
  --env PIXELLETTER_PASSWORD=your-password \
  -- node "/absolute/path/to/pixelletter-mcp/dist/src/index.js"
```

Or in `~/.claude.json` / `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pixelletter": {
      "command": "node",
      "args": ["/absolute/path/to/pixelletter-mcp/dist/src/index.js"],
      "env": {
        "PIXELLETTER_EMAIL": "you@example.com",
        "PIXELLETTER_PASSWORD": "your-password",
        "PIXELLETTER_DEFAULT_DESTINATION": "DE"
      }
    }
  }
}
```

## Environment

| Variable | Purpose |
| --- | --- |
| `PIXELLETTER_EMAIL` | Required. The e-mail address the PixelLetter account is registered with. |
| `PIXELLETTER_PASSWORD` | Required. The PixelLetter password. |
| `PIXELLETTER_ENDPOINT` | Endpoint of the interface. Default `https://www.pixelletter.de/xml/index.php`. |
| `PIXELLETTER_ACCEPT_TERMS` | Accept the PixelLetter terms with every order, default `true`. The API rejects orders otherwise (error 013). |
| `PIXELLETTER_WAIVE_WITHDRAWAL_RIGHT` | Waive the two week right of withdrawal so orders run immediately, default `true`. `false` delays every order by two weeks. |
| `PIXELLETTER_DEFAULT_LOCATION` | Default dispatch centre: `1` Munich (DE), `2` Hausleiten near Vienna (AT), `3` Hamburg (DE). |
| `PIXELLETTER_DEFAULT_DESTINATION` | Default destination country as a two letter ISO code, for example `DE`. |
| `PIXELLETTER_FORCE_TEST_MODE` | Force test mode for every order, default `false`. |
| `PIXELLETTER_TIMEOUT_MS` | Request timeout in milliseconds, default `120000`. |

Credentials are only read from the environment, nothing is stored in the repository and nothing is written to disk.

## Tools

| Tool | Purpose |
| --- | --- |
| `send_letter` | Sends documents or plain text as a physical letter, optionally as a fax too. |
| `send_fax` | Sends documents or plain text as a fax only. |
| `get_account_info` | Reads the stored customer data and the current credit. |
| `cancel_order` | Cancels a submitted order by its PixelLetter order id. |
| `sign_invoice` | Sends documents to the electronic invoice signature service and optionally mails the signed PDF on. |
| `get_interface_reference` | Offline lookup of action values, dispatch centres, service codes, limits and error codes. |

### send_letter

Ready made PDF, the normal case:

```json
{
  "testMode": true,
  "files": ["/Users/you/Documents/Briefe/2026-07-24-widerspruch.pdf"],
  "destination": "DE",
  "transaction": "widerspruch-4711"
}
```

Registered mail with return receipt, printed in colour on one side only:

```json
{
  "testMode": false,
  "files": ["/Users/you/Documents/Briefe/kuendigung.pdf"],
  "destination": "DE",
  "registered": true,
  "returnReceipt": true,
  "colorPrint": true,
  "duplex": false
}
```

Plain text, typeset by PixelLetter, with the signature stored in the account:

```json
{
  "testMode": true,
  "address": ["Erika Mustermann", "Musterstr. 28", "81237 Musterstadt", "Deutschland"],
  "subject": "Ihre Anfrage vom 12.07.2026",
  "text": "Hallo Frau Mustermann,\n\nvielen Dank für Ihre Anfrage.\n\nMit freundlichen Grüßen\n\n%Unterschrift%\nMax Mustermann",
  "destination": "DE"
}
```

Rules the tool enforces before anything is sent:

- One order carries either documents or text, not both. Several documents are converted and merged into one letter, in the order given.
- The destination country is mandatory for letters, a wrong code leads to wrong postage.
- The recipient address has to be visible in the address window area of the document, PixelLetter checks this before dispatch.
- Allowed upload types are `.pdf`, `.doc`, `.xls`, `.ppt`, `.rtf`, `.wpd`, `.psd`, 50 MB maximum. Error 053 shows that PixelLetter can restrict this to PDF, so PDF is the safe choice.
- Additional services, colour print and duplex are letter only, a pure fax order rejects them. Codes 28 (return receipt) and 29 (personal delivery) need 27 (registered), code 30 (drop-in registered) stands alone. Registered mail is a German product, other destinations run into error 026.

## Every option of the interface

Full coverage of the fields the interface documents. "Applies to" says which dispatch type accepts the option, invalid combinations are rejected before the request goes out.

| API field | Tool parameter | Allowed values | Applies to | Source |
| --- | --- | --- | --- | --- |
| `email` | `PIXELLETTER_EMAIL` | account e-mail | all | HTTPS handbook |
| `password` | `PIXELLETTER_PASSWORD` | account password | all | HTTPS handbook |
| `agb` | `PIXELLETTER_ACCEPT_TERMS` | `ja`, `nein` | all | HTTPS handbook |
| `widerrufsverzicht` | `PIXELLETTER_WAIVE_WITHDRAWAL_RIGHT` | `ja`, `nein`, `nein` delays the order by two weeks | all | HTTPS handbook |
| `testmodus` | `testMode`, `PIXELLETTER_FORCE_TEST_MODE` | `true`, `false` | all | HTTPS handbook |
| `order type` | picked from the input | `text`, `upload`, `cancel` | all | HTTPS handbook, reference class |
| `action` | `send_letter`, `alsoSendFax`, `send_fax`, `sign_invoice` | `1` letter, `2` fax, `3` letter and fax, `4` invoice signature | all | HTTPS handbook, signature handbooks |
| `transaction` | `transaction` | free text, returned with the response | all | HTTPS handbook |
| `fax` | `faxNumber` | international format, `+49 89 72448483` | fax | HTTPS handbook |
| `location` | `location` | `1` Munich (DE), `2` Hausleiten near Vienna (AT), `3` Hamburg (DE), default `1` | letter, fax | HTTPS handbook |
| `destination` | `destination`, `PIXELLETTER_DEFAULT_DESTINATION` | two letter ISO code, mandatory for letters, ignored for pure fax | letter | HTTPS handbook |
| `addoption` 27 | `registered` | Einschreiben, registered mail | letter | HTTPS handbook |
| `addoption` 28 | `returnReceipt` | Rückschein, return receipt, only with 27 | letter | HTTPS handbook |
| `addoption` 29 | `personalDelivery` | Eigenhändig, personal delivery, only with 27 | letter | HTTPS handbook |
| `addoption` 30 | `registeredDropIn` | Einschreiben Einwurf, drop-in registered mail, not combinable with 27, 28, 29 | letter | HTTPS handbook |
| `addoption` 31 | `cashOnDelivery` | Nachnahme, set automatically when the bank details block is given | letter | reference class 2.01 |
| `addoption` 33 | `colorPrint` | colour print instead of black and white | letter | pyPostal, error 038 |
| `addoption` 44 | `goGreen` | GoGreen, CO2 neutral postage | letter | pyPostal |
| `addoption` other | `additionalServiceCodes` | raw numbers PixelLetter agreed for your account | letter | HTTPS handbook |
| `control` | `duplex` | `true` double sided (default of PixelLetter), `false` sends `NODUPLEX` for single sided | letter | pyPostal |
| `control` raw | `control` | any token PixelLetter gave you, cannot be combined with `duplex` | letter, fax | reference class 2.01 |
| `returnaddress` | `returnAddress` | raw value, no published meaning | letter, fax | reference class 2.01 |
| `wiretransfer/recipient/name` | `cashOnDelivery.name` | 1 to 27 characters | letter | reference class, errors 030 to 037 |
| `wiretransfer/recipient/bankaccountid` | `cashOnDelivery.bankAccountId` | 6 to 10 digits | letter | reference class, error 036 |
| `wiretransfer/recipient/blz` | `cashOnDelivery.bankCode` | exactly 8 digits | letter | reference class, error 037 |
| `wiretransfer/recipient/bankname` | `cashOnDelivery.bankName` | 1 to 27 characters | letter | reference class, error 031 |
| `wiretransfer/reasonforpayment1` | `cashOnDelivery.reasonForPayment1` | up to 27 characters | letter | reference class, error 032 |
| `wiretransfer/reasonforpayment2` | `cashOnDelivery.reasonForPayment2` | up to 27 characters | letter | reference class, error 033 |
| `wiretransfer/amount` | `cashOnDelivery.amount` | `XXXX,XX`, 3,00 to 1600,00 EUR | letter | reference class, errors 034, 035 |
| `text/address` | `address` | recipient address lines, country included | letter, fax | HTTPS handbook |
| `text/subject` | `subject` | subject of the letter | letter, fax | HTTPS handbook |
| `text/message` | `text` | plain text, no HTML, `%Unterschrift%` inserts the stored signature | letter, fax | HTTPS handbook |
| `uploadfile0`, `uploadfile1`, ... | `files`, `inlineFiles` | `.pdf`, `.doc`, `.xls`, `.ppt`, `.rtf`, `.wpd`, `.psd`, 50 MB each | letter, fax, signature | HTTPS handbook |
| `order type="cancel"/id` | `cancel_order.orderId` | PixelLetter order id | cancellation | reference class 2.01 |
| `sender`, `recipient`, `cc`, `bcc`, `subject`, `body`, `filename` | `sign_invoice.notification.*` | e-mail fields of the signature notification | signature | signature handbooks |
| `info/account:info type="all"` | `get_account_info` | no parameters | account | HTTPS handbook |

`get_interface_reference` returns the same list at runtime, including the full error code table.

## What the interface does not offer

Named explicitly, because their absence is a property of the API and not an omission of this server:

- **No job list.** There is no documented call that lists or queries submitted orders. `cancel_order` works on an order id from the confirmation e-mail, `get_account_info` reports the balance, everything else lives in the PixelLetter customer area.
- **No envelope or paper format, no postage class, no delivery speed, no cover sheet, no reply envelope, no sender identification.** These are no fields of the interface. Letters go into a DIN C6/5 window envelope and the postage follows weight and destination country.
- **No address correction.** Premiumadress shows up in error 088, but it has to be set up by PixelLetter support for the account and has no request field.
- **Postcards, upload templates and bulk orders.** The reference class and the error codes show they exist (`font`, template number, action 5), but no handbook documents their action values or their field layout. Sending a guessed action could produce a real, wrong dispatch, so they are left out.
- **`ref`** in the auth block has no documented meaning and is always sent empty, exactly like the reference class does.

## Verification

```bash
npm test    # XML payloads, response parsing, option rules, configuration, HTTP layer with a mocked fetch
```

The tests never touch the live API. The HTTP layer is exercised through an injected `fetch`, which checks the endpoint, the `xml` field, the `uploadfileN` parts, the test mode flag and the error code mapping.

## License

MIT, see [LICENSE](LICENSE).
