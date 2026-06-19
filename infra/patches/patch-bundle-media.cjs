#!/usr/bin/env node
/*
 * Atlas — Typebot media send-path fixes on Evolution's COMPILED bundle.
 *
 * Sending Typebot-uploaded media (image/audio) through the Meta Cloud API
 * (whatsapp.business.service.ts > sendMessageWithTyping) is broken in 2.2.3 by a
 * chain of bugs. They surface in order, so all are needed for media to actually
 * reach WhatsApp. Typebot uploads land at an EXTENSIONLESS S3 key
 * (.../blocks/<blockId>?v=...) and are sent as a Cloud API `link`.
 *
 *  1) isImage crash. `const isImage = message['mimetype']?.startsWith('image/')`.
 *     `mimeTypes.lookup(extensionless-url)` returns `false` (mimetype is `string|false`),
 *     and `false?.startsWith(...)` THROWS (`?.` only guards null/undefined). 400, nothing
 *     sent. Fix: isImage = mediaType === 'image' (always a string; more correct too).
 *
 *  2) filename on audio. Audio-by-URL flows through the `message['media']` branch, which
 *     appends `filename` to the media object when `!isImage` (so: audio/video). The Cloud
 *     API accepts `filename` ONLY on `document` → 400. Fix: gate filename on
 *     mediaType === 'document'.
 *
 *  3) error masked by a crash. `post()` returns `e.response?.data?.error` on failure, i.e.
 *     `messageSent` becomes Meta's error object (no `messages`). The guard only checked
 *     `error_data` (often absent), so it fell through to `messageSent.messages[0]` and
 *     threw "reading '0'", hiding Meta's real error. Fixes: (a) detect a failed send via
 *     `error_data || error || !messages` and return it (logged); (b) optional-chain the
 *     `messages?.[0]` reads so a stray error can never crash the success path.
 *
 * We patch the bundle (not the source): the 2.2.3 source no longer compiles against
 * today's transitive deps. Each anchor is a unique literal in this pinned digest; the
 * script asserts exactly 1 occurrence and FAILS the docker build on any mismatch, so we
 * never ship a half-applied patch.
 *
 * Full context: infra/patches/README.md
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

// Unique literal anchors in the 2.2.3 bundle (minified vars: t = message, u = isImage,
// l = messageSent). Each must occur exactly once; mismatch fails the build.
const FIXES = [
  {
    name: "isImage from mediaType (mimetype?.startsWith crashed on extensionless link URLs)",
    needle: '.mimetype?.startsWith("image/")',
    replace: '.mediaType==="image"',
  },
  {
    name: "filename only on documents (Cloud API rejects filename on audio → 400)",
    needle: 't.fileName&&!u&&{filename:',
    replace: 't.fileName&&t.mediaType==="document"&&{filename:',
  },
  {
    name: "detect failed send (post() returns the inner Meta error object; success has messages)",
    needle: 'if(l?.error_data)',
    replace: 'if(l?.error_data||l?.error||!l?.messages)',
  },
  {
    name: "guard messages[0].id (was 'reading 0' on a Meta error, masking it)",
    needle: '?.messages[0]?.id',
    replace: '?.messages?.[0]?.id',
  },
  {
    name: "guard messages[0].timestamp",
    needle: '?.messages[0]?.timestamp',
    replace: '?.messages?.[0]?.timestamp',
  },
];

for (const fx of FIXES) {
  const before = countOf(fx.needle);
  if (before !== 1) {
    throw new Error(`[media-fix] "${fx.name}": expected exactly 1 occurrence of anchor, found ${before}\n  anchor: ${fx.needle}`);
  }
  s = s.split(fx.needle).join(fx.replace);
  if (countOf(fx.needle) !== 0) {
    throw new Error(`[media-fix] "${fx.name}": anchor still present after patch: ${fx.needle}`);
  }
}

fs.writeFileSync(F, s);
console.log(`[media-fix] OK: applied ${FIXES.length} send-path fixes in ${F}`);
