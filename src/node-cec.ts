import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'eventemitter3';

import emitLines from './lib/emitLines';
import CEC from './lib/cectypes';
export { CEC };

import * as debuglib from 'debug';
var debug = debuglib('node-cec');
var debugRaw = debuglib('node-cec:raw');

/**
 * Node CEC.
 */
export class NodeCec extends EventEmitter {

    public ready: boolean = false;

    public stdinHandlers: (ContainsHandler | MatchHandler | FuncHandler)[] = [
        {
            contains: 'waiting for input',
            callback: line => {
                debug('ready');
                this.emit('ready', this);
            }
        },
        {
            match: /^TRAFFIC:/g,
            callback: this.processTraffic.bind(this)
        }
    ];

    public clientName: string;

    public client: ChildProcess;

    public params: string[];

    public constructor(public cecName: string | null = null) {
        super();
    }

    public start(clientName: string = 'cec-client', ...rest: string[]) {
        this.clientName = clientName;

        [...this.params] = Array.from(rest);
        if (this.cecName != null) {
            this.params.push('-o');
            this.params.push(this.cecName);
        }

        this.client = spawn(this.clientName, this.params);
        emitLines(this.client.stdout);

        this.client.on('close', this.onClose);

        return this.client.stdout.on('line', line => {
            this.emit('data', line);
            debugRaw('rx: ' + line);
            return this.processLine(line);
        });
    }

    public stop() {
        debug('stop (by parent)');
        this.emit('stop', this);
        return this.client.kill('SIGINT');
    }

    /**
     * Called when the child process exits.
     */
    private onClose() {
        debug('stop (by child)');
        return this.emit('stop', this);
    }

    public send(message: string) {
        return this.client.stdin.write(message + '\n');
    }

    public sendCommand(...command: number[]) {
        return this.send('tx ' + command.map(hex => hex.toString(16)).join(':'));
    }

    public processLine(line: string) {
        this.emit('line', line);

        var result = [];
        for (var handler of this.stdinHandlers) {

            var item: any;
            if ((handler as ContainsHandler).contains != null) {
                if (line.indexOf((handler as ContainsHandler).contains) >= 0) {
                    item = handler.callback(line);
                }
            }
            else if ((handler as MatchHandler).match != null) {
                var matches = line.match((handler as MatchHandler).match);
                if (matches != null && matches.length > 0) {
                    item = handler.callback(line);
                }

            }
            else if ((handler as FuncHandler).fn != null) {
                if ((handler as FuncHandler).fn(line)) {
                    item = handler.callback(line);
                }
            }
            result.push(item);
        }
        return result;
    }

    // -------------------------------------------------------------------------- #
    //    #TRAFFIC
    // -------------------------------------------------------------------------- #

//region cec-client Monitor-mode Traffic Processing
    /**
     * Process/parse an incomming traffic line from cec-client.
     * 
     * @param traffic The line as it came from the cec-client.
     */
    private processTraffic(traffic: string) {
        let packet: ParsedPacket = {
            tokens: [],
            source: '',
            target: '',
            opcode: 0,
            args: [],
        };

        let command = traffic.substr(traffic.indexOf(']\t') + 2); // "<< 0f:..:.."
        command = command.substr(command.indexOf(' ') + 1); // "0f:..:.."

        let tokens = command.split(':'); // 0f .. ..

        if (tokens != null) {
            packet.tokens = tokens;
        }

        if (tokens != null && tokens.length > 0) {
            packet.source = tokens[0][0];
            packet.target = tokens[0][1];
        }

        if (tokens != null && tokens.length > 1) {
            packet.opcode = parseInt(tokens[1], 16);
            packet.args = tokens.slice(2, tokens.length + 1).map(hexString => parseInt(hexString, 16));
        }

        debug('parsed packet', packet);

        return this.processPacket(packet);
    }


    private processPacket(packet: ParsedPacket): boolean {
        // no opcode?
        if (!(packet.tokens != null && packet.tokens.length > 1)) {
            this.emit('POLLING', packet);
            return false;
        }

        // emit packet
        this.emit('packet', packet);

        switch (packet.opcode) {

            // ---------------------------------------------------------------------- #
            //    #OSD
            case CEC.Opcode.SET_OSD_NAME:
                if (packet.args.length == 0) {
                    break;
                }
                let osdname = String.fromCharCode.apply(null, packet.args);
                this.emit('SET_OSD_NAME', packet, osdname);
                return true;

            // ---------------------------------------------------------------------- #
            //    #SOURCE / ADDRESS
            case CEC.Opcode.ROUTING_CHANGE: // SOURCE CHANGED
                if (packet.args.length < 4) {
                    break;
                }
                let from = (packet.args[0] << 8) | packet.args[1];
                let to = (packet.args[2] << 8) | packet.args[3];
                this.emit('ROUTING_CHANGE', packet, from, to);
                return true;

            case CEC.Opcode.ACTIVE_SOURCE:
                if (packet.args.length < 2) {
                    break;
                }
                let source = (packet.args[0] << 8) | packet.args[1];
                this.emit('ACTIVE_SOURCE', packet, source);
                return true;

            case CEC.Opcode.REPORT_PHYSICAL_ADDRESS:
                if (packet.args.length < 2) {
                    break;
                }
                source = (packet.args[0] << 8) | packet.args[1];
                this.emit('REPORT_PHYSICAL_ADDRESS', packet, source, packet.args[2]);
                return true;

            // ---------------------------------------------------------------------- #
            //    #OTHER
            default:
                let opcodes: any = CEC.Opcode;
                for (let key in opcodes) {
                    let opcode = opcodes[key];
                    if (opcode === packet.opcode) {
                        if (key != null && key.length > 0) {
                            this.emit('op.' + key, key, packet, ...Array.from(packet.args));
                        }
                        return true;
                    }
                }
        }

        // not handled
        return false;
    }
//endregion
}

export interface ContainsHandler {
    contains: string;
    callback: (line: string) => any;
}

export interface MatchHandler {
    match: RegExp;
    callback: (line: string) => any;
}

export interface FuncHandler {
    fn: (line: string) => any;
    callback: (line: string) => any;
}

export interface ParsedPacket {
    tokens: string[];
    source: string;
    target: string;
    opcode: number;
    args: number[];
}
