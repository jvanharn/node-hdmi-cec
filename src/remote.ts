import { EventEmitter } from 'eventemitter3';

import { CecMonitor } from './cec-monitor';
import { UserControlButton } from './models/user-control-buttons';

import * as debuglib from 'debug';
var debug = debuglib('cec:remote');

const keyDownRegexp = /^DEBUG:[ \[\d\]\t]+key pressed: (\w+) \((\w+)\)/g;
const keyUpRegexp = /^DEBUG:[ \[\d\]\t]+key released: (\w+) \((\w+)\)/g;

/**
 * CEC-connected remote handler
 * 
 * This class provides an easy interface to connect to the CEC-bus, handle all incomming requests and the setup process,
 * and then provide you just with the events for the pressed buttons on the remote.
 * 
 * If you need to control other cec-connected devices (like press buttons, or command other things), you need the commander class.
 * 
 * @event keyup Event fired when a pressed key is released.
 * @event keydown Event fired when a key is pressed.
 * @event keypress Event fired when a key is pressed and then released.
 * @event keypress.* Event fired when a specific key is pressed, for a complete list, check the UserControlButtons enum.
 */
export class Remote extends EventEmitter {
    private previousKey: string = '';
    private previousKeyCode: UserControlButton = -1;
    private currentKey: string = '';
    private currentKeyCode: UserControlButton = -1;

    public constructor(public readonly monitor: CecMonitor = new CecMonitor) {
        super();

        monitor.stdinHandlers.push({
            match: keyDownRegexp,
            callback: this.keyDownDecoder.bind(this)
        });
        monitor.stdinHandlers.push({
            match: keyUpRegexp,
            callback: this.keyUpDecoder.bind(this)
        });
    }

    /**
     * Decodes cec-client messages about keys being pressed.
     * @param message 
     */
    private keyDownDecoder(message: string): void {
        var result = keyDownRegexp.exec(message);
        if (result == null) {
            debug('unable to decode keydown message ', message);
            return;
        }

        var keyName = result[1],
            keyCode = parseInt(result[2], 16);
        debug(`received keydown for "${keyName}" (${keyCode})`);
        this.emit('keydown', {
            repeat: (this.currentKey === keyName),
            key: keyName,
            keyCode: keyCode
        } as KeyEvent);

        this.previousKey = this.currentKey;
        this.previousKeyCode = this.currentKeyCode;
        this.currentKey = keyName;
        this.currentKeyCode = keyCode;
    }

    /**
     * Decodes cec-client messages about keys being released.
     * @param message 
     */
    private keyUpDecoder(message: string): void {
        var result = keyUpRegexp.exec(message);
        if (result == null) {
            debug('unable to decode keyup message ', message);
            return;
        }

        var keyName = result[1],
            keyCode = parseInt(result[2], 16);
        debug(`received keyup for "${keyName}" (${keyCode})`);
        this.emit('keyup', {
            key: keyName,
            keyCode: keyCode
        } as KeyEvent);

        if (this.currentKeyCode === keyCode) {
            debug(`emitted keypress for "${keyName}" (${keyCode})`);
            var eventObj = {
                repeat: (this.previousKeyCode === this.currentKeyCode),
                key: keyName,
                keyCode: keyCode
            } as KeyEvent;
            this.emit('keypress', eventObj);
            this.emit('keypress.' + keyName, eventObj);
            
            this.previousKey = this.currentKey;
            this.previousKeyCode = this.currentKeyCode;
            this.currentKey = '';
            this.currentKeyCode = -1;
        }
    }
}

export interface KeyEvent {
    repeat?: boolean;
    keyCode: UserControlButton;
    key: string;
}
