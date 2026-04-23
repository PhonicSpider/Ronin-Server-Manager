// 1. Import the individual game data files
import { minecraft } from './minecraft.js';
import { spaceEngineers } from './space-engineers.js';
import { terraria } from './terraria.js';
import { ark } from './ark.js';

// 2. Export them as a single "Registry" object
export const ServerTypeRegistry = {
    'minecraft': minecraft,
    'space-engineers': spaceEngineers,
    'terraria': terraria,
    'ark': ark,
    // When you add a new game, just add a new line here!
};