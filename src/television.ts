import { EventEmitter } from 'eventemitter3';

import { Commander } from './commander';

/**
 * Television Helper
 * 
 * Helper representing all actions that can be performed with the currently active CEC tv-set.
 */
export class Television extends EventEmitter {
    public constructor(commander: Commander) {
        super();
    }
}
