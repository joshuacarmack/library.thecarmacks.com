#!/usr/bin/env node
// Convenience script for the one-time step of creating Joshua & Meg's shared-library accounts
// against a running instance (local `wrangler dev` or the deployed URL). Prompts for each
// password interactively rather than taking it as an argument, so it never ends up in shell
// history or process listings.
//
// Usage:
//   node scripts/seed-accounts.mjs                          # targets http://127.0.0.1:8787
//   node scripts/seed-accounts.mjs https://library.thecarmacks.com
//
// If the target has SIGNUP_CODE set, export it first: SIGNUP_CODE=xxxx node scripts/seed-accounts.mjs
//
// Piped/scripted input is also supported (answers read line-by-line from stdin, echoed
// visibly since there's no terminal to hide them from):
//   printf 'josh@example.com\nhunter22\nmeg@example.com\nhunter33\n' | node scripts/seed-accounts.mjs

import readline from "node:readline";

const baseUrl = process.argv[2] ?? "http://127.0.0.1:8787";
const signupCode = process.env.SIGNUP_CODE;

const accounts = [
  { displayName: "Joshua", defaultEmail: "joshuahcarmack@gmail.com" },
  { displayName: "Meg", defaultEmail: "" },
];

const ENTER_CHARS = new Set(["\n", "\r", "\u0004"]); // newline, carriage return, EOF
const CTRL_C = "\u0003";
const BACKSPACE_CHARS = new Set(["\x7f", "\b"]);

// Node's readline eagerly buffers *all* available lines from a piped (non-TTY) stdin the
// first time it starts reading, but `.question()` only ever captures one line per call —
// so calling it repeatedly against piped input silently drops every answer after the first.
// Work around it by slurping the whole pipe up front and serving answers from a queue.
let pipedLines = null;
async function readAllPipedLines() {
  if (pipedLines) return pipedLines;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  pipedLines = Buffer.concat(chunks).toString("utf8").split(/\r?\n/);
  return pipedLines;
}

// Masks input character-by-character by reading raw stdin bytes directly (real TTY only).
function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let input = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (char) => {
      if (ENTER_CHARS.has(char)) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (char === CTRL_C) {
        process.exit(1);
      } else if (BACKSPACE_CHARS.has(char)) {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on("data", onData);
  });
}

let ttyRl;
async function ask(question, { hidden = false } = {}) {
  if (!process.stdin.isTTY) {
    const lines = await readAllPipedLines();
    const value = (lines.shift() ?? "").trim();
    process.stdout.write(`${question}${hidden ? "*".repeat(value.length) : value}\n`);
    return value;
  }
  if (hidden) return askHidden(question);
  ttyRl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => ttyRl.question(question, (answer) => resolve(answer.trim())));
}

async function createAccount({ displayName, defaultEmail }) {
  console.log(`\n--- ${displayName}'s account ---`);
  const emailPrompt = defaultEmail ? `Email [${defaultEmail}]: ` : "Email: ";
  let email = await ask(emailPrompt);
  if (!email) email = defaultEmail;
  if (!email) {
    console.log("Skipped (no email given).");
    return;
  }
  const password = await ask("Password (min 8 characters): ", { hidden: true });
  if (!password || password.length < 8) {
    console.log("Skipped (password must be at least 8 characters).");
    return;
  }

  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName, signupCode }),
  });
  const body = await res.json();
  if (res.ok) {
    console.log(`Created account for ${displayName} <${email}>.`);
  } else {
    console.log(`Could not create account for ${displayName}: ${body.error ?? res.statusText}`);
  }
}

console.log(`Seeding accounts against ${baseUrl}`);
for (const account of accounts) {
  await createAccount(account);
}
ttyRl?.close();
