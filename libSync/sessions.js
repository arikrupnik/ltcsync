

const path = require("path");
const mf = require("./media_file");

const assert = require("assert");


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
    const files_with_ltc = this.files.filter(f => f.bounds().start);
    if (!files_with_ltc.length) {
      return new mf.Bounds(
        null,
        this.files.map(f => f.bounds().duration).reduce((acc, d) => Math.max(acc, d)));
    } else {
      return files_with_ltc.map(f=>f.bounds()).reduce((acc, b) => acc.union(b));
    }
  }
}
function $FileGroup$bounds() {
  const mf0 = new mf.MediaFile({format: {duration: "2"}}, {start_time: 1});
  mf0.wc_start = () => 1;
  const mf1 = new mf.MediaFile({format: {duration: "2"}}, {start_time: 2});
  mf1.wc_start = () => 2;
  const group_with_ltc = new FileGroup();
  group_with_ltc.files = [mf0, mf1];
  assert.deepEqual(group_with_ltc.bounds(), new mf.Bounds(1, 3));

  const group_without_ltc = new FileGroup();
  group_without_ltc.files = [
    new mf.MediaFile({format: {duration: "2"}}, []),
    new mf.MediaFile({format: {duration: "1"}}, []),
  ];
  assert.deepEqual(group_without_ltc.bounds(), new mf.Bounds(null, 2));
}

FileGroup.prototype.compare = function(group) {
  return this.bounds().start-group.bounds().start;
}
function $FileGroup$compare() {
  const mf1 = new mf.MediaFile({format: {duration: "2"}});
  const mf2 = new mf.MediaFile({format: {duration: "2"}});
  const mf3 = new mf.MediaFile({format: {duration: "2"}});
  mf1.wc_start = () => 1;
  mf2.wc_start = () => 2;
  mf3.wc_start = () => 3;
  const g0 = new FileGroup();
  g0.files = [mf1, mf2];
  const g1 = new FileGroup();
  g1.files = [mf2, mf3];
  assert(g0.compare(g1) < 0);
  assert(g1.compare(g0) > 0);
}

FileGroup.prototype.add_file = function(file) {
  this.files.push(file);
  return this;
}


/* Returns false for files that ffmpeg interpers in its own way, but
 * which are neither audio nor video. Examples include some image
 * files (which ffmpeg interprets as single-frame sequences), media
 * containers with data-only streams, etc. */
