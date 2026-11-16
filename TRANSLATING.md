# Translating OpenFamily

The interface of OpenFamily exists in English, French, German, Spanish, Portuguese, Russian, Catalan and Simplified Chinese. Most of these came from the people who use it.

A translation does not have to be finished to be useful. A language can arrive with a part of its texts: the app shows the rest in English, and the next person continues.

## Where the texts are

```
client/src/i18n/locales/
  en/            the reference: every text exists here
    common.json
    calendar.json
    shopping.json
    ...          22 files, one per part of the app
  fr/  de/  es/  ...
```

Each file is a list of names and texts. You translate the text on the right, never the name on the left:

```json
{
  "addItem": "Add an item",
  "itemCount_one": "{{count}} item",
  "itemCount_other": "{{count}} items"
}
```

- What is between `{{` and `}}` is replaced by the app (a number, a name). Keep it as it is, wherever it belongs in your sentence.
- Names ending in `_one` and `_other` are the singular and the plural. Your language may need other forms (`_few`, `_many`), or a single one: use the forms your language has.

## Improving an existing language

Edit the file, and open a pull request. On GitHub this can be done entirely in the browser: open the file, click the pencil, propose the change.

## Starting a new language

1. Copy the folder `client/src/i18n/locales/en` to a folder named after the code of your language, in two letters: `it` for Italian, `nl` for Dutch.
2. Translate what you can. A text you leave in English stays in English, and you may remove a file you have not started.
3. To give the language its name in the menu, add it to `client/src/i18n/languages.ts`. Without that it appears under its code.
4. Open a pull request. It does not need to be complete.

If you have Node.js, you can see the result before sending it:

```bash
npm run install:all
cd client
npm run check:i18n     # says how far the language is, and what would break the app
npm run dev            # the app on http://localhost:5173, your language in the menu
```

`check:i18n` refuses only what would break the app: a file that is not valid JSON, a `{{name}}` that does not exist in English, a name that English does not have. A missing text is never an error for a language in progress.

Once a language is complete, we add it to `client/src/i18n/complete-languages.json`. From then on a new text cannot be added to the app without it, and the language stays complete.

Translating in the browser, without Git, is planned. Until then, if the files are an obstacle, open a [discussion](https://github.com/NexaFlowFrance/OpenFamily/discussions): we can send you the texts in the form that suits you.

## What the server writes

E-mails (invitations, password reset), notifications, appointment reminders and the page of a display link are written by the server, and their texts live in its code, not in the files above. For a new language they are in English until someone adds them:

- `server/src/lib/languages.ts` lists the languages the server writes in. Add yours, and the build points at every text that is missing.
- The texts are in `server/src/lib/mailer.ts`, `server/src/lib/displayStrings.ts`, `server/src/lib/reminderScheduler.ts` and the places that send notifications.

This part asks for a little TypeScript. If you would rather not, say so in your pull request and send the translated texts: we will put them in.

## The documentation

The README exists in English, French and Simplified Chinese (`README.md`, `README.fr.md`, `README.zh-CN.md`), the installation guide in English and French. A README in your language is welcome, on the same model.
