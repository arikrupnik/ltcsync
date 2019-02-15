

const path = require("path");
const assert = require("assert");
const tm = require("./timing_metadata");

const ffprobe = require("./ffprobe").ffprobe;

/* A group of files that overlap temporally. Users typically want to
 * synchronize files in a group to the same timeline. Conversely,
 * files in different groups have no overlap and belong on separate
 * timelines. */
function FileGroup() {
  this.files = [];
}
FileGroup.prototype.bounds = function() {
  if (!this.files.length) {
    return null;
  } else {
    const files_with_ltc = this.files.filter(f => f.ltc);
    if (!files_with_ltc.length) {
      return new tm.Bounds(
        null,
        this.files.map(f => eval(f.ffprobe.format.duration)).reduce((acc, d) => Math.max(acc, d)));
    } else {
      return files_with_ltc.map(
        f=>f.ltc.bounds).reduce(
          (acc, t) =>
            new tm.Bounds(
              Math.min(acc.start, t.start),
              Math.max(acc.end, t.end)))
    }
  }
}
function $FileGroup$bounds() {
  const group_with_ltc = new FileGroup();
  group_with_ltc.files = [
    {ltc: {bounds: new tm.Bounds(1, 3)}},
    {ltc: {bounds: new tm.Bounds(2, 4)}},
  ];
  assert.equal(group_with_ltc.bounds().start, 1);
  assert.equal(group_with_ltc.bounds().end, 4);
  assert.equal(group_with_ltc.bounds().duration(), 3);

  const group_without_ltc = new FileGroup();
  group_without_ltc.files = [
    {ffprobe: {format: {duration: "2"}}},
    {ffprobe: {format: {duration: "1"}}},
  ];
  assert.equal(group_without_ltc.bounds().start, null);
  assert.equal(group_without_ltc.bounds().end, 2);
  assert.equal(group_without_ltc.bounds().duration(), 2);
}
FileGroup.prototype.add_file = function(file) {
  this.files.push(file);
  return this;
}

/* The state of a user-visible editing environment */
function EditingSession() {
  this.groups = [];
  this.non_ltc_files = new FileGroup();
}
EditingSession.prototype.all_files = function() {
  return this.groups.concat(this.non_ltc_files).map(
    g => g.files).reduce(
      (acc, fs) => acc.concat(fs),
      []);
}
EditingSession.prototype.add_file = function(file) {
  if (this.all_files().find(
    f => f.ffprobe.format.filename===file.ffprobe.format.filename)) {
    return false;
  } else if (!file.ltc) {
    this.non_ltc_files.add_file(file);
    return file;
  } else {
    const overlaps_with = this.groups.filter(g => g.bounds().overlap(file.ltc.bounds));
    if (overlaps_with.length==0) {
      this.groups.push((new FileGroup()).add_file(file));
    } else if (overlaps_with.length==1) {
      overlaps_with[0].add_file(file);
    } else {
      // the file overlaps with multiple, non-overlapping groups--this
      // means the file is a bridge between these groups, and with the
      // addition of this file, the groups must combine into a single,
      // larger group
      const conjunction = new FileGroup();
      this.groups.push(conjunction);
      overlaps_with.forEach(g => {
        g.files.forEach(f => conjunction.add_file(f));
        this.groups[this.groups.findIndex(e => e===g)]=null;
      });
      this.groups = this.groups.filter(g => g);
      conjunction.add_file(file);
    }
    return file;
  }
}
function $EditingSession$add_file() {
  function stub_file(name, start, end) {
    return {
      ffprobe: {format: {filename: name}},
      ltc: {bounds: new tm.Bounds(start, end)}
    };
  }
  const e = new EditingSession();
  assert.equal(e.groups.length, 0);
  assert.equal(e.all_files().length, 0);

  assert(e.add_file(stub_file("one.mp4", 1, 3)));
  assert.equal(e.groups.length, 1);
  assert.equal(e.groups[0].files.length, 1);
  assert.deepEqual(e.groups[0].bounds(), new tm.Bounds(1, 3));
  assert.equal(e.all_files().length, 1);

  assert(e.add_file(stub_file("two.mp4", 4, 5)));
  assert.equal(e.groups.length, 2);
  assert.equal(e.groups[1].files.length, 1);
  assert.deepEqual(e.groups[1].bounds(), new tm.Bounds(4, 5));
  assert.equal(e.all_files().length, 2);

  assert(e.add_file(stub_file("three.mp4", 2, 3.5)));
  assert.equal(e.groups.length, 2);
  assert.equal(e.groups[0].files.length, 2);
  assert.deepEqual(e.groups[0].bounds(), new tm.Bounds(1, 3.5));
  assert.equal(e.all_files().length, 3);

  assert(e.add_file(stub_file("four.mp4", 2, 4)));
  assert.equal(e.groups.length, 1);
  assert.equal(e.groups[0].files.length, 4);
  assert.deepEqual(e.groups[0].bounds(), new tm.Bounds(1, 5));
  assert.equal(e.all_files().length, 4);

  // attempting to add a file that already exists modifies nothing and
  // returns false
  assert(!e.add_file(stub_file("four.mp4", 2, 4)));

  // adding a file with no LTC frames
  assert(e.add_file({ffprobe: {format: {filename: "non-ltc.mov"}}, ltc: null}));
  // nothing has changed in the LTC groups...
  assert.equal(e.groups.length, 1);
  assert.equal(e.groups[0].files.length, 4);
  assert.deepEqual(e.groups[0].bounds(), new tm.Bounds(1, 5));
  // ..but overall file count has gone up
  assert.equal(e.all_files().length, 5);
  // and this file ends up in the approapriate group:
  assert.equal(e.non_ltc_files.files.length, 1);
}


/* Some audio recorders, e.g., ZOOM, record multiple tracks from the
 * same session in separate files. */
function from_same_recording_session(ffprobes) {
  for (let f of ffprobes) {
    if (f.streams.length!=1 ||
        f.streams[0].codec_type!="audio" ||
        f.streams[0].duration_ts!=ffprobes[0].streams[0].duration_ts) {
      return false;
    }
    return true;
  }
}

function $from_same_recording_session() {
  let ffprobes = [];

  function l_ffprobe(path) {
    let nf=ffprobes.length;
    ffprobes[nf]=null;
    ffprobe(path, (err, f) => {
      if (err) {
        throw err;
      } else {
        ffprobes[nf] = f;
        if (ffprobes.every(e => e)) {
          // all ffprobe processes have returned
          assert(from_same_recording_session(ffprobes.slice(0,3)));
          assert(!from_same_recording_session(ffprobes.slice(3)));
        }
      }
    });
  }
  l_ffprobe(path.join(__dirname,
                      "../../samples/2018-12-11/ZOOM0004_LR.WAV"));
  l_ffprobe(path.join(__dirname,
                      "../../samples/2018-12-11/ZOOM0004_Tr1.WAV"));
  l_ffprobe(path.join(__dirname,
                      "../../samples/2018-12-11/ZOOM0004_Tr2.WAV"));
  l_ffprobe(path.join(__dirname,
                      "../../samples/2018-12-11/MVI_8032.MOV"));
}




if (require.main === module) {
  $FileGroup$bounds();
  $EditingSession$add_file();
  $from_same_recording_session();
} else {
  module.exports.FileGroup = FileGroup;
  module.exports.EditingSession = EditingSession;
  module.exports.from_same_recording_session = from_same_recording_session;
}
