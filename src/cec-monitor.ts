import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'eventemitter3';

import emitLines from './lib/emit-lines';
import { OperationCode as Opcode } from './models/operation-code';
import { LogicalAddress } from './models/logical-address';

import * as debuglib from 'debug';
var debug = debuglib('cec:monitor');
var debugRaw = debuglib('cec:monitor:raw');

const logicalAddressAssignRegexp = /^DEBUG:[ \[\d\]\t]+AllocateLogicalAddresses - device '\d', type '[\w ]+', LA '(\w)'/g;

/**
 * CEC Monitor Interface
 * 
 * This class provides a way to work with (read out, and write to) the cec-client cli application.
 * It does not contain any (business)-logic, just the interfacing code. If you need a direct interface to the cec-bus, this is the class you need.
 */
export class CecMonitor extends EventEmitter {
    /**
     * Whether or not the cec-client is ready to write commands.
     */
    public ready: boolean = false;

    /**
     * The handlers that can convert input from the cec-client to events on this class.
     */
    public readonly stdinHandlers: (ContainsHandler | MatchHandler | FuncHandler)[] = [
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
        },
        {
            match: logicalAddressAssignRegexp,
            callback: this.setDeviceAddress.bind(this)
        }
    ];

    /**
     * Name/path of the cec-client process executable.
     */
    protected clientName: string;

    /**
     * Extra parameters that were used to instantiate the monitor process.
     */
    protected params: string[];

    /**
     * The cec-client process spawned by this monitor instance.
     */
    protected client: ChildProcess;

    /**
     * @param deviceName The name of this monitor instance, as used on the cec-bus.
     * @param deviceAddress The address/type/slot to use for this device on the CEC bus. If not available, will take next in same category!
     * @param monitorMode Whether or not to emit operation events for all messages decoded on the bus, or only messages being send to our device or the broadcasting address.
     */
    public constructor(
        public readonly deviceName: string = 'node-hdmi-cec',
        public readonly deviceAddress: LogicalAddress = LogicalAddress.RECORDINGDEVICE1,
        public monitorMode: boolean = false,
        autostart: boolean = true
    ) {
        super();

        if (autostart) {
            this.start();
        }
    }

    /**
     * Start the monitor, and let it start listening.
     * 
     * @param clientName 
     * @param rest 
     */
    protected start(clientName: string = 'cec-client', ...rest: string[]): void {
        this.clientName = clientName;

        [...this.params] = Array.from(rest);

        if (this.deviceName != null) {
            this.params.push('-o');
            this.params.push(this.deviceName);
        }

        if (this.deviceName != null) {
            this.params.push('-t');
            this.params.push(this.convertLogicalAddressToClientType(this.deviceAddress));
        }

        this.client = spawn(this.clientName, this.params);
        emitLines(this.client.stdout);

        this.client.on('close', this.onClose);

        this.client.stdout.on('line', line => {
            this.emit('data', line);
            debugRaw(`rx: "${line}"`);
            this.processLine(line);
        });
    }

    /**
     * Stop the monitor class from listening and kill the cec-client process.
     */
    public stop(): void {
        debug('stop (by parent)');
        this.emit('stop', this);

        if (this.client) {
            this.client.kill('SIGINT');
        }
    }

    /**
     * Called when the child process exits.
     */
    private onClose(): void {
        debug('stop (by child)');
        this.emit('stop', this);
    }

    /**
     * Send a raw message to the cec-client.
     * 
     * @param message The raw message to send.
     */
    public send(message: string): boolean {
        return this.client.stdin.write(message + '\n');
    }

    /**
     * Send a cec-command by its numbers.
     * 
     * When using this version, you need to include the target and source yourself!
     * Check http://www.cec-o-matic.com/ to find messages to send.
     * 
     * @param command List of the numeric representations of the commands to send.
     */
    public sendCommand(...command: number[]): boolean {
        return this.send('tx ' + command.map(hex => hex.toString(16)).join(':'));
    }

    /**
     * Send a cec-command by its numbers and set the target.
     * 
     * @param target The target's cec-address.
     * @param opcode The operation to execute.
     * @param params List of the numeric representations of the parameters to send.
     */
    public executeOperation(target: LogicalAddress, opcode: Opcode, params?: number[]): boolean {
        var base = `tx ${this.deviceAddress.toString(16)}${target.toString(16)}:${opcode.toString(16)}`;
        if (params && params.length > 0) {
            return this.send(base + ':' + params.map(hex => hex.toString(16)).join(':'));
        }
        return this.send(base);
    }

    /**
     * Send a cec-command by its type and set the target.
     * 
     * @param target The target's cec-address.
     * @param opcode The operation to execute.
     * @param param Boolean parameter to send.
     */
    public executeOperationWithBoolean(target: LogicalAddress, opcode: Opcode, param: boolean): boolean {
        return this.executeOperation(target, opcode, [param ? 0x01 : 0x00]);
    }

    /**
     * Send a cec-command by its type and set the target.
     * 
     * @param target The target's cec-address.
     * @param opcode The operation to execute.
     * @param param Integer parameter to send.
     */
    public executeOperationWithInteger(target: LogicalAddress, opcode: Opcode, param: number): boolean {
        var bytes = [];
        var i = 3;
        do {
            bytes[--i] = param & (255);
            param = param >> 8;
        } while (i);
        return this.executeOperation(target, opcode, bytes);
    }

    /**
     * Send a cec-command by its type and set the target.
     * 
     * @param target The target's cec-address.
     * @param opcode The operation to execute.
     * @param param Integer parameter to send.
     */
    public executeOperationWithString(target: LogicalAddress, opcode: Opcode, param: string): boolean {
        return this.executeOperation(target, opcode, param.split('').map(x => x.charCodeAt(0)));
    }

    /**
     * Send a cec-command by its numbers and set the target.
     * 
     * @param command List of the numeric representations of the commands to send.
     */
    public executeBroadcastOperation(opcode: Opcode, params?: number[]): boolean {
        return this.executeOperation(LogicalAddress.BROADCAST, opcode, params);
    }

    /**
     * Processes a log line to set our own device address.
     * 
     * @param line The address to change to as extracted from the logs.
     */
    public setDeviceAddress(line: string): void {
        var result = logicalAddressAssignRegexp.exec(line);
        if (result == null) {
            return;
        }
        
        (this as any)['deviceAddress'] = parseInt(result[0], 16);
        debug(`device address set to ${this.deviceAddress.toString(16)}`);
    }

    /**
     * Process an incomming line.
     * 
     * @param line The line that was emitted by the cec-client.
     */
    protected processLine(line: string): number {
        this.emit('line', line);

        var executed = 0;
        for (var handler of this.stdinHandlers) {
            if ((handler as ContainsHandler).contains != null) {
                if (line.indexOf((handler as ContainsHandler).contains) >= 0) {
                    handler.callback(line);
                    executed++;
                }
            }
            if ((handler as MatchHandler).match != null) {
                var matches = line.match((handler as MatchHandler).match);
                if (matches != null && matches.length > 0) {
                    handler.callback(line);
                    executed++;
                }
            }
            if ((handler as FuncHandler).fn != null) {
                if ((handler as FuncHandler).fn(line)) {
                    handler.callback(line);
                    executed++;
                }
            }
        }

        if (executed > 0) {
            debugRaw(`executed ${executed} handlers`);
        }

        return executed;
    }

