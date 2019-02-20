

# default target: run tests

all: native_binaries tests

tests: libSync/native_binary.run \
	libSync/ltc.run \
	libSync/media_file.run \
	libSync/sessions.run

%.run: %.js
	node $<

native_binaries: ffmpeg ltcdump

DOWNLOAD_DIR = downloads

# ffmpeg binaries:

ffmpeg: libSync/win32-x64-bin/ffmpeg.exe \
	libSync/win32-ia32-bin/ffmpeg.exe \
	libSync/darwin-x64-bin/ffmpeg \
	libSync/linux-x64-bin/ffmpeg \
	libSync/linux-ia32-bin/ffmpeg

libSync/win32-x64-bin/ffmpeg.exe:  URL=https://ffmpeg.zeranoe.com/builds/win64/static/ffmpeg-4.1-win64-static.zip
libSync/win32-ia32-bin/ffmpeg.exe: URL=https://ffmpeg.zeranoe.com/builds/win32/static/ffmpeg-4.1-win32-static.zip
libSync/darwin-x64-bin/ffmpeg:     URL=https://ffmpeg.zeranoe.com/builds/macos64/static/ffmpeg-4.1-macos64-static.zip
libSync/linux-x64-bin/ffmpeg:      URL=https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
libSync/linux-ia32-bin/ffmpeg:     URL=https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-i686-static.tar.xz

libSync/win32-%-bin/ffmpeg.exe:
	mkdir -p $(DOWNLOAD_DIR)
	wget -nv -O $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip $(URL)
	mkdir -p $(@D)
	unzip -o -j $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip '*/ffmpeg.exe'  -d $(@D)
	unzip -o -j $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip '*/ffprobe.exe' -d $(@D)
libSync/darwin-x64-bin/ffmpeg:
	mkdir -p $(DOWNLOAD_DIR)
	wget -nv -O $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip $(URL)
	mkdir -p $(@D)
	unzip -o -j $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip '*/ffmpeg'  -d $(@D)
	unzip -o -j $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip '*/ffprobe' -d $(@D)
libSync/linux-%-bin/ffmpeg:
	mkdir -p $(DOWNLOAD_DIR)
	wget -nv -O $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.tar.xz $(URL)
	mkdir -p $(@D)
	tar -xvJf   $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.tar.xz -C $(@D) --wildcards '*/ffmpeg'  --transform='s:.*/::'
	tar -xvJf   $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.tar.xz -C $(@D) --wildcards '*/ffprobe' --transform='s:.*/::'


# ltcdump binaries

ltcdump: libSync/win32-x64-bin/ltcdump.exe \
	libSync/win32-ia32-bin/ltcdump.exe \
	libSync/darwin-x64-bin/ltcdump \
	libSync/linux-x64-bin/ltcdump \
	libSync/linux-ia32-bin/ltcdump

LTCDUMP_VER = v0.7.0
LTCDUMP_ROOT = https://github.com/x42/ltc-tools/releases/download/$(LTCDUMP_VER)

libSync/win32-x64-bin/ltcdump.exe:  DESIGNATOR=w64
libSync/win32-ia32-bin/ltcdump.exe: DESIGNATOR=w32
libSync/darwin-x64-bin/ltcdump:     DESIGNATOR=mac-universal
libSync/linux-x64-bin/ltcdump:      DESIGNATOR=linux-x86_64
libSync/linux-ia32-bin/ltcdump:     DESIGNATOR=linux-i386

libSync/%-bin/ltcdump.exe:
	mkdir -p $(DOWNLOAD_DIR)
	wget -nv -O $(DOWNLOAD_DIR)/$(notdir $(@D))-ltcdump.zip $(LTCDUMP_ROOT)/ltcdump-$(DESIGNATOR)-$(LTCDUMP_VER).zip
	mkdir -p $(@D)
	unzip -o    $(DOWNLOAD_DIR)/$(notdir $(@D))-ltcdump.zip $(@F) -d $(@D)
libSync/%-bin/ltcdump:
	mkdir -p $(DOWNLOAD_DIR)
	wget -nv -O $(DOWNLOAD_DIR)/$(notdir $(@D))-ltcdump.zip $(LTCDUMP_ROOT)/ltcdump-$(DESIGNATOR)-$(LTCDUMP_VER).zip
	mkdir -p $(@D)
	unzip -o    $(DOWNLOAD_DIR)/$(notdir $(@D))-ltcdump.zip $(@F) -d $(@D)


# electron distributions

electron: build/LTCsync-win32-x64.zip \
	build/LTCsync-win32-ia32.zip \
	build/LTCsync-darwin-x64.zip \
	build/LTCsync-linux-x64.zip \
	build/LTCsync-linux-ia32.zip

build/LTCsync-win32-x64.zip:
	electron-packager . --out build --overwrite --ignore 'downloads' --ignore 'libSync/.*-.*-bin' --platform win32  --arch x64
	cp -r libSync/win32-x64-bin  $(basename $@)/resources/app/libSync/
	cd build; zip -r ../$@ $(notdir $(basename $@))
build/LTCsync-win32-ia32.zip:
	electron-packager . --out build --overwrite --ignore 'downloads' --ignore 'libSync/.*-.*-bin' --platform win32  --arch ia32
	cp -r libSync/win32-ia32-bin $(basename $@)/resources/app/libSync/
	cd build; zip -r ../$@ $(notdir $(basename $@))
build/LTCsync-darwin-x64.zip:
	electron-packager . --out build --overwrite --ignore 'downloads' --ignore 'libSync/.*-.*-bin' --platform darwin --arch x64
	cp -r libSync/darwin-x64-bin $(basename $@)/LTCsync.app/Contents/Resources/app/libSync/
	cd build; zip -r ../$@ $(notdir $(basename $@))
build/LTCsync-linux-x64.zip:
	electron-packager . --out build --overwrite --ignore 'downloads' --ignore 'libSync/.*-.*-bin' --platform linux  --arch x64
	cp -r libSync/linux-x64-bin  $(basename $@)/resources/app/libSync/
	cd build; zip -r ../$@ $(notdir $(basename $@))
build/LTCsync-linux-ia32.zip:
	electron-packager . --out build --overwrite --ignore 'downloads' --ignore 'libSync/.*-.*-bin' --platform linux  --arch ia32
	cp -r libSync/linux-ia32-bin $(basename $@)/resources/app/libSync/
	cd build; zip -r ../$@ $(notdir $(basename $@))

clean:
	rm -rf $(DOWNLOAD_DIR) build libSync/*-bin/

.PHONY: clean
