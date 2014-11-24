##stk500
Fully javascript stk500v1 programmer. Allows you to program Arduinos straight from node (or browser for that matter). No more avrdude system calls or using the arduino IDE.

Huge thanks to Pinoccio for their stk500v2 browser implementation (for Arduino Megas, etc) from which I stole whole lines of code. In lieu of properly licensing atm, I'm hoping to unify our work in the future.
https://github.com/Pinoccio/js-stk500

Note for
###Gotchas
* Only works on MacOSX. Requires on Chris Williams excellent nodeserial implementation https://github.com/voodootikigod/node-serialport. However nodeserial doesn't currently support manual rts/dtr signaling so I have a fork with OSX bindings https://github.com/jacobrosenthal/node-serialport/tree/controlsignals
* Since I'm forking nodeserial and not hosting a new version yet I've got a postinstall step that tries to run ./postinstall to kick off a fresh build.
* You'll need a buffer of bytes to program. You can dig a hex out of the Arduino IDE as I did in the uno example for blink and blank and run it through intel-hex. intel-hex isnt actually required by the library currently but included for convenience currently.

###INSTALL
```
npm install stk500
```

####Program:

You need an *unconnected* instance of (my fork of) Chris Williams's Node Serial Port at the correct speed for your chip (commonly 115200) with a raw parser.
```
var serialPort = new SerialPort.SerialPort(port.comName, {
  baudrate: 115200,
  parser: SerialPort.parsers.raw
}, false);

```

Then you can instantiate a programmer.
```
var programmer = new stk500(serialPort);

```

Beyond that you can send stk500 commands. For programming the process is a fairly strict series of async series including connect, reset, sync, setOptions (pagesize is the only necessary option), enterprogrammingmode, program, exitprogrammingmode, disconnect. See uno.js in examples.

###CHANGELOG
0.1.0 
first