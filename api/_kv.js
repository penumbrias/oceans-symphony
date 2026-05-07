// Shared utilities for Friends API endpoints
import { kv } from '@vercel/kv';
import { randomBytes } from 'node:crypto';

export { kv };

export function generateId(bytes = 16) {
  return randomBytes(bytes).toString('hex');
}

export function generateFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars[raw[i] % chars.length];
  }
  return code;
}

// Returns the profile object or null
export async function getProfile(userId) {
  return kv.get(`user:${userId}`);
}

// Validates that (userId, secret) is a real registered user
export async function validateUser(userId, secret) {
  if (!userId || !secret) return false;
  const profile = await getProfile(userId);
  return !!(profile && profile.secret === secret);
}

// Read/write the friends map for a user: { [friendUserId]: { status, addedAt, ... } }
export async function getFriends(userId) {
  return (await kv.get(`user:${userId}:friends`)) || {};
}

export async function setFriends(userId, friends) {
  return kv.set(`user:${userId}:friends`, friends);
}

// Read/write pending incoming requests array
export async function getPending(userId) {
  return (await kv.get(`user:${userId}:pending`)) || [];
}

export async function setPending(userId, pending) {
  return kv.set(`user:${userId}:pending`, pending);
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
