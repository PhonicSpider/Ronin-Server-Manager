import { sevenDaysToDie }       from './7-days-to-die.js';
import { abioticFactor }        from './abiotic-factor.js';
import { arkSurvivalAscended }  from './ark-survival-ascended.js';
import { ark }                  from './ark-survival.js';
import { conanExiles }          from './conan-exiles.js';
import { enshrouded }           from './enshrouded.js';
import { minecraft }            from './minecraft.js';
import { palworld }             from './palworld.js';
import { projectZomboid }       from './project-zomboid.js';
import { rust }                 from './rust.js';
import { satisfactory }         from './satisfactory.js';
import { sonsOfTheForest }      from './sons-of-the-forest.js';
import { soulmask }             from './soulmask.js';
import { spaceEngineers }       from './space-engineers.js';
import { terraria }             from './terraria.js';
import { vRising }              from './v-rising.js';
import { valheim }              from './valheim.js';

// Registry order is alphabetical by meta.displayName -- both the Add Server
// type-picker grid (renderTypeCards in renderer.js) and the wizard's game
// list (forge:get-games in main.js) just iterate this object's key order
// with no separate sort, so ordering it here drives both UIs at once.
export const ServerTypeRegistry = {
    '7-days-to-die':         sevenDaysToDie,        // "7 Days to Die"
    'abiotic-factor':        abioticFactor,         // "Abiotic Factor"
    'ark-survival-ascended': arkSurvivalAscended,   // "ARK: Survival Ascended"
    'ark':                   ark,                   // "ARK: Survival Evolved"
    'conan-exiles':          conanExiles,           // "Conan Exiles"
    'enshrouded':            enshrouded,            // "Enshrouded"
    'minecraft':             minecraft,             // "Minecraft"
    'palworld':              palworld,              // "Palworld"
    'project-zomboid':       projectZomboid,        // "Project Zomboid"
    'rust':                  rust,                  // "Rust"
    'satisfactory':          satisfactory,          // "Satisfactory"
    'sons-of-the-forest':    sonsOfTheForest,       // "Sons of the Forest"
    'soulmask':              soulmask,              // "Soulmask"
    'space-engineers':       spaceEngineers,        // "Space Engineers"
    'terraria':              terraria,              // "Terraria"
    'v-rising':              vRising,               // "V Rising"
    'valheim':               valheim,               // "Valheim"
};
