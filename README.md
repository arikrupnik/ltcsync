# LTCsync: a desktop utility for syncing media files

LTCsync is a post-production tool for dual-system sound and multi-camera workflows.
Productions use Tentacle Sync, Lockit, and similar devices to embed timecode (LTC) in audio tracks of cameras and audio recorders.
LTCsync extracts this timecode and exports files that NLEs can import directly, with your media all in sync.

LTCsync runs on MacOS, Windows and Linux.

**Current status**: LTCsync reads media files in many different formats and correctly identifies relative start times.
`File -> Generate Padding Files` builds blank files you can use to position your sources on an NLE timeline.
For example, if `B.MOV` starts 2.5 seconds after `A.WAV`, LTCsync generates `B-LTCsyncPAD.MOV` that is 2.5 seconds of black and silence.
Frame rate, audio sample rate, dimensions, etc. in `B-LTCsyncPAD.MOV` follow as closely as possible the format of `B.MOV`.


![screenshot](samples/LTCsync-screenshot.png)

If you're looking for background on Linear Timecode (LTC), this Wikipedia [article](https://en.wikipedia.org/wiki/Linear_timecode) may be a useful starting point.
The [technical specification](https://www.itu.int/dms_pubrec/itu-r/rec/br/R-REC-BR.780-2-200504-W!!PDF-E.pdf) is available from the International Telecommunications Union.

**System Requirements**

macOS 10.10 or higher; Windows 7 or higher; any reasonably modern Linux.
We provide pre-built binaries for 64-bit OSs.
32-bit x86 targets for Windows and Linux are available in the Makefile and we can provide binaries on demand.
We'd be curious to hear about your setup if you need those.
