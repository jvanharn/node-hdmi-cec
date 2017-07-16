import { EventEmitter } from 'eventemitter3';

import { CecMonitor, ParsedPacket } from './cec-monitor';
import { LogicalAddress } from './models/logical-address';
import { OperationCode } from './models/operation-code';
import { UserControlButton } from './models/user-control-buttons';
import { PowerStatus } from './models/power-status';

import * as debuglib from 'debug';
var debug = debuglib('cec:commander');

/**
 * CEC device commander
 * 
 * This class provides you with an interface to execute common actions on other CEC-connected devices on the cec bus.
 * This class also provides events signaling other devices turning everything else off, the tv going off, etc.
 * These actions include turning up or down the volume, changing the source on a tv, etc.
 * 
 * Most of the message frames are sourced from: http://www.cec-o-matic.com/
 */
export class Commander extends EventEmitter {
    public constructor(public readonly monitor: CecMonitor) {
        super();
    }

    /**
     * Turn off all devices on the cec-bus.
     */
    public broadcastStandby(): boolean {
        return this.monitor.executeOperation(LogicalAddress.BROADCAST, OperationCode.STANDBY);
    }

    /**
     * Set the power state for the given device.
     * 
     * @param state The state to set the device to.
     * @param target The target of the call, defaults to the tv.
     */
    public setPowerState(state: PowerStatus, target: LogicalAddress = LogicalAddress.TV): boolean {
        if (state === PowerStatus.STANDBY) {
            return this.monitor.executeOperation(target, OperationCode.STANDBY);
        }
        else if (state === PowerStatus.ON) {
            return this.monitor.executeOperation(target, OperationCode.IMAGE_VIEW_ON);
        }
        else {
            return false;
        }
    }

    /**
     * Get the current powerstate of the given target device.
     * 
     * @param target Target cec-device to request the power status for.
     */
    public getPowerState(target: LogicalAddress = LogicalAddress.TV): Promise<PowerStatus> {
        if (this.monitor.executeOperation(target, OperationCode.GIVE_DEVICE_POWER_STATUS)) {
            return this.waitForOperationResponse(OperationCode.REPORT_POWER_STATUS, packet => packet.args[0] as PowerStatus);
        }
        return Promise.reject(new Error('Unable to request the power status.'));
    }

    /**
     * Press the given button on this virtual remote.
     * 
     * @param button The button being pressed (and released).
     * @param target The target of the button press (receiver or TV realistically, but can be any logical address).
     */
    public pressButton(button: UserControlButton, target: LogicalAddress = LogicalAddress.TV): boolean {
        if (this.monitor.executeOperation(target, OperationCode.USER_CONTROL_PRESSED, [button])) {
            if (this.monitor.executeOperation(target, OperationCode.USER_CONTROL_RELEASE)) {
                return true;
            }

            debug('Unable to send the user control key-release operation.');
            return false;
        }

        debug('Unable to send the user control key-down operation.');
        return false;
    }

    /**
     * Helper method that handles timing out of promises.
     * 
     * @param waitForOpcode The opcode to wait for as a response to a call you have already done (Or are about to do).
     * @param resolverMethod Resolver.
     */
    private waitForOperationResponse<T>(waitForOpcode: OperationCode, resolverMethod: (packet: ParsedPacket) => T): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            var isResolved = false,
                resolverFunction = (key: string, packet: ParsedPacket) => {
                    isResolved = true;
                    resolve(resolverMethod(packet));
                };
            this.monitor.once(`op.${OperationCode[waitForOpcode]}`, resolverFunction);
            setTimeout(() => {
                this.monitor.off(`op.${OperationCode[waitForOpcode]}`, resolverFunction);
                reject(new Error('Target cec-device took too long to respond to the request.'));
            }, 5000);
        });
    }
}
