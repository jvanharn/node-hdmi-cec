export enum PowerStatus {
    ON = 0x00,
    STANDBY = 0x01,
    IN_TRANSITION_STANDBY_TO_ON = 0x02,
    IN_TRANSITION_ON_TO_STANDBY = 0x03,
    UNKNOWN = 0x99
}