function has_valid_streams(mediafile) {
  if (mediafile.ffprobe.streams.find(s => s.codec_type=="audio")) {
    return true;
  } else if (mediafile.ffprobe.streams.find(s => s.codec_type=="video" && s.duration_ts > 1)) {
    return true;
  } else {
    return false;
  }
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
EditingSession.prototype.add_file = function(mediafile, err_callback) {
  if (!has_valid_streams(mediafile)) {
    err_callback && err_callback(new Error(`file has no video or audio streams: ${mediafile.ffprobe.format.filename}`));
    return false;
  } else if (this.all_files().find(f => f.ffprobe.format.filename===mediafile.ffprobe.format.filename)) {
    // file is already in the session
    err_callback && err_callback(new Error(`duplicate file: ${mediafile.ffprobe.format.filename}`));
    return false;
  } else if (mediafile.bounds().start===null) {
    // no timecode information, but maybe a file from the same recording and with LTC already exists in this session
    const related_ltc_file = this.all_files().find(f => f.from_same_recording_session(mediafile) && f.has_ltc());
    if (related_ltc_file) {
      mediafile.ltc_file = related_ltc_file;
      return this.add_file(mediafile);
    } else {
      this.non_ltc_files.add_file(mediafile);
      return mediafile;
    }
  } else {
    const overlaps_with = this.groups.filter(g => g.bounds().overlap(mediafile.bounds()));
    if (overlaps_with.length==0) {
      this.groups.push((new FileGroup()).add_file(mediafile));
    } else if (overlaps_with.length==1) {
      overlaps_with[0].add_file(mediafile);
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
      conjunction.add_file(mediafile);
    }
    // if this file is from the same recording session as some existing, non-ltc files, refile them
    const related_files = this.non_ltc_files.files.filter(f => f.from_same_recording_session(mediafile));
    if (related_files.length) {
      this.non_ltc_files.files = this.non_ltc_files.files.filter(f => !f.from_same_recording_session(mediafile));
      related_files.forEach(f => {
        f.ltc_file = mediafile;
        this.add_file(f);
      });
    }
    return mediafile;
  }
}
function $EditingSession$add_file() {
  function stub_file(name, start, duration) {
    const f = new mf.MediaFile(
      {format: {filename: name, duration: duration},
       streams: [{codec_type: "audio"}]}, []);
    f.wc_start = () => start;
    return f;
  }
  const e = new EditingSession();
  assert.equal(e.groups.length, 0);
  assert.equal(e.all_files().length, 0);

  // first file, goes to its own group
  assert(e.add_file(stub_file("one.mp4", 1, 2)));
  assert.equal(e.groups.length, 1);
  assert.equal(e.groups[0].files.length, 1);
  assert.deepEqual(e.groups[0].bounds(), new mf.Bounds(1, 2));
  assert.equal(e.all_files().length, 1);

  // non-overlapping, goes to its own group
  assert(e.add_file(stub_file("two.mp4", 4, 1)));
  assert.equal(e.groups.length, 2);
  assert.equal(e.groups[1].files.length, 1);
  assert.deepEqual(e.groups[1].bounds(), new mf.Bounds(4, 1));
  assert.equal(e.all_files().length, 2);

  // overlaps with "one.mp4", goes to that group
  assert(e.add_file(stub_file("three.mp4", 2, 1.5)));
  assert.equal(e.groups.length, 2);
  assert.equal(e.groups[0].files.length, 2);
  assert.deepEqual(e.groups[0].bounds(), new mf.Bounds(1, 2.5));
  assert.equal(e.all_files().length, 3);

  // bridges both groups
  assert(e.add_file(stub_file("four.mp4", 2, 2)));
  assert.equal(e.groups.length, 1);
  assert.equal(e.groups[0].files.length, 4);
  assert.deepEqual(e.groups[0].bounds(), new mf.Bounds(1, 4));
  assert.equal(e.all_files().length, 4);

  // attempting to add a file that already exists modifies nothing and
  // returns false
  assert(!e.add_file(stub_file("four.mp4", 2, 2), err => assert(err.message.startsWith("duplicate file: "))));
  assert.equal(e.all_files().length, 4);

  // adding a file with no LTC frames
  const non_ltc = stub_file("non-ltc.mov", null, 10);
  non_ltc.lct = null;
  assert(e.add_file(non_ltc));

  // nothing has changed in the LTC groups...
  assert.equal(e.groups.length, 1);
  assert.equal(e.groups[0].files.length, 4);
  assert.deepEqual(e.groups[0].bounds(), new mf.Bounds(1, 4));
  // ..but overall file count has gone up
  assert.equal(e.all_files().length, 5);
  // and this file ends up in the approapriate group:
  assert.equal(e.non_ltc_files.files.length, 1);

  // files from one recording session group together
  mf.probe_file(path.join(__dirname, "../samples/ZOOM0004_LR.WAV"), (err, z_lr) => {
    assert.equal(err, null);
    assert(!z_lr.bounds().start);
    mf.probe_file(path.join(__dirname, "../samples/ZOOM0004_Tr1.WAV"), (err, z_tr1) => {
      assert.equal(err, null);
      assert(z_tr1.bounds().start);
      mf.probe_file(path.join(__dirname, "../samples/ZOOM0004_Tr2.WAV"), (err, z_tr2) => {
        assert.equal(err, null);
        assert(!z_tr2.bounds().start);

        // add file with LTC first
        const e = new EditingSession();
        e.add_file(z_tr1);
        e.add_file(z_tr2);
        e.add_file(z_lr);
        // all three files end up in one group
        assert.equal(e.groups.length, 1);
        assert.equal(e.groups[0].files.length, 3);
        // and none end up in NON-LTC group, even though only tr1 has actual ltc
        assert.equal(e.non_ltc_files.files.length, 0);
      });
    });
  });
  mf.probe_file(path.join(__dirname, "../samples/ZOOM0004_LR.WAV"), (err, z_lr) => {
    assert.equal(err, null);
    assert(!z_lr.bounds().start);
    mf.probe_file(path.join(__dirname, "../samples/ZOOM0004_Tr1.WAV"), (err, z_tr1) => {
      assert.equal(err, null);
      assert(z_tr1.bounds().start);
      mf.probe_file(path.join(__dirname, "../samples/ZOOM0004_Tr2.WAV"), (err, z_tr2) => {
        assert.equal(err, null);
        assert(!z_tr2.bounds().start);

        // add file with LTC last
        const e = new EditingSession();
        e.add_file(z_tr2);
        e.add_file(z_lr);
        e.add_file(z_tr1);
        // all three files end up in one group
        assert.equal(e.groups.length, 1);
        assert.equal(e.groups[0].files.length, 3);
        // and none end up in NON-LTC group, even though only tr1 has actual ltc
        assert.equal(e.non_ltc_files.files.length, 0);
      });
    });
  });

  // ffprobe reports some still images and even text as one-frame videos
  mf.probe_file(path.join(__dirname, "../samples/LTCsync-screenshot.png"), (err, png) => {
    assert.equal(err, null);    // file exists and ffmpeg interprets it in its way
    mf.probe_file(path.join(__dirname, "../samples/buster.jpg"), (err, jpg) => {
      assert.equal(err, null);
      mf.probe_file(path.join(__dirname, "../samples/plain.txt"), (err, txt) => {
        assert.equal(err, null);
        const e = new EditingSession();
        assert(!e.add_file(png, err => assert(err.message.startsWith("file has no video or audio streams:"))));
        assert(!e.add_file(jpg, err => assert(err.message.startsWith("file has no video or audio streams:"))));
        assert(!e.add_file(txt, err => assert(err.message.startsWith("file has no video or audio streams:"))));
        assert.equal(e.all_files().length, 0);
      });
    });
  });
}


if (require.main === module) {
  $FileGroup$bounds();
  $FileGroup$compare();
  $EditingSession$add_file();
} else {
  module.exports.FileGroup = FileGroup;
  module.exports.EditingSession = EditingSession;
}