//region cec-client Monitor-mode Traffic Processing
    /**
     * Process/parse an incomming traffic line from cec-client.
     * 
     * @param traffic The line as it came from the cec-client.
     */
    private processTraffic(traffic: string) {
        let packet: ParsedPacket = {
            tokens: [],
            source: 0,
            target: 0,
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
            packet.source = parseInt(tokens[0][0], 16);
            packet.target = parseInt(tokens[0][1], 16);
        }

        if (tokens != null && tokens.length > 1) {
            packet.opcode = parseInt(tokens[1], 16);
            packet.args = tokens.slice(2, tokens.length + 1).map(hexString => parseInt(hexString, 16));
        }

        debug('parsed packet', packet);

        return this.processPacket(packet);
    }

    /**
     * Converts a parsed packet to events on this emitter.
     * 
     * @param packet Parsed packet to be emitted as event.
     */
    private processPacket(packet: ParsedPacket): boolean {
        // no opcode?
        if (!(packet.tokens != null && packet.tokens.length > 1)) {
            this.emit('polling', packet);
            return false;
        }

        // check if we are in monitoring mode
        if (!this.monitorMode && packet.target !== this.deviceAddress && packet.target !== LogicalAddress.BROADCAST) {
            return false;
        }

        // emit packet
        this.emit('packet', packet);

        switch (packet.opcode) {

            // ---------------------------------------------------------------------- #
            //    #OSD
            case Opcode.SET_OSD_NAME:
                if (packet.args.length == 0) {
                    break;
                }
                let osdname = String.fromCharCode.apply(null, packet.args);
                this.emit('SET_OSD_NAME', packet, osdname);
                return true;

            // ---------------------------------------------------------------------- #
            //    #SOURCE / ADDRESS
            case Opcode.ROUTING_CHANGE: // SOURCE CHANGED
                if (packet.args.length < 4) {
                    break;
                }
                let from = (packet.args[0] << 8) | packet.args[1];
                let to = (packet.args[2] << 8) | packet.args[3];
                this.emit('ROUTING_CHANGE', packet, from, to);
                return true;

            case Opcode.ACTIVE_SOURCE:
                if (packet.args.length < 2) {
                    break;
                }
                let source = (packet.args[0] << 8) | packet.args[1];
                this.emit('ACTIVE_SOURCE', packet, source);
                return true;

            case Opcode.REPORT_PHYSICAL_ADDRESS:
                if (packet.args.length < 2) {
                    break;
                }
                source = (packet.args[0] << 8) | packet.args[1];
                this.emit('REPORT_PHYSICAL_ADDRESS', packet, source, packet.args[2]);
                return true;

            // ---------------------------------------------------------------------- #
            //    #OTHER
            default:
                let opcodes: any = Opcode;
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

    /**
     * Convert a logical address to an type argument usable with cec-client.
     * @param address Address to convert
     */
    private convertLogicalAddressToClientType(address: LogicalAddress): string {
        switch(address) {
            case LogicalAddress.AUDIOSYSTEM:
                return 'a';
            case LogicalAddress.PLAYBACKDEVICE1:
            case LogicalAddress.PLAYBACKDEVICE2:
            case LogicalAddress.PLAYBACKDEVICE3:
                return 'p';
            case LogicalAddress.TUNER1:
            case LogicalAddress.TUNER2:
            case LogicalAddress.TUNER3:
            case LogicalAddress.TUNER4:
                return 't';
            default:
                return 'r';
        }
    }
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
    source: number;
    target: number;
    opcode: number;
    args: number[];
}

const DeviceAddressMap: { [addr: number]: string } = { };
DeviceAddressMap[LogicalAddress.RECORDINGDEVICE1] = 'r';
