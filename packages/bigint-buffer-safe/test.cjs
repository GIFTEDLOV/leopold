"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { Buffer } = require("buffer");
const { toBigIntBE, toBigIntLE, toBufferBE, toBufferLE } = require("./index.cjs");

test("preserves bigint-buffer endian conversion behavior", () => {
  const value = 0x0102030405060708n;

  assert.equal(toBigIntBE(Buffer.from("0102030405060708", "hex")), value);
  assert.equal(toBigIntLE(Buffer.from("0807060504030201", "hex")), value);
  assert.equal(toBufferBE(value, 8).toString("hex"), "0102030405060708");
  assert.equal(toBufferLE(value, 8).toString("hex"), "0807060504030201");
});

test("converts the advisory-scale input without a native buffer write", () => {
  const input = Buffer.alloc(512, 0xff);
  const value = toBigIntLE(input);

  assert.equal(value, (1n << 4096n) - 1n);
  assert.deepEqual(toBufferLE(value, 512), input);
});

test("handles empty inputs and rejects invalid widths", () => {
  assert.equal(toBigIntBE(Buffer.alloc(0)), 0n);
  assert.equal(toBigIntLE(Buffer.alloc(0)), 0n);
  assert.equal(toBufferBE(0n, 0).length, 0);
  assert.throws(() => toBufferLE(1n, -1), RangeError);
});
