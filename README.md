# LTCsync: a desktop utility for syncing media files

LTCsync is a post-production tool for dual-system sound and multi-camera workflows.
Productions use Tentacle Sync, Lockit, and similar devices to embed timecode (LTC) in audio tracks of cameras and audio recorders.
LTCsync extracts this timecode and exports files that NLEs can import directly, with your media all in sync.

LTCsync runs on MacOS, Windows and Linux.

**Current status**: LTCsync reads media files in many different formats and correctly identifies relative start times in read-only mode.

**Next milestone**: write out information that allows an NLE to line up the files on a timeline.

![screenshot](samples/LTCsync-screenshot.png)

If you're looking for background on Linear Timecode (LTC), this Wikipedia [article](https://en.wikipedia.org/wiki/Linear_timecode) may be a useful starting point.
The [technical specification](https://www.itu.int/dms_pubrec/itu-r/rec/br/R-REC-BR.780-2-200504-I!!PDF-E.pdf) is available from the International Telecommunications Union.
