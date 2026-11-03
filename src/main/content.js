import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateContent } from '../core/story.js';

export const root = fileURLToPath(new URL('../../', import.meta.url));
export async function loadContent() {
  const files = { story: 'chapters/chapter-01.json', characters: 'characters/characters.json', locations: 'locations/locations.json', lore: 'lore.json' };
  const entries = await Promise.all(Object.entries(files).map(async ([key, path]) => [key, JSON.parse(await readFile(new URL(`../../content/${path}`, import.meta.url), 'utf8'))]));
  const content = Object.fromEntries(entries);
  validateContent(content);
  return content;
}
