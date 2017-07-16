export enum LogicalAddress {
    UNKNOWN = -1, // not a valid logical address
    TV = 0,
    RECORDINGDEVICE1 = 1,
    RECORDINGDEVICE2 = 2,
    TUNER1 = 3,
    PLAYBACKDEVICE1 = 4,
    AUDIOSYSTEM = 5,
    TUNER2 = 6,
    TUNER3 = 7,
    PLAYBACKDEVICE2 = 8,
    RECORDINGDEVICE3 = 9,
    TUNER4 = 10,
    PLAYBACKDEVICE3 = 11,
    RESERVED1 = 12,
    RESERVED2 = 13,
    FREEUSE = 14,
    UNREGISTERED = 15, // for source
    BROADCAST = 15 // for target
}