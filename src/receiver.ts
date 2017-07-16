import { EventEmitter } from 'eventemitter3';

import { Commander } from './commander';

/**
 * Receiver Helper
 * 
 * Helper representing all actions that can be performed with the currently active CEC receiver.
 */
export class Receiver extends EventEmitter {
    public constructor(commander: Commander) {
        super();
    }
}
