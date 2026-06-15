import { minecraft }            from './minecraft.js';
import { spaceEngineers }       from './space-engineers.js';
import { terraria }             from './terraria.js';
import { ark }                  from './ark-survival.js';
import { rust }                 from './rust.js';
import { valheim }              from './valheim.js';
import { palworld }             from './palworld.js';
import { arkSurvivalAscended }  from './ark-survival-ascended.js';
import { sevenDaysToDie }       from './7-days-to-die.js';
import { projectZomboid }       from './project-zomboid.js';
import { vRising }              from './v-rising.js';
import { enshrouded }           from './enshrouded.js';
import { sonsOfTheForest }      from './sons-of-the-forest.js';
import { satisfactory }         from './satisfactory.js';
import { conanExiles }          from './conan-exiles.js';
import { abioticFactor }        from './abiotic-factor.js';
import { soulmask }             from './soulmask.js';

export const ServerTypeRegistry = {
    'minecraft':             minecraft,
    'space-engineers':       spaceEngineers,
    'terraria':              terraria,
    'ark':                   ark,
    'rust':                  rust,
    'valheim':               valheim,
    'palworld':              palworld,
    'ark-survival-ascended': arkSurvivalAscended,
    '7-days-to-die':         sevenDaysToDie,
    'project-zomboid':       projectZomboid,
    'v-rising':              vRising,
    'enshrouded':            enshrouded,
    'sons-of-the-forest':    sonsOfTheForest,
    'satisfactory':          satisfactory,
    'conan-exiles':          conanExiles,
    'abiotic-factor':        abioticFactor,
    'soulmask':              soulmask,
};
