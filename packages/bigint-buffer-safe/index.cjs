"use strict";

const { Buffer } = require("buffer");

function toBigIntLE(input) {
  const bytes = Buffer.from(input);
  bytes.reverse();
  return toBigIntBE(bytes);
}

function toBigIntBE(input) {
  const hex = Buffer.from(input).toString("hex");
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
}

function toBufferLE(value, width) {
  const bytes = toBufferBE(value, width);
  bytes.reverse();
  return bytes;
}

function toBufferBE(value, width) {
  assertWidth(width);
  const hex = value.toString(16);
  return Buffer.from(hex.padStart(width * 2, "0").slice(0, width * 2), "hex");
}

function assertWidth(width) {
  if (!Number.isSafeInteger(width) || width < 0) {
    throw new RangeError("width must be a non-negative safe integer");
  }
}

module.exports = { toBigIntBE, toBigIntLE, toBufferBE, toBufferLE };
