/* ltc.js: functions for parsing timestamp data out of audio
 * streams. This implementation uses ltcdump(1) as the backend.
 *
 * Two fundamental pieces of information are out of band for ltcdump:
 * LTC framerate and audio sample rate. Calculations that rely on
 * these must take them as arguments.
 */

const path = require("path");
const nb = require("./native_binary");

const assert = require('assert');

/* A single LTC frame, as reported by a line of `ltcdump' output */
function Frame(str) {
  const fields=str.split(/[ \t|]+/);
  /* [user_bits, timecode, samples_start, samples_end, fw/rv] */

  // ltcdump always reports 5 fields, even for invalid underlying data
  assert.equal(fields.length, 5);

  this.tc=fields[1].split(/[:;\.]/).map(Number);
  this.dropframe = fields[1].charAt(8)!=":";
  const samples = fields.slice(2,4).map(Number);
  this.first_sample = samples[0];
  this.last_sample = samples[1];
  this.reverse = fields[4]=="R";
}
function $Frame() {
  // a typical frame
  let frame = new Frame("00000000   04:49:39:10 |   284200   286199  ");
  assert.deepEqual(frame,
                   {tc:           [04,49,39,10],
                    dropframe:    false,
                    first_sample: 284200,
                    last_sample:  286199,
                    reverse:      false});

  // semicolon indicates drop-frame format
  frame = new Frame("00000000   04:49:39;10 |   284200   286199  ")
  assert(frame.dropframe);

  // spaces at the end of the line are significant...
  assert.throws(() => {
    new Frame("00000000   04:49:33:12 |      193     2201")});

  // ...since ltcdump(1) can parse frames out of reverse-playing audio
  frame = new Frame("00000000   04:49:39:10 |   284200   286199 R");
  assert(frame.reverse===true);
}

/* Wall clock seconds since midnight at the beginning of this
 frame. Takes framerate (e.g., 24, 30/1.001) as an argument since it
 is implicit in LTC and unavailable in ltcdump. */
Frame.prototype.wc_start = function(framerate) {
  const whole_seconds = this.tc[0]*60*60 + this.tc[1]*60 + this.tc[2];
  const frames=whole_seconds*Math.round(framerate) + this.tc[3];
  if (this.dropframe) {
    const whole_minutes=Math.floor(whole_seconds/60);
    const whole_10minutes=Math.floor(whole_seconds/600);
    return (frames-(whole_minutes-whole_10minutes)*2) / framerate;
  } else {
    return frames/framerate;
  }
}
function $Frame$wc_start() {
  // any integer frame rate results in a straightforward number of seconds
  assert.equal(new Frame("00000000   01:00:00:00 |      193     2201  ").wc_start(24), 3600);
  assert.equal(new Frame("00000000   01:00:00:00 |      193     2201  ").wc_start(25), 3600);
  assert.equal(new Frame("00000000   01:00:00:00 |      193     2201  ").wc_start(30), 3600);
  // non-drop-frame 29.97fps hour is about 3.6 seconds longer than a real hour
  assert.equal(new Frame("00000000   01:00:00:00 |      193     2201  ").wc_start(30/1.001), 3603.5999999999995);
  // drop-frame fixes that, almost
  assert.equal(new Frame("00000000   01:00:00;00 |      193     2201  ").wc_start(30/1.001), 3599.9963999999995);

  // one-hour-and-one-frame in standard frame rates
  assert.equal(new Frame("00000000   01:00:00:01 |      193     2201  ").wc_start(24/1.001), 3603.641708333333);
  assert.equal(new Frame("00000000   01:00:00:01 |      193     2201  ").wc_start(24), 3600+1/24);//3600.0416666666665
  assert.equal(new Frame("00000000   01:00:00:01 |      193     2201  ").wc_start(25), 3600+1/25);//3600.04
  assert.equal(new Frame("00000000   01:00:00:01 |      193     2201  ").wc_start(30/1.001), 3603.6333666666665);
  assert.equal(new Frame("00000000   01:00:00;01 |      193     2201  ").wc_start(30/1.001), 3600.029766666666);
  assert.equal(new Frame("00000000   01:00:00:01 |      193     2201  ").wc_start(30), 3600+1/30);//3600.0333333333333
}

