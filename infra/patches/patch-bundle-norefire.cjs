#!/usr/bin/env node
/*
 * Atlas — Typebot "no-refire" patch applied to Evolution's COMPILED bundle.
 *
 * Evolution 2.2.3, when the Typebot viewer returns an empty turn (messages: []),
 * re-fires a second continueChat with the user's text and relays the result. That
 * turns an intentionally-silent Typebot branch into the SIBLING branch's content.
 * (Full analysis: infra/patches/README.md.)
 *
 * We patch the bundle (not the source): the 2.2.3 source no longer compiles against
 * today's transitive deps. There are exactly two re-fire blocks — the expired-session
 * and no-session branches of processTypebot. We replace each block BODY with `return`,
 * which removes the two re-fire continueChat calls while leaving the legit
 * opened-session continueChat (the 3rd) untouched.
 *
 * Self-verifying: any mismatch in the expected anchors/counts throws and FAILS the
 * docker build, so we never ship a half-applied or wrongly-applied patch.
 */
"use strict";
const fs = require("fs");

const F = process.env.EVOLUTION_BUNDLE || "/evolution/dist/main.js";
let s = fs.readFileSync(F, "utf8");

const countOf = (needle) => {
  let i = -1, c = 0;
  while ((i = s.indexOf(needle, i + 1)) >= 0) c++;
  return c;
};

// ── Pre-conditions (this exact pinned 2.2.3 digest) ────────────────────────────
const ccBefore = countOf("continueChat");
if (ccBefore !== 3) throw new Error(`[norefire] expected 3 continueChat before patch, found ${ccBefore}`);
const guards = countOf("messages.length===0");
if (guards !== 2) throw new Error(`[norefire] expected 2 empty-turn guards, found ${guards}`);

// Anchors: each ends at the "{" that opens a re-fire block. Must be unique.
//   #1 expired-session branch:  ...x.messages.length===0){let L=ye(t.message);...
//   #2 no-session branch:       ...b.messages.length===0){if(!h){...
const anchors = ["x.messages.length===0){", "b.messages.length===0){"];

function matchingBrace(str, openIdx) {
  // openIdx points at "{". Returns index of the matching "}". All inner braces
  // (object literals, `${...}` template holes) are balanced, so plain counting is
  // safe for these blocks; a runaway match is caught by the size guard below.
  let depth = 0;
  for (let i = openIdx; i < str.length; i++) {
    const ch = str[i];
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  throw new Error(`[norefire] unbalanced braces from index ${openIdx}`);
}

for (const a of anchors) {
  const first = s.indexOf(a);
  if (first < 0) throw new Error(`[norefire] anchor not found: ${a}`);
  if (s.indexOf(a, first + 1) >= 0) throw new Error(`[norefire] anchor not unique: ${a}`);
  const open = first + a.length - 1;        // index of "{"
  const close = matchingBrace(s, open);     // index of matching "}"
  const len = close - open + 1;
  if (len > 1500) throw new Error(`[norefire] block too large (${len} chars) for ${a} — refusing`);
  s = s.slice(0, open) + "{return}" + s.slice(close + 1);
}

// ── Post-conditions ────────────────────────────────────────────────────────────
const ccAfter = countOf("continueChat");
if (ccAfter !== 1) throw new Error(`[norefire] expected 1 continueChat after patch, found ${ccAfter}`);

fs.writeFileSync(F, s);
console.log(`[norefire] OK: continueChat ${ccBefore} -> ${ccAfter}; 2 re-fire blocks neutralized in ${F}`);
