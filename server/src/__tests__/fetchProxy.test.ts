import { describe, it, expect } from 'vitest';
import { isPrivateHost, extractDataPath, fetchSafe } from '../utils/fetchProxy.js';

describe('isPrivateHost', () => {
  it('rejects 127.0.0.1 (loopback)', () => {
    expect(isPrivateHost('127.0.0.1')).toBe(true);
  });

  it('rejects 192.168.1.1 (private)', () => {
    expect(isPrivateHost('192.168.1.1')).toBe(true);
  });

  it('rejects 10.0.0.1 (private)', () => {
    expect(isPrivateHost('10.0.0.1')).toBe(true);
  });

  it('rejects ::1 (IPv6 loopback)', () => {
    expect(isPrivateHost('::1')).toBe(true);
  });

  it('rejects localhost', () => {
    expect(isPrivateHost('localhost')).toBe(true);
  });

  it('rejects 172.16.0.1 (private)', () => {
    expect(isPrivateHost('172.16.0.1')).toBe(true);
  });

  it('rejects 0.0.0.0', () => {
    expect(isPrivateHost('0.0.0.0')).toBe(true);
  });

  it('rejects 169.254.x.x (link-local)', () => {
    expect(isPrivateHost('169.254.1.1')).toBe(true);
  });

  it('rejects 100.64.0.1 (CGNAT)', () => {
    expect(isPrivateHost('100.64.0.1')).toBe(true);
  });

  it('rejects IPv4-mapped IPv6 ::ffff:127.0.0.1', () => {
    expect(isPrivateHost('::ffff:127.0.0.1')).toBe(true);
  });

  it('rejects fc00:: (unique local)', () => {
    expect(isPrivateHost('fc00::1')).toBe(true);
  });

  it('rejects fd00:: (unique local)', () => {
    expect(isPrivateHost('fd00::1')).toBe(true);
  });

  it('rejects fe80:: (link-local IPv6)', () => {
    expect(isPrivateHost('fe80::1')).toBe(true);
  });

  it('allows public IP 8.8.8.8', () => {
    expect(isPrivateHost('8.8.8.8')).toBe(false);
  });

  it('allows public hostname', () => {
    expect(isPrivateHost('api.example.com')).toBe(false);
  });
});

describe('fetchSafe', () => {
  it('rejects http:// URL', async () => {
    await expect(fetchSafe('http://example.com')).rejects.toThrow('Non-HTTPS URL rejected');
  });

  it('rejects private IP 127.0.0.1', async () => {
    await expect(fetchSafe('https://127.0.0.1/test')).rejects.toThrow('Private/loopback URL rejected');
  });

  it('rejects private IP 192.168.1.1', async () => {
    await expect(fetchSafe('https://192.168.1.1/test')).rejects.toThrow('Private/loopback URL rejected');
  });

  it('rejects private IP 10.0.0.1', async () => {
    await expect(fetchSafe('https://10.0.0.1/test')).rejects.toThrow('Private/loopback URL rejected');
  });

  it('rejects ::1 (IPv6 loopback)', async () => {
    await expect(fetchSafe('https://[::1]/test')).rejects.toThrow('Private/loopback URL rejected');
  });

  it('rejects invalid URL', async () => {
    await expect(fetchSafe('not-a-url')).rejects.toThrow('Invalid URL');
  });
});

describe('extractDataPath', () => {
  it('returns parsed JSON when no dataPath', () => {
    const body = JSON.stringify({ a: 1, b: 'hello' });
    expect(extractDataPath(body)).toEqual({ a: 1, b: 'hello' });
  });

  it('extracts dotted path from valid JSON', () => {
    const body = JSON.stringify({ data: { price: 42.5 } });
    expect(extractDataPath(body, 'data.price')).toBe(42.5);
  });

  it('returns undefined for missing key in valid JSON', () => {
    const body = JSON.stringify({ data: { price: 42.5 } });
    expect(extractDataPath(body, 'data.missing')).toBeUndefined();
  });

  it('preserves actual JSON null values', () => {
    const body = JSON.stringify({ data: { status: null } });
    expect(extractDataPath(body, 'data.status')).toBeNull();
  });

  it('returns raw string for invalid JSON without dataPath', () => {
    const body = 'not json at all';
    expect(extractDataPath(body)).toBe('not json at all');
  });

  it('returns raw string for invalid JSON with dataPath', () => {
    const body = 'not json at all';
    expect(extractDataPath(body, 'some.path')).toBe('not json at all');
  });

  it('handles nested paths', () => {
    const body = JSON.stringify({ rates: { USD: 1.2, EUR: 0.9 } });
    expect(extractDataPath(body, 'rates.USD')).toBe(1.2);
  });

  it('strips $. prefix from dataPath', () => {
    const body = JSON.stringify({ data: { price: 42.5 } });
    expect(extractDataPath(body, '$.data.price')).toBe(42.5);
  });

  it('blocks __proto__ in path', () => {
    // Use raw JSON string — JSON.stringify({ __proto__: ... }) produces '{}' because
    // __proto__ in object literals modifies the prototype, not creating an own property.
    const body = '{"__proto__":{"evil":true}}';
    expect(extractDataPath(body, '__proto__.evil')).toBeUndefined();
  });

  it('blocks constructor in path', () => {
    const body = JSON.stringify({ constructor: { name: 'Foo' } });
    expect(extractDataPath(body, 'constructor.name')).toBeUndefined();
  });

  it('blocks prototype in path', () => {
    const body = JSON.stringify({ prototype: { x: 1 } });
    expect(extractDataPath(body, 'prototype.x')).toBeUndefined();
  });

  it('returns undefined when traversing non-object', () => {
    const body = JSON.stringify({ data: 'string' });
    expect(extractDataPath(body, 'data.nested')).toBeUndefined();
  });

  it('returns full parsed object when dataPath is undefined', () => {
    const body = JSON.stringify([1, 2, 3]);
    expect(extractDataPath(body, undefined)).toEqual([1, 2, 3]);
  });

  it('returns undefined for inherited prototype properties like toString', () => {
    const body = JSON.stringify({ data: 'hello' });
    expect(extractDataPath(body, 'toString')).toBeUndefined();
  });

  it('returns undefined for inherited hasOwnProperty', () => {
    const body = JSON.stringify({ data: 'hello' });
    expect(extractDataPath(body, 'hasOwnProperty')).toBeUndefined();
  });

  it('returns undefined for inherited valueOf', () => {
    const body = JSON.stringify({ data: 'hello' });
    expect(extractDataPath(body, 'valueOf')).toBeUndefined();
  });

  it('still accesses own properties normally', () => {
    const body = JSON.stringify({ toString: 'custom', data: { valueOf: 42 } });
    expect(extractDataPath(body, 'toString')).toBe('custom');
    expect(extractDataPath(body, 'data.valueOf')).toBe(42);
  });
});
