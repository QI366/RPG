import { loadContent } from '../src/main/content.js';
import { exploreStory } from '../src/core/story.js';
const content = await loadContent();
console.log(JSON.stringify(exploreStory(content), null, 2));