/* This frame's offset from the beginning of the stream, in
 seconds. Takes sample rate (e.g., 44100, 48000) as an argument since
 it is unavailable in ltcdump. */
Frame.prototype.fs_seconds = function(sample_rate) {
  return this.first_sample / sample_rate;
}
function $Frame$fs_seconds() {
  // any integer frame rate results in a straightforward number of seconds
  assert.equal(new Frame("00000000   01:00:00:00 |      2400     5400  ").fs_seconds(48000), 0.05);
}


/* LTC frame duration in samples. This is a function rather than a
 method to keep it local to the module. */
function num_samples(frame) {
  // ltcdump reports inclusive sample numbers
  return frame.last_sample + 1 - frame.first_sample;
}



/* A complete dump of decoded LTC frames in a WAV file */
function Dump(text) {
  this.frames = text.split("\n").filter(l => l && !l.startsWith("#")).map(l => new Frame(l));
}

function $Dump() {
  assert.equal(new Dump("#User bits  Timecode   |    Pos. (samples)\n" +
                        "#DISCONTINUITY\n" +
                        "00000000   04:49:33:12 |      193     2201  \n" +
                        "00000000   04:49:33:13 |     2202     4201  \n" +
                        "00000000   04:49:33:14 |     4202     6201  \n" +
                        "00000000   04:49:33:15 |     6202     8201  \n" +
                        "00000000   04:49:33:16 |     8202    10204  \n" +
                        "00000000   04:49:33:17 |    10205    12204  \n" +
                        "00000000   04:49:33:18 |    12205    14204  \n" +
                        "00000000   04:49:33:19 |    14205    16204  \n").frames.length,
               8);
}

function closest_standard_framerate(rate) {
  const d=r => Math.abs(1-r/rate);
  return [24/1.001, 24, 25, 30/1.001, 30].sort((r0, r1) => d(r0) - d(r1))[0];
}
function $closest_standard_framerate() {
  assert.equal(closest_standard_framerate(23.5 ), 24/1.001);
  assert.equal(closest_standard_framerate(23.9 ), 24/1.001);
  assert.equal(closest_standard_framerate(23.98), 24/1.001);
  assert.equal(closest_standard_framerate(23.99), 24);
  assert.equal(closest_standard_framerate(24.45), 24);
  assert.equal(closest_standard_framerate(24.55), 25);
  assert.equal(closest_standard_framerate(29.97), 30/1.001);
  assert.equal(closest_standard_framerate(29.99), 30);
  assert.equal(closest_standard_framerate(30   ), 30);
  assert.equal(closest_standard_framerate(31   ), 30);
}

/* Deduces LTC frame rate from LTC frames and audio sample rate. */
Dump.prototype.framerate = function(sample_rate) {
  const frames = this.frames.slice(1, -1); // first and last frames are often inaccurate
  const avg_samples = frames.map(num_samples).reduce((e0,e1) => e0+e1)/frames.length;
  return closest_standard_framerate(sample_rate / avg_samples);
}

function $Dump$framerate() {
  dump(path.join(__dirname, "../samples/ZOOM0004_Tr1.WAV"),
       (err, dump) => {assert.equal(err, null);
                       assert.equal(dump.framerate(48000), 24)});
  dump(path.join(__dirname, "../samples/LTC_00_58_00_00__1mins_23976.wav"),
       (err, dump) => {assert.equal(err, null);
                       assert.equal(dump.framerate(48000), 24/1.001)});
  dump(path.join(__dirname, "../samples/LTC_00_58_00_00__1mins_24.wav"),
       (err, dump) => {assert.equal(err, null);
                       assert.equal(dump.framerate(48000), 24)});
  dump(path.join(__dirname, "../samples/LTC_00_58_00_00__1mins_25.wav"),
       (err, dump) => {assert.equal(err, null);
                       assert.equal(dump.framerate(48000), 25)});
  // this file appears to have 30fps frames, although with DF flags
  // set and correctly omitting initial frames in a minute
  //dump(path.join(__dirname,  "../samples/LTC_00_58_00_00__1mins_2997_df.wav"),
  //     (err, dump) => {assert.equal(err, null);
  //                     assert.equal(dump.framerate(48000), 30/1.001)});
  dump(path.join(__dirname, "../samples/LTC_00_58_00_00__1mins_2997_ndf.wav"),
       (err, dump) => {assert.equal(err, null);
                       assert.equal(dump.framerate(48000), 30/1.001)});
  dump(path.join(__dirname, "../samples/LTC_00_58_00_00__1mins_30.wav"),
       (err, dump) => {assert.equal(err, null);
                       assert.equal(dump.framerate(48000), 30)});
}

