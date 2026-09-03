import { MOCK_VIDEOS, makeId } from './utils.js';
const VIDEO_KEY = 'videovault_videos'; const COLLECTION_KEY = 'videovault_collections';
const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage?.local;
async function read(key, fallback) { if (hasChromeStorage) return (await chrome.storage.local.get(key))[key] ?? fallback; return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
async function write(key, value) { if (hasChromeStorage) return chrome.storage.local.set({ [key]: value }); localStorage.setItem(key, JSON.stringify(value)); }
export async function getVideos() { const videos = await read(VIDEO_KEY, null); if (videos) return videos; await write(VIDEO_KEY, MOCK_VIDEOS); return MOCK_VIDEOS; }
export async function saveVideo(video) { const videos = await getVideos(); const saved = { id: makeId(), favorite: false, collections: [], ...video, savedAt: new Date().toISOString() }; await write(VIDEO_KEY, [saved, ...videos]); return saved; }
export async function updateVideo(id, updates) { const videos = await getVideos(); const updated = videos.map(video => video.id === id ? { ...video, ...updates } : video); await write(VIDEO_KEY, updated); return updated.find(video => video.id === id); }
export async function deleteVideo(id) { const videos = await getVideos(); await write(VIDEO_KEY, videos.filter(video => video.id !== id)); }
export async function toggleFavorite(id) { const videos = await getVideos(); const video = videos.find(item => item.id === id); return updateVideo(id, { favorite: !video.favorite }); }
export async function getCollections() { return read(COLLECTION_KEY, ['Java', 'Angular', 'Trading', 'Tutorials', 'Entertainment', 'Music']); }
export async function createCollection(name) { const collections = await getCollections(); if (!collections.includes(name)) await write(COLLECTION_KEY, [...collections, name]); }
export async function deleteCollection(name) { const collections = await getCollections(); await write(COLLECTION_KEY, collections.filter(collection => collection !== name)); }