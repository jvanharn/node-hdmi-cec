# cec-client based Typescript API
Makes it possible for you to monitor incomming cec messages and send them, using a consistent promise-based API.

## Features
This library makes it trivially easy to start supporting CEC-Remote events and the like for most TV sets. it supports
- Easily send commands to CEC-enabled devices using a ready made library.
- Promise-based API, where applicable.
- TypeScript provides intellisense/type-completion for the entire library.
- Only two node dependencies.

## Planned features:
Features that are currently half implemented or coming to this library are:
- Helper classes for the Television and Receiever commands: Planning to make it easier to send commands to tvs and stereos without knowledge of the CEC protocol.
- More command functions in the Commander class: make it easier for beginners to send commands to any device on the cec-bus.
- Expand examples.
- Add introduction to HDMI-CEC docs.

## Getting started
In order to start using this example, you need to have the cec-client app installed, and (preferably) in your $PATH.
Some pointers on common devices:

### Raspberry PI
On recent Raspberry PI images (jessie+) cec-client is installed by default, with the exception of really bare-minimum images.
If you do need to install it (e.g. `cec-client -h` gives you an error), you can install it using (with a working internet connection):
```bash
sudo apt-get update
sudo apt-get install cec-utils
```

## Example

### Simple remote application:
Typescript:
```typescript
import { Remote } from 'hdmi-cec';

// Create a new Remote helper (called without any arguments, it will create a cec-client process itself, with the default client name)
var remote = new Remote();

// When any button is pressed on the remote, we receive the event:
remote.on('keypress', evt => {
    console.log(`user pressed the key "${evt.key}" with code "${evt.keyCode}"`);
});

// Alternatively, we only wait for the user to press the "select" key
remote.on('keypress.select', () => {
    console.log(`user pressed the select key!`);
});
```

Javascript:
```javascript
var cecRemote = require('hdmi-cec').Remote;

// Create a new Remote helper, with the cec-monitor as argument.
var remote = new cecRemote();

// When any button is pressed on the remote, we receive the event:
remote.on('keypress', function(evt) {
    console.log('user pressed the key "'+ evt.key + '" with code "' + evt.keyCode + '"');
});

// Alternatively, we only wait for the user to press the "select" key
remote.on('keypress.select', function() {
    console.log('user pressed the select key!');
});
```

## Credits
Heavily based upon the work of patlux's node-cec package: https://github.com/patlux/node-cec