/* Wall clock seconds since midnight at the beginning of this
 stream. Takes sample rate (e.g., 44100, 48000) as an argument since
 it is unavailable in ltcdump. */
Dump.prototype.wc_start = function(sample_rate) {
  // first frame is often unreliable
  const keyframe = this.frames[1];
  return keyframe.wc_start(this.framerate(sample_rate)) -
    keyframe.fs_seconds(sample_rate);
}
function $Dump$wc_start() {
  const dump = new Dump("#User bits  Timecode   |    Pos. (samples)\n" +
                        "#DISCONTINUITY\n" +
                        "00000000   04:49:33:12 |      193     2201  \n" +
                        "00000000   04:49:33:13 |     2202     4201  \n" +
                        "00000000   04:49:33:14 |     4202     6201  \n" +
                        "00000000   04:49:33:15 |     6202     8201  \n" +
                        "00000000   04:49:33:16 |     8202    10204  \n" +
                        "00000000   04:49:33:17 |    10205    12204  \n" +
                        "00000000   04:49:33:18 |    12205    14204  \n" +
                        "00000000   04:49:33:19 |    14205    16204  \n");
  assert.equal(dump.framerate(48000), 24);
  assert.equal(dump.wc_start(48000), (4*60*60 + 49*60 + 33) + 0.495791666668);
}

function ltcq_gaps(dump, total_samples) {
  const samples_in_frames = dump.frames.map(num_samples).reduce((d0, d1) => d0+d1);
  return samples_in_frames / total_samples;
}
function ltcq_timefmt(dump) {
  let q=1.0;
  dump.frames.forEach(f => {
    if (f.tc[0]>23)
      q *= 0.9;
    if (f.tc[1]>59)
      q *= 0.9;
    if (f.tc[2]>59)
      // leap seconds unlikely in this context
      q *= 0.9;
  });
  return q;
}
//function ltcq_frame_duration(dump) {}
//function ltcq_monotinic(dump) {}
//function ltcq_fps(dump) {}
//function ltcq_frame_length(dump) {}
function ltcq_df(dump) {
  return dump.frames.find(f => f.dropframe != dump.frames[0].dropframe) ? 0.75 : 1.0;
}
function ltcq_dir(dump) {
  return dump.frames.find(f => f.reverse != dump.frames[0].reverse) ? 0.75 : 1.0;
}
Dump.prototype.quality = function(duration_s, sample_rate) {
  const num_samples = duration_s * sample_rate;
  if (this.frames.length < 2) {
    return 0;
  } else {
    return ltcq_gaps(this, num_samples) *
      ltcq_timefmt(this) *
      ltcq_df(this) *
      ltcq_dir(this);
  }
}

function $Dump$quality() {
  // ltcdump false positive report on a random song
  const fp_samples = 13987840;
  const fp_sample_rate = 44100;
  const fp_duration_s = fp_samples / fp_sample_rate;
  const fp_dump = new Dump("#User bits  Timecode   |    Pos. (samples)\n" +
                           "#DISCONTINUITY\n" +
                           "949a0405   25:45:01:02 |  8278005  8278848  \n" +
                           "#DISCONTINUITY\n" +
                           "ec2dfff7   00:65:85.45 | 10117311 10118828 R\n" +
                           "#DISCONTINUITY\n" +
                           "17adb9c0   05:35:30:32 | 10604120 10605233 R\n" +
                           "#DISCONTINUITY\n" +
                           "00120400   12:01:20.20 | 11048980 11050254 R\n" +
                           "#DISCONTINUITY\n" +
                           "d9512416   09:13:20:10 | 11342033 11342966  \n" +
                           "#DISCONTINUITY\n" +
                           "60106005   05:08:22.00 | 11441233 11442226 R\n" +
                           "#DISCONTINUITY\n" +
                           "4dff6f7d   25:85:25.17 | 11709639 11709989 R");
  assert.equal(ltcq_gaps(fp_dump, fp_samples),  0.0005025793832357247);
  assert.equal(ltcq_timefmt(fp_dump),           0.5904900000000002);
  assert.equal(ltcq_df(fp_dump),                0.75);
  assert.equal(ltcq_dir(fp_dump),               0.75);
  assert.equal(fp_dump.quality(fp_samples/fp_sample_rate,
                               fp_sample_rate), 0.00016693205625386052);

  const tp_samples = 16205;
  const tp_sample_rate = 48000;
  const tp_duration_s = tp_samples / tp_sample_rate;
  const tp_dump = new Dump("#User bits  Timecode   |    Pos. (samples)\n" +
                           "#DISCONTINUITY\n" +
                           "00000000   04:49:33:12 |      193     2201  \n" +
                           "00000000   04:49:33:13 |     2202     4201  \n" +
                           "00000000   04:49:33:14 |     4202     6201  \n" +
                           "00000000   04:49:33:15 |     6202     8201  \n" +
                           "00000000   04:49:33:16 |     8202    10204  \n" +
                           "00000000   04:49:33:17 |    10205    12204  \n" +
                           "00000000   04:49:33:18 |    12205    14204  \n" +
                           "00000000   04:49:33:19 |    14205    16204  \n");
  assert.equal(ltcq_gaps(tp_dump, tp_samples),  0.9880900956494909);
  assert.equal(ltcq_timefmt(tp_dump),           1.0);
  assert.equal(ltcq_df(tp_dump),                1.0);
  assert.equal(ltcq_dir(tp_dump),               1.0);
  assert.equal(tp_dump.quality(tp_duration_s,
                               tp_sample_rate), 0.9880900956494909);
}


/* Runs ltcdump(1) on a WAV file and reports a Dump in the
 callback. This is the main external entry point to this module. */
function dump(filepath, callback) {
  let output="";
  let error="";
  const ltcdump=nb.spawn("ltcdump", [filepath]);
  ltcdump.stdout.on("data", function(chunk) {
    output+=chunk.toString("ascii");
  });
  ltcdump.stderr.on("data", function(chunk) {
    error+=chunk.toString("ascii");
  });
  ltcdump.on("close", function(code, signal) {
    if (code!=0) {
      callback(new Error(error), null);
    } else {
      callback(null, new Dump(output));
    }
  });
}

function $dump() {
  dump(path.join(__dirname, "../samples/ltc.wav"),
       function(err, dump) {
         assert.equal(err, null);
         assert.equal(dump.frames.length, 143);
         assert.deepEqual(dump.frames[0],
                          {tc:           [04,49,33,12],
                           dropframe:    false,
                           first_sample:    193,
                           last_sample:    2201,
                           reverse:      false});
         assert.deepEqual(dump.frames[dump.frames.length-1],
                          {tc:           [4,49,39,10],
                           dropframe:    false,
                           first_sample: 284200,
                           last_sample:  286199,
                           reverse:      false});
       });
  dump("/non-file/",
       function(err, dump) {
         assert(!dump);
         assert.equal(
           err.message.trim(),
           "Error: This is not a sndfile supported audio file format");
       });
}


if (require.main === module) {
  $Frame();
  $Frame$wc_start();
  $Frame$fs_seconds();
  $Dump();
  $closest_standard_framerate();
  $Dump$framerate();
  $Dump$wc_start();
  $Dump$quality();
  $dump();
} else {
  module.exports.Frame = Frame;
  module.exports.Dump = Dump;

  module.exports.dump = dump;
